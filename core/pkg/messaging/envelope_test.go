package messaging

// The wire types, ULID generation, and version parsing are owned and tested by
// the shared protocol module. These tests cover only the core-side layer: the
// source-stamping wrappers, RPCError handling, and the RPC server dispatch.
import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/wagslane/go-rabbitmq"
	"go.uber.org/zap"
)

func TestNewReply_EchoesCorrelationAndType(t *testing.T) {
	req := Envelope{
		MessageID:     "req-msg",
		CorrelationID: "corr-123",
		Type:          "module.register",
		Version:       "1.0",
	}

	reply, err := NewReply(req, map[string]any{"registered": true})
	if err != nil {
		t.Fatalf("NewReply error: %v", err)
	}

	if reply.CorrelationID != "corr-123" {
		t.Errorf("correlation_id = %q, want corr-123", reply.CorrelationID)
	}
	if reply.Type != "module.register" {
		t.Errorf("type = %q, want module.register", reply.Type)
	}
	if reply.Status != StatusOK {
		t.Errorf("status = %q, want %q", reply.Status, StatusOK)
	}
	if reply.Error != nil {
		t.Errorf("error = %+v, want nil on success", reply.Error)
	}
	if reply.Source.Service != ServiceCore {
		t.Errorf("source.service = %q, want %q", reply.Source.Service, ServiceCore)
	}
	if _, err := ulid.Parse(reply.MessageID); err != nil {
		t.Errorf("reply message_id %q not a ULID: %v", reply.MessageID, err)
	}

	// Timestamp must parse as RFC3339 and be UTC with ms precision.
	ts, err := time.Parse(time.RFC3339, reply.Timestamp)
	if err != nil {
		t.Errorf("timestamp %q not RFC3339: %v", reply.Timestamp, err)
	}
	if ts.Location() != time.UTC {
		t.Errorf("timestamp not UTC: %v", ts.Location())
	}

	var payload map[string]any
	if err := json.Unmarshal(reply.Payload, &payload); err != nil {
		t.Fatalf("payload not valid JSON: %v", err)
	}
	if payload["registered"] != true {
		t.Errorf("payload registered = %v, want true", payload["registered"])
	}
}

func TestNewReply_NilPayloadIsEmptyObject(t *testing.T) {
	reply, err := NewReply(Envelope{Version: "1.0"}, nil)
	if err != nil {
		t.Fatalf("NewReply error: %v", err)
	}
	if string(reply.Payload) != "{}" {
		t.Errorf("nil payload = %q, want {}", string(reply.Payload))
	}
}

func TestNewErrorReply_Shape(t *testing.T) {
	req := Envelope{CorrelationID: "corr-9", Type: "module.heartbeat", Version: "1.0"}
	reply := NewErrorReply(req, CodeUnknownInstance, "no such instance")

	if reply.Status != StatusError {
		t.Errorf("status = %q, want %q", reply.Status, StatusError)
	}
	if reply.Error == nil || reply.Error.Code != CodeUnknownInstance {
		t.Fatalf("error block = %+v, want code %q", reply.Error, CodeUnknownInstance)
	}
	if reply.Error.Message != "no such instance" {
		t.Errorf("error message = %q", reply.Error.Message)
	}
	if reply.CorrelationID != "corr-9" {
		t.Errorf("correlation_id = %q, want corr-9", reply.CorrelationID)
	}
	if string(reply.Payload) != "{}" {
		t.Errorf("error payload = %q, want {}", string(reply.Payload))
	}
}

func TestReplyEnvelope_RoundTrip(t *testing.T) {
	req := Envelope{CorrelationID: "c1", Type: "module.register", Version: "1.0"}
	reply, err := NewReply(req, map[string]any{"instance": "http-1"})
	if err != nil {
		t.Fatalf("NewReply: %v", err)
	}

	data, err := json.Marshal(reply)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got ReplyEnvelope
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got.CorrelationID != reply.CorrelationID || got.Status != reply.Status {
		t.Errorf("round-trip mismatch: got %+v want %+v", got, reply)
	}
	// error must serialize as explicit null on success.
	var asMap map[string]json.RawMessage
	_ = json.Unmarshal(data, &asMap)
	if string(asMap["error"]) != "null" {
		t.Errorf("error field = %s, want null", asMap["error"])
	}
}

func TestAsRPCError(t *testing.T) {
	base := &RPCError{Code: CodeValidationFailed, Message: "bad"}

	var target *RPCError
	if !asRPCError(base, &target) || target.Code != CodeValidationFailed {
		t.Fatalf("direct RPCError not matched")
	}

	wrapped := fmtWrap(base)
	target = nil
	if !asRPCError(wrapped, &target) || target.Code != CodeValidationFailed {
		t.Fatalf("wrapped RPCError not matched")
	}

	target = nil
	if asRPCError(errors.New("plain"), &target) {
		t.Fatalf("plain error should not match RPCError")
	}
}

// fmtWrap wraps err so the Unwrap path in asRPCError is exercised.
func fmtWrap(err error) error {
	return &wrapErr{err: err}
}

type wrapErr struct{ err error }

func (w *wrapErr) Error() string { return "wrapped: " + w.err.Error() }
func (w *wrapErr) Unwrap() error { return w.err }

// dispatchTestServer builds an RPCServer with the given handlers for dispatch tests.
func dispatchTestServer(handlers map[string]OpHandler) *RPCServer {
	s := NewRPCServer(nil, zap.NewNop())
	s.handlers = handlers
	return s
}

func TestDispatch_UnsupportedVersion(t *testing.T) {
	s := dispatchTestServer(map[string]OpHandler{})
	reply := s.dispatch(Envelope{Type: "module.register", Version: "2.0"})
	if reply.Status != StatusError || reply.Error.Code != CodeUnsupportedVersion {
		t.Fatalf("got %+v, want unsupported_version", reply.Error)
	}
}

func TestDispatch_UnknownType(t *testing.T) {
	s := dispatchTestServer(map[string]OpHandler{})
	reply := s.dispatch(Envelope{Type: "module.nope", Version: "1.0"})
	if reply.Status != StatusError || reply.Error.Code != CodeValidationFailed {
		t.Fatalf("got %+v, want validation_failed", reply.Error)
	}
}

func TestDispatch_HandlerRPCError(t *testing.T) {
	s := dispatchTestServer(map[string]OpHandler{
		"module.heartbeat": func(_ context.Context, _ Envelope) (any, error) {
			return nil, &RPCError{Code: CodeUnknownInstance, Message: "gone"}
		},
	})
	reply := s.dispatch(Envelope{Type: "module.heartbeat", Version: "1.0"})
	if reply.Error == nil || reply.Error.Code != CodeUnknownInstance {
		t.Fatalf("got %+v, want unknown_instance", reply.Error)
	}
}

func TestDispatch_HandlerInternalError(t *testing.T) {
	s := dispatchTestServer(map[string]OpHandler{
		"module.register": func(_ context.Context, _ Envelope) (any, error) {
			return nil, errors.New("boom")
		},
	})
	reply := s.dispatch(Envelope{Type: "module.register", Version: "1.0"})
	if reply.Error == nil || reply.Error.Code != CodeInternalError {
		t.Fatalf("got %+v, want internal_error", reply.Error)
	}
}

func TestDispatch_Success(t *testing.T) {
	s := dispatchTestServer(map[string]OpHandler{
		"module.register": func(_ context.Context, req Envelope) (any, error) {
			return map[string]any{"registered": true}, nil
		},
	})
	reply := s.dispatch(Envelope{Type: "module.register", Version: "1.0", CorrelationID: "c1"})
	if reply.Status != StatusOK {
		t.Fatalf("status = %q, want ok (%+v)", reply.Status, reply.Error)
	}
	var p map[string]any
	_ = json.Unmarshal(reply.Payload, &p)
	if p["registered"] != true {
		t.Errorf("payload = %v", p)
	}
}

// fakeReplyPublisher records the last published reply for handleDelivery tests.
type fakeReplyPublisher struct {
	replyTo       string
	correlationID string
	data          []byte
	err           error
	called        bool
}

func (f *fakeReplyPublisher) publishReply(replyTo, correlationID string, data []byte) error {
	f.called = true
	f.replyTo = replyTo
	f.correlationID = correlationID
	f.data = data
	return f.err
}

func TestHandleDelivery_PublishesReplyAndAcks(t *testing.T) {
	s := dispatchTestServer(map[string]OpHandler{
		"module.register": func(_ context.Context, _ Envelope) (any, error) {
			return map[string]any{"registered": true}, nil
		},
	})
	body, _ := json.Marshal(Envelope{Type: "module.register", Version: "1.0", CorrelationID: "c1"})
	fp := &fakeReplyPublisher{}

	action := s.handleDelivery(fp, "c1", "amq.rabbitmq.reply-to.xyz", body)

	if !fp.called {
		t.Fatal("reply publisher not called")
	}
	if fp.replyTo != "amq.rabbitmq.reply-to.xyz" || fp.correlationID != "c1" {
		t.Errorf("reply routed to (%q,%q)", fp.replyTo, fp.correlationID)
	}
	if action != rabbitmq.Ack {
		t.Errorf("action = %d, want Ack", action)
	}
}

func TestHandleDelivery_UnparseableDiscards(t *testing.T) {
	s := dispatchTestServer(map[string]OpHandler{})
	fp := &fakeReplyPublisher{}
	action := s.handleDelivery(fp, "c1", "reply-q", []byte("{not json"))
	if fp.called {
		t.Error("should not reply to unparseable message")
	}
	if action != rabbitmq.NackDiscard {
		t.Errorf("action = %d, want NackDiscard", action)
	}
}

func TestHandleDelivery_NoReplyToDiscards(t *testing.T) {
	s := dispatchTestServer(map[string]OpHandler{})
	body, _ := json.Marshal(Envelope{Type: "module.register", Version: "1.0"})
	fp := &fakeReplyPublisher{}
	action := s.handleDelivery(fp, "c1", "", body)
	if fp.called {
		t.Error("should not reply when reply_to is empty")
	}
	if action != rabbitmq.NackDiscard {
		t.Errorf("action = %d, want NackDiscard", action)
	}
}
