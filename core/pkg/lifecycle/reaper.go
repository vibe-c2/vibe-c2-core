package lifecycle

import (
	"context"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/messaging"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// reaperBatchSize bounds how many stale instances are processed per tick.
const reaperBatchSize = 200

// Reaper periodically flips registered instances to dead once they have missed
// HeartbeatGraceMisses consecutive beats. It mirrors the wiki sweeper pattern:
// a ticker goroutine with Start/Stop. The clock is injectable for tests.
type Reaper struct {
	repo        repository.IModuleRegistryRepository
	emitter     EventEmitter
	invalidator RegistrationInvalidator
	logger      *zap.Logger
	interval    time.Duration
	graceWindow time.Duration
	now         func() time.Time

	ctx    context.Context
	cancel context.CancelFunc
}

// NewReaper builds the reaper. graceWindow is HeartbeatInterval * GraceMisses —
// the maximum silence tolerated before an instance is declared dead.
// invalidator may be nil (gate cache busting is then skipped).
func NewReaper(
	repo repository.IModuleRegistryRepository,
	emitter EventEmitter,
	invalidator RegistrationInvalidator,
	interval time.Duration,
	graceWindow time.Duration,
	logger *zap.Logger,
) *Reaper {
	ctx, cancel := context.WithCancel(context.Background())
	return &Reaper{
		repo:        repo,
		emitter:     emitter,
		invalidator: invalidator,
		logger:      logger.With(zap.String("component", "lifecycle-reaper")),
		interval:    interval,
		graceWindow: graceWindow,
		now:         func() time.Time { return time.Now().UTC() },
		ctx:         ctx,
		cancel:      cancel,
	}
}

func (r *Reaper) Start() {
	go func() {
		ticker := time.NewTicker(r.interval)
		defer ticker.Stop()

		r.logger.Info("lifecycle reaper started",
			zap.Duration("interval", r.interval),
			zap.Duration("grace_window", r.graceWindow))

		for {
			select {
			case <-ticker.C:
				r.RunTick(r.ctx)
			case <-r.ctx.Done():
				r.logger.Info("lifecycle reaper stopped")
				return
			}
		}
	}()
}

func (r *Reaper) Stop() {
	r.cancel()
}

// RunTick performs one reap pass: find registered instances whose last signal
// predates the grace window, mark them dead, and emit declared_dead events.
// Exported so tests can drive a single deterministic pass.
func (r *Reaper) RunTick(ctx context.Context) {
	cutoff := r.now().Add(-r.graceWindow)

	stale, err := r.repo.FindStaleRegistered(ctx, cutoff, reaperBatchSize)
	if err != nil {
		r.logger.Error("reaper: failed to list stale instances", zap.Error(err))
		return
	}
	if len(stale) == 0 {
		return
	}

	instances := make([]string, len(stale))
	for i, reg := range stale {
		instances[i] = reg.Instance
	}

	if err := r.repo.MarkDead(ctx, instances, r.now()); err != nil {
		r.logger.Error("reaper: failed to mark instances dead",
			zap.Strings("instances", instances), zap.Error(err))
		return
	}

	for _, reg := range stale {
		if r.invalidator != nil {
			r.invalidator.Invalidate(ctx, reg.Instance)
		}
		r.emit(ctx, reg.Type, reg.Instance)
		r.logger.Warn("module declared dead (missed heartbeats)",
			zap.String("module_type", reg.Type),
			zap.String("instance", reg.Instance))
	}
}

func (r *Reaper) emit(ctx context.Context, moduleType, instance string) {
	if r.emitter == nil {
		return
	}
	env, err := messaging.NewEvent(eventEnvelopeType+EventDeclaredDead, eventVersion, map[string]any{
		"module_type": moduleType,
		"instance":    instance,
		"event":       EventDeclaredDead,
	})
	if err != nil {
		r.logger.Warn("reaper: failed to build event", zap.Error(err))
		return
	}
	routingKey := EventRoutingKey(moduleType, instance, EventDeclaredDead)
	if err := r.emitter.Publish(ctx, routingKey, env); err != nil {
		r.logger.Warn("reaper: failed to publish declared_dead event",
			zap.String("routing_key", routingKey), zap.Error(err))
	}
}
