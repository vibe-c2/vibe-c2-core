// Package modulegate decides whether a module instance is currently registered,
// for use by the data-plane sync endpoint (which must reject messages from
// channels that have not registered over the AMQP control plane). It is a
// read-through cache over the module registry: positive results are cached in
// Redis so the hot per-message path avoids a Mongo round-trip, and the
// lifecycle handlers bust the cache on deregister/death so a downed instance is
// gated out promptly rather than after the TTL.
package modulegate

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/qiniu/qmgo"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// cacheKeyPrefix namespaces per-instance registration markers in the shared
// cache. cacheValueRegistered is the only value ever stored — presence of the
// key means "registered"; absence means "consult the registry".
const (
	cacheKeyPrefix       = "module:registered:"
	cacheValueRegistered = "1"
)

// Gate answers "is this instance registered?" backed by the module registry and
// a positive-only Redis cache.
type Gate struct {
	repo  repository.IModuleRegistryRepository
	cache cache.Cache
	ttl   time.Duration
	log   *zap.Logger
}

// New builds a Gate. ttl bounds how long a positive result is trusted without
// re-reading Mongo (use the heartbeat interval — a registration cannot silently
// lapse faster than the reaper would notice).
func New(repo repository.IModuleRegistryRepository, c cache.Cache, ttl time.Duration, log *zap.Logger) *Gate {
	return &Gate{
		repo:  repo,
		cache: c,
		ttl:   ttl,
		log:   log.With(zap.String("component", "modulegate")),
	}
}

// IsRegistered reports whether instance currently has a registered row.
//
// Only positive results are cached: a negative (not found, or dead/deregistered)
// is never cached so a freshly-registered instance is accepted without waiting
// out a TTL. A registry read error is propagated so the caller can fail closed —
// a cache miss (including a disabled cache) is not an error, only a fall-through
// to the registry.
func (g *Gate) IsRegistered(ctx context.Context, instance string) (bool, error) {
	key := cacheKeyPrefix + instance
	if v, err := g.cache.Get(ctx, key); err == nil && v == cacheValueRegistered {
		return true, nil
	}

	reg, err := g.repo.FindByInstance(ctx, instance)
	if err != nil {
		if errors.Is(err, qmgo.ErrNoSuchDocuments) {
			return false, nil // never registered — do not cache
		}
		return false, fmt.Errorf("registry lookup for instance %q: %w", instance, err)
	}
	if reg.Status != models.ModuleStatusRegistered {
		return false, nil // dead/deregistered — do not cache
	}

	// Best-effort positive cache; a failure here only costs a future Mongo read.
	if err := g.cache.Set(ctx, key, cacheValueRegistered, g.ttl); err != nil {
		g.log.Debug("cache set failed", zap.String("instance", instance), zap.Error(err))
	}
	return true, nil
}

// Invalidate drops the positive cache entry for instance so the next check
// re-reads the registry. Called when an instance is deregistered or reaped.
// Best-effort: a failure is logged, never returned — the registry remains the
// source of truth and the entry expires on its own.
func (g *Gate) Invalidate(ctx context.Context, instance string) {
	if err := g.cache.Del(ctx, cacheKeyPrefix+instance); err != nil {
		g.log.Debug("cache invalidation failed", zap.String("instance", instance), zap.Error(err))
	}
}
