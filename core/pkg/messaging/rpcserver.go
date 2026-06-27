package messaging

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/vibe-c2/vibe-c2-golang-protocol/protocol"
	"github.com/wagslane/go-rabbitmq"
	"go.uber.org/zap"
)

// AMQP topology for the lifecycle RPC surface (see contract amqp-conventions.md).
const (
	coreRPCExchange = "vibe.core.rpc" // direct
	coreRPCQueue    = "vibe.core.rpc" // competing consumers across core instances
	coreRPCKey      = "core"
	deadLetterXName = "vibe.dlx"
)

// OpHandler handles one RPC operation. It returns the reply payload on success,
// or an error. An *RPCError carries a stable contract code; any other error
// becomes an internal_error reply.
type OpHandler func(ctx context.Context, req Envelope) (payload any, err error)

// replyPublisher is the seam that lets us unit-test dispatch + reply building
// without a live broker. The production implementation publishes to the default
// exchange (direct reply-to). data is the marshalled reply envelope.
type replyPublisher interface {
	publishReply(replyTo, correlationID string, data []byte) error
}

// RPCServer consumes vibe.core.rpc and dispatches by envelope `type`. Core acts
// as the RPC server for the module-lifecycle control plane.
type RPCServer struct {
	conn     *rabbitmq.Conn
	logger   *zap.Logger
	handlers map[string]OpHandler

	consumer  *rabbitmq.Consumer
	publisher *rabbitmq.Publisher
}

// NewRPCServer builds the server over an existing connection. Handlers are
// registered with RegisterHandler before Start.
func NewRPCServer(conn *rabbitmq.Conn, logger *zap.Logger) *RPCServer {
	return &RPCServer{
		conn:     conn,
		logger:   logger.With(zap.String("component", "rpc-server")),
		handlers: make(map[string]OpHandler),
	}
}

// RegisterHandler binds an operation type (e.g. "module.register") to a handler.
func (s *RPCServer) RegisterHandler(opType string, h OpHandler) {
	s.handlers[opType] = h
}

// Start declares the topology, opens the reply publisher, and begins consuming
// in a background goroutine (Consumer.Run blocks for reconnect handling).
func (s *RPCServer) Start() error {
	pub, err := rabbitmq.NewPublisher(s.conn) // default exchange for direct reply-to
	if err != nil {
		return fmt.Errorf("rpc reply publisher: %w", err)
	}
	s.publisher = pub

	consumer, err := rabbitmq.NewConsumer(
		s.conn,
		coreRPCQueue,
		rabbitmq.WithConsumerOptionsRoutingKey(coreRPCKey),
		rabbitmq.WithConsumerOptionsExchangeName(coreRPCExchange),
		rabbitmq.WithConsumerOptionsExchangeKind("direct"),
		rabbitmq.WithConsumerOptionsExchangeDurable,
		rabbitmq.WithConsumerOptionsExchangeDeclare,
		rabbitmq.WithConsumerOptionsQueueDurable,
		// Route rejected/undeliverable messages to the shared DLX.
		rabbitmq.WithConsumerOptionsQueueArgs(rabbitmq.Table{
			"x-dead-letter-exchange": deadLetterXName,
		}),
	)
	if err != nil {
		return fmt.Errorf("rpc consumer: %w", err)
	}
	s.consumer = consumer

	rp := &amqpReplyPublisher{pub: pub}
	go func() {
		runErr := consumer.Run(func(d rabbitmq.Delivery) rabbitmq.Action {
			return s.handleDelivery(rp, d.CorrelationId, d.ReplyTo, d.Body)
		})
		if runErr != nil {
			s.logger.Error("rpc consumer stopped", zap.Error(runErr))
		}
	}()

	s.logger.Info("RPC server started",
		zap.String("exchange", coreRPCExchange),
		zap.String("queue", coreRPCQueue),
		zap.Int("handlers", len(s.handlers)),
	)
	return nil
}

// Stop closes the consumer and reply publisher.
func (s *RPCServer) Stop() {
	if s.consumer != nil {
		s.consumer.Close()
	}
	if s.publisher != nil {
		s.publisher.Close()
	}
}

// handleDelivery parses, validates, dispatches, and replies. It returns the
// AMQP action: Ack on a handled message (success OR error reply — the reply
// carries the failure), NackDiscard on an unparseable/unroutable message so it
// dead-letters rather than poison-looping. It is broker-agnostic (takes the
// reply seam + raw fields), which is what the unit tests drive.
func (s *RPCServer) handleDelivery(rp replyPublisher, correlationID, replyTo string, body []byte) rabbitmq.Action {
	var req Envelope
	if err := json.Unmarshal(body, &req); err != nil {
		s.logger.Warn("discarding unparseable RPC message", zap.Error(err))
		return rabbitmq.NackDiscard
	}
	// The broker delivery's correlation_id / reply_to are authoritative for
	// routing the reply; mirror correlation_id into the envelope so handlers
	// and NewReply echo it consistently.
	if req.CorrelationID == "" {
		req.CorrelationID = correlationID
	}

	if replyTo == "" {
		// Nothing to reply to — a lifecycle op with no reply queue is malformed.
		s.logger.Warn("discarding RPC message with no reply_to",
			zap.String("type", req.Type))
		return rabbitmq.NackDiscard
	}

	reply := s.dispatch(req)

	data, err := json.Marshal(reply)
	if err != nil {
		s.logger.Error("failed to marshal reply", zap.Error(err))
		return rabbitmq.NackDiscard
	}
	if err := rp.publishReply(replyTo, correlationID, data); err != nil {
		s.logger.Error("failed to publish reply", zap.Error(err),
			zap.String("reply_to", replyTo))
		// The request was processed; failing to deliver the reply is not a
		// reason to reprocess (handlers may not be idempotent beyond register).
		return rabbitmq.Ack
	}
	return rabbitmq.Ack
}

// dispatch validates version + type and runs the handler, returning the reply
// envelope (success or error). Pure given the handler map — directly testable.
func (s *RPCServer) dispatch(req Envelope) ReplyEnvelope {
	major, ok := protocol.MajorVersion(req.Version)
	if !ok || major != SupportedMajor {
		return NewErrorReply(req, CodeUnsupportedVersion,
			fmt.Sprintf("unsupported contract version %q (core serves major %d)", req.Version, SupportedMajor))
	}

	handler, ok := s.handlers[req.Type]
	if !ok {
		return NewErrorReply(req, CodeValidationFailed,
			fmt.Sprintf("unknown operation type %q", req.Type))
	}

	payload, err := handler(context.Background(), req)
	if err != nil {
		var rpcErr *RPCError
		if asRPCError(err, &rpcErr) {
			return NewErrorReply(req, rpcErr.Code, rpcErr.Message)
		}
		s.logger.Error("handler returned internal error",
			zap.String("type", req.Type), zap.Error(err))
		return NewErrorReply(req, CodeInternalError, "internal error")
	}

	reply, err := NewReply(req, payload)
	if err != nil {
		s.logger.Error("failed to build reply payload",
			zap.String("type", req.Type), zap.Error(err))
		return NewErrorReply(req, CodeInternalError, "internal error")
	}
	return reply
}

// asRPCError reports whether err is (or wraps) an *RPCError and, if so, sets *target.
func asRPCError(err error, target **RPCError) bool {
	for err != nil {
		if re, ok := err.(*RPCError); ok {
			*target = re
			return true
		}
		u, ok := err.(interface{ Unwrap() error })
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}

// amqpReplyPublisher publishes the reply to the default exchange with the
// routing key = the request's reply_to (RabbitMQ direct reply-to), echoing the
// correlation_id. This is the only broker-touching part of the dispatch path.
type amqpReplyPublisher struct {
	pub *rabbitmq.Publisher
}

func (a *amqpReplyPublisher) publishReply(replyTo, correlationID string, data []byte) error {
	return a.pub.Publish(
		data,
		[]string{replyTo},
		rabbitmq.WithPublishOptionsExchange(""), // default exchange
		rabbitmq.WithPublishOptionsCorrelationID(correlationID),
		rabbitmq.WithPublishOptionsContentType("application/json"),
	)
}
