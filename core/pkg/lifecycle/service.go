// Package lifecycle implements the module-lifecycle control-plane business
// logic: the register/heartbeat/deregister RPC handlers and the liveness reaper.
// It is transport-agnostic — handlers match messaging.OpHandler and depend only
// on the registry repository and an event emitter, so they unit-test without a
// broker or Mongo.
package lifecycle

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/messaging"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// Operation type names selected by the envelope `type` field.
const (
	OpRegister   = "module.register"
	OpHeartbeat  = "module.heartbeat"
	OpDeregister = "module.deregister"
)

// Lifecycle audit event names, emitted on the vibe.events topic exchange.
const (
	EventRegistered   = "registered"
	EventDeregistered = "deregistered"
	EventDeclaredDead = "declared_dead"
	eventEnvelopeType = "module." // type becomes "module.<event>"
	eventVersion      = "1.0"
)

// EventEmitter publishes lifecycle audit events. Satisfied by
// messaging.EventPublisher; faked in tests.
type EventEmitter interface {
	Publish(ctx context.Context, routingKey string, env messaging.Envelope) error
}

// RegistrationInvalidator drops a cached "registered" marker for an instance so
// the data-plane registration gate stops accepting it immediately on
// deregister/death. Satisfied by *modulegate.Gate; nil-safe (skipped) in tests.
type RegistrationInvalidator interface {
	Invalidate(ctx context.Context, instance string)
}

// ModuleEventPublisher publishes module lifecycle changes onto the in-process
// event bus so GraphQL subscribers (the Modules admin page) update in real
// time. Distinct from the AMQP EventEmitter audit stream: this is the in-core
// fan-out to live SPA clients. Satisfied by eventbus.IEventBus; nil-safe
// (skipped) in tests.
type ModuleEventPublisher interface {
	Publish(event eventbus.Event)
}

// Config carries the bootstrap values handed back to a module on register and
// the liveness parameters used by the reaper.
type Config struct {
	HeartbeatInterval    time.Duration
	HeartbeatGraceMisses int
	Policy               map[string]any
	FeatureFlags         map[string]any
}

// Service handles the three lifecycle RPC operations.
type Service struct {
	repo        repository.IModuleRegistryRepository
	emitter     EventEmitter
	invalidator RegistrationInvalidator
	publisher   ModuleEventPublisher
	logger      *zap.Logger
	cfg         Config
	now         func() time.Time
}

// NewService builds the lifecycle service. emitter may be nil (AMQP audit
// events are then skipped) so core can run with the broker present but events
// unused in tests. invalidator may be nil (gate cache busting is then skipped).
// publisher may be nil (in-process bus fan-out is then skipped).
func NewService(repo repository.IModuleRegistryRepository, emitter EventEmitter, invalidator RegistrationInvalidator, publisher ModuleEventPublisher, cfg Config, logger *zap.Logger) *Service {
	if cfg.HeartbeatInterval <= 0 {
		cfg.HeartbeatInterval = 30 * time.Second
	}
	if cfg.HeartbeatGraceMisses <= 0 {
		cfg.HeartbeatGraceMisses = 3
	}
	return &Service{
		repo:        repo,
		emitter:     emitter,
		invalidator: invalidator,
		publisher:   publisher,
		logger:      logger.With(zap.String("component", "lifecycle")),
		cfg:         cfg,
		now:         func() time.Time { return time.Now().UTC() },
	}
}

// --- request/reply payload shapes (contract module-lifecycle.md) ---

type registerRequest struct {
	ModuleType  string `json:"module_type"`
	Instance    string `json:"instance"`
	Version     string `json:"version"`
	RPCQueue    string `json:"rpc_queue"`
	Description string `json:"description"`
}

type registerReply struct {
	Instance                 string         `json:"instance"`
	Registered               bool           `json:"registered"`
	HeartbeatIntervalSeconds int            `json:"heartbeat_interval_seconds"`
	HeartbeatGraceMisses     int            `json:"heartbeat_grace_misses"`
	Config                   registerConfig `json:"config"`
}

type registerConfig struct {
	Policy       map[string]any `json:"policy"`
	FeatureFlags map[string]any `json:"feature_flags"`
}

type heartbeatRequest struct {
	Instance string         `json:"instance"`
	Status   string         `json:"status"`
	Metrics  map[string]any `json:"metrics"`
}

type heartbeatReply struct {
	Instance      string `json:"instance"`
	Ack           bool   `json:"ack"`
	ConfigChanged bool   `json:"config_changed"`
}

type deregisterRequest struct {
	Instance string `json:"instance"`
	Reason   string `json:"reason"`
}

type deregisterReply struct {
	Instance     string `json:"instance"`
	Deregistered bool   `json:"deregistered"`
}

// HandleRegister implements the module.register operation.
func (s *Service) HandleRegister(ctx context.Context, req messaging.Envelope) (any, error) {
	var p registerRequest
	if err := json.Unmarshal(req.Payload, &p); err != nil {
		return nil, validationErr("malformed register payload")
	}
	if p.ModuleType == "" || p.Instance == "" || p.RPCQueue == "" {
		return nil, validationErr("module_type, instance and rpc_queue are required")
	}

	reg := &models.Module{
		Type:         p.ModuleType,
		Instance:     p.Instance,
		Version:      p.Version,
		RPCQueue:     p.RPCQueue,
		Description:  p.Description,
		RegisteredAt: s.now(),
	}
	if err := s.repo.Upsert(ctx, reg); err != nil {
		return nil, fmt.Errorf("persist registration: %w", err)
	}

	s.emit(ctx, p.ModuleType, p.Instance, EventRegistered)
	s.publishBus(eventbus.NewModuleRegisteredEvent(
		eventbus.ServiceActor(p.Instance),
		eventbus.ModuleEventPayload{Instance: p.Instance, Type: p.ModuleType, Status: models.ModuleStatusRegistered},
	))
	s.logger.Info("module registered",
		zap.String("module_type", p.ModuleType),
		zap.String("instance", p.Instance),
		zap.String("version", p.Version))

	return registerReply{
		Instance:                 p.Instance,
		Registered:               true,
		HeartbeatIntervalSeconds: int(s.cfg.HeartbeatInterval.Seconds()),
		HeartbeatGraceMisses:     s.cfg.HeartbeatGraceMisses,
		Config: registerConfig{
			Policy:       orEmptyMap(s.cfg.Policy),
			FeatureFlags: orEmptyMap(s.cfg.FeatureFlags),
		},
	}, nil
}

// HandleHeartbeat implements the module.heartbeat operation.
func (s *Service) HandleHeartbeat(ctx context.Context, req messaging.Envelope) (any, error) {
	var p heartbeatRequest
	if err := json.Unmarshal(req.Payload, &p); err != nil {
		return nil, validationErr("malformed heartbeat payload")
	}
	if p.Instance == "" {
		return nil, validationErr("instance is required")
	}

	found, err := s.repo.TouchHeartbeat(ctx, p.Instance, p.Status, p.Metrics, s.now())
	if err != nil {
		return nil, fmt.Errorf("touch heartbeat: %w", err)
	}
	if !found {
		return nil, &messaging.RPCError{
			Code:    messaging.CodeUnknownInstance,
			Message: fmt.Sprintf("no active registration for instance %q", p.Instance),
		}
	}

	return heartbeatReply{Instance: p.Instance, Ack: true, ConfigChanged: false}, nil
}

// HandleDeregister implements the module.deregister operation (module-initiated
// over RPC). The shared deregister transition lives in Deregister so the
// GraphQL admin "remove" path behaves identically.
func (s *Service) HandleDeregister(ctx context.Context, req messaging.Envelope) (any, error) {
	var p deregisterRequest
	if err := json.Unmarshal(req.Payload, &p); err != nil {
		return nil, validationErr("malformed deregister payload")
	}
	if p.Instance == "" {
		return nil, validationErr("instance is required")
	}

	// The module deregistered itself → attribute the event to the instance.
	found, err := s.Deregister(ctx, p.Instance, p.Reason, eventbus.ServiceActor(p.Instance))
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, &messaging.RPCError{
			Code:    messaging.CodeUnknownInstance,
			Message: fmt.Sprintf("no active registration for instance %q", p.Instance),
		}
	}

	return deregisterReply{Instance: p.Instance, Deregistered: true}, nil
}

// Deregister transitions a registered instance to deregistered and fans the
// change out to every observer: it busts the data-plane registration-gate
// cache, emits the AMQP audit event, and publishes a module.deregistered event
// on the in-process bus. Shared by the module.deregister RPC handler
// (module-initiated) and the GraphQL removeModule mutation (admin-initiated);
// the actor distinguishes the two on the event stream. Returns false (with a
// nil error) when the instance has no active registration — callers map that to
// their own not-found signal (RPC unknown_instance / GraphQL error).
func (s *Service) Deregister(ctx context.Context, instance, reason string, actor eventbus.Actor) (bool, error) {
	// Look up first so the audit event can carry the module_type.
	existing, err := s.repo.FindByInstance(ctx, instance)
	moduleType := ""
	if err == nil {
		moduleType = existing.Type
	}

	found, err := s.repo.MarkDeregistered(ctx, instance, reason, s.now())
	if err != nil {
		return false, fmt.Errorf("mark deregistered: %w", err)
	}
	if !found {
		return false, nil
	}

	if s.invalidator != nil {
		s.invalidator.Invalidate(ctx, instance)
	}
	s.emit(ctx, moduleType, instance, EventDeregistered)
	s.publishBus(eventbus.NewModuleDeregisteredEvent(
		actor,
		eventbus.ModuleEventPayload{Instance: instance, Type: moduleType, Status: models.ModuleStatusDeregistered},
	))
	s.logger.Info("module deregistered",
		zap.String("instance", instance),
		zap.String("reason", reason))

	return found, nil
}

// publishBus fans a module lifecycle change out to the in-process event bus for
// live SPA subscribers. Non-blocking and nil-safe; skipped when no publisher is
// wired (tests, or a build without subscriptions).
func (s *Service) publishBus(ev eventbus.Event) {
	if s.publisher == nil {
		return
	}
	s.publisher.Publish(ev)
}

// emit publishes a lifecycle audit event. Failures are logged, never fatal —
// the registration state change has already been persisted.
func (s *Service) emit(ctx context.Context, moduleType, instance, event string) {
	if s.emitter == nil {
		return
	}
	env, err := messaging.NewEvent(eventEnvelopeType+event, eventVersion, map[string]any{
		"module_type": moduleType,
		"instance":    instance,
		"event":       event,
	})
	if err != nil {
		s.logger.Warn("failed to build lifecycle event", zap.Error(err))
		return
	}
	routingKey := EventRoutingKey(moduleType, instance, event)
	if err := s.emitter.Publish(ctx, routingKey, env); err != nil {
		s.logger.Warn("failed to publish lifecycle event",
			zap.String("routing_key", routingKey), zap.Error(err))
	}
}

// EventRoutingKey builds the <module-type>.<instance>.<event> topic routing key.
func EventRoutingKey(moduleType, instance, event string) string {
	mt := moduleType
	if mt == "" {
		mt = "module"
	}
	return strings.Join([]string{mt, instance, event}, ".")
}

func validationErr(msg string) *messaging.RPCError {
	return &messaging.RPCError{Code: messaging.CodeValidationFailed, Message: msg}
}

func orEmptyMap(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return m
}
