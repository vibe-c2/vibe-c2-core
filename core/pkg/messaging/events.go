package messaging

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/wagslane/go-rabbitmq"
	"go.uber.org/zap"
)

// eventsExchange is the topic exchange for module → core event notifications.
// Core also publishes lifecycle audit events here so other subscribers can
// observe registration state changes.
const eventsExchange = "vibe.events"

// EventPublisher publishes envelopes to the vibe.events topic exchange.
type EventPublisher struct {
	pub    *rabbitmq.Publisher
	logger *zap.Logger
}

// NewEventPublisher declares the events exchange and opens a publisher on it.
func NewEventPublisher(conn *rabbitmq.Conn, logger *zap.Logger) (*EventPublisher, error) {
	pub, err := rabbitmq.NewPublisher(
		conn,
		rabbitmq.WithPublisherOptionsExchangeName(eventsExchange),
		rabbitmq.WithPublisherOptionsExchangeKind("topic"),
		rabbitmq.WithPublisherOptionsExchangeDurable,
		rabbitmq.WithPublisherOptionsExchangeDeclare,
	)
	if err != nil {
		return nil, fmt.Errorf("events publisher: %w", err)
	}
	return &EventPublisher{pub: pub, logger: logger.With(zap.String("component", "event-publisher"))}, nil
}

// Publish sends env to the events exchange under routingKey.
func (e *EventPublisher) Publish(ctx context.Context, routingKey string, env Envelope) error {
	data, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}
	return e.pub.PublishWithContext(
		ctx,
		data,
		[]string{routingKey},
		rabbitmq.WithPublishOptionsExchange(eventsExchange),
		rabbitmq.WithPublishOptionsContentType("application/json"),
		rabbitmq.WithPublishOptionsMessageID(env.MessageID),
	)
}

// Close releases the publisher.
func (e *EventPublisher) Close() {
	if e != nil && e.pub != nil {
		e.pub.Close()
	}
}
