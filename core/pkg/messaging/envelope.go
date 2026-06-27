// Package messaging implements core's AMQP control-plane surface: the connection
// client, the vibe.core.rpc RPC server (core acts as the RPC *server* for
// module lifecycle), and the vibe.events publisher.
//
// The wire envelope itself is NOT defined here — it lives in the shared module
// github.com/vibe-c2/vibe-c2-golang-protocol so core and every module agree on
// one definition. This file re-exports those shared types/constants and adds the
// thin core-side layer: a source stamper (core's service+instance) and the
// server-runtime RPCError. It is named "messaging" (not "rabbitmq") to avoid
// colliding with the imported wagslane package, and is distinct from the
// in-process pkg/eventbus.
package messaging

import (
	"github.com/vibe-c2/vibe-c2-golang-protocol/protocol"
)

// Shared wire types, re-exported as aliases so core code has a single import for
// the control plane. These ARE the protocol types — no conversion needed.
type (
	Envelope      = protocol.Envelope
	ReplyEnvelope = protocol.ReplyEnvelope
	Source        = protocol.Source
	EnvelopeError = protocol.EnvelopeError
)

// Shared constants, re-exported for ergonomic use across core packages.
const (
	ServiceCore = protocol.ServiceCore

	StatusOK    = protocol.StatusOK
	StatusError = protocol.StatusError

	CodeValidationFailed   = protocol.CodeValidationFailed
	CodeUnsupportedVersion = protocol.CodeUnsupportedVersion
	CodeUnknownInstance    = protocol.CodeUnknownInstance
	CodeInternalError      = protocol.CodeInternalError
)

// SupportedMajor is the control-plane contract major version core serves.
// Requests on a different major version are rejected as unsupported.
const SupportedMajor = 1

// RPCError is a typed handler error that maps to an RPC error reply with a
// stable code. Handlers return &RPCError{...} for a contract-level failure; any
// other error becomes an internal_error reply. This is a core-side server
// runtime helper, not a wire type, so it stays in core rather than protocol.
type RPCError struct {
	Code    string
	Message string
}

func (e *RPCError) Error() string { return e.Code + ": " + e.Message }

// instance is core's deployment instance id, stamped on outbound source. Set
// once at startup via SetInstance; defaults to "core" before configuration.
var instance = protocol.ServiceCore

// SetInstance sets the core instance id used in the source.instance field of
// outbound replies and events.
func SetInstance(id string) {
	if id != "" {
		instance = id
	}
}

func coreSource() protocol.Source {
	return protocol.Source{Service: protocol.ServiceCore, Instance: instance}
}

// NewReply builds a success reply for req, stamping core's source. Delegates to
// the shared protocol constructor.
func NewReply(req Envelope, payload any) (ReplyEnvelope, error) {
	return protocol.NewReply(req, coreSource(), payload)
}

// NewErrorReply builds an error reply for req with the given code/message,
// stamping core's source.
func NewErrorReply(req Envelope, code, message string) ReplyEnvelope {
	return protocol.NewErrorReply(req, coreSource(), code, message)
}

// NewEvent builds a fire-and-forget event envelope from core's source.
func NewEvent(eventType, version string, payload any) (Envelope, error) {
	return protocol.NewEvent(eventType, version, coreSource(), payload)
}
