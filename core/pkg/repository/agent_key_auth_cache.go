package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.mongodb.org/mongo-driver/bson"
)

// AgentAuthCacheKey names the cache entry the auth middleware keeps for one
// agent key: the key row and its owner, resolved once and reused for a short
// while. Declared here, next to the writes that must evict it, so the two
// cannot drift apart.
func AgentAuthCacheKey(keyID string) string { return "agentauth:" + keyID }

// agentKeyAuthCacheEvictor wraps an IAgentKeyRepository so that every change
// to a key drops the middleware's cached copy of it.
//
// The middleware caches (key, owner) per key id because resolving them costs
// two Mongo reads on every MCP call, and an agent makes many calls a minute.
// A cache that only expired would leave a disabled or rotated key usable for
// the TTL, which is exactly the window the kill switch exists to close. Each
// mutation therefore evicts explicitly, and the TTL is a backstop for owner
// changes (deactivation, role edits) that do not pass through this type.
type agentKeyAuthCacheEvictor struct {
	IAgentKeyRepository
	cache cache.Cache
}

// NewAgentKeyRepositoryWithAuthCache returns the repository with eviction of
// the auth cache wired to every mutation. Nil or disabled cache is a
// pass-through.
func NewAgentKeyRepositoryWithAuthCache(inner IAgentKeyRepository, c cache.Cache) IAgentKeyRepository {
	if c == nil || !c.IsEnabled() {
		return inner
	}
	return &agentKeyAuthCacheEvictor{IAgentKeyRepository: inner, cache: c}
}

// evict drops the cached auth entry for the key identified by (user, id). The
// row is read first because the cache is keyed by the public key id, which
// the mutating methods are not given. A lookup failure evicts nothing: the
// mutation then fails on the same missing row.
func (r *agentKeyAuthCacheEvictor) evict(ctx context.Context, userID, agentKeyID uuid.UUID) {
	key, err := r.IAgentKeyRepository.FindByAgentKeyID(ctx, userID, agentKeyID)
	if err != nil {
		return
	}
	_ = r.cache.Del(ctx, AgentAuthCacheKey(key.KeyID))
}

func (r *agentKeyAuthCacheEvictor) UpdateSecret(ctx context.Context, userID, agentKeyID uuid.UUID, keyID, secretHash string, version int) error {
	// The old key id is what the cache holds; the new one has never been seen.
	r.evict(ctx, userID, agentKeyID)
	if err := r.IAgentKeyRepository.UpdateSecret(ctx, userID, agentKeyID, keyID, secretHash, version); err != nil {
		return err
	}
	_ = r.cache.Del(ctx, AgentAuthCacheKey(keyID))
	return nil
}

func (r *agentKeyAuthCacheEvictor) UpdateSettings(ctx context.Context, userID, agentKeyID uuid.UUID, set bson.M) error {
	if err := r.IAgentKeyRepository.UpdateSettings(ctx, userID, agentKeyID, set); err != nil {
		return err
	}
	r.evict(ctx, userID, agentKeyID)
	return nil
}

func (r *agentKeyAuthCacheEvictor) SetEnabled(ctx context.Context, userID, agentKeyID uuid.UUID, enabled bool) error {
	if err := r.IAgentKeyRepository.SetEnabled(ctx, userID, agentKeyID, enabled); err != nil {
		return err
	}
	r.evict(ctx, userID, agentKeyID)
	return nil
}

func (r *agentKeyAuthCacheEvictor) Delete(ctx context.Context, userID, agentKeyID uuid.UUID) error {
	// Evict before the row is gone, while its key id can still be read.
	r.evict(ctx, userID, agentKeyID)
	return r.IAgentKeyRepository.Delete(ctx, userID, agentKeyID)
}

// AgentAuthEntry is what the middleware caches: the key and its owner, as
// they were when first resolved.
//
// SecretHash is carried separately because models.AgentKey hides it from JSON
// (json:"-"), and the middleware compares against it on every request.
type AgentAuthEntry struct {
	Key        models.AgentKey `json:"key"`
	SecretHash string          `json:"secretHash"`
	User       models.User     `json:"user"`
}

// NewAgentAuthEntry builds an entry that survives the JSON round trip.
func NewAgentAuthEntry(key models.AgentKey, user models.User) AgentAuthEntry {
	return AgentAuthEntry{Key: key, SecretHash: key.SecretHash, User: user}
}

// Restore puts the secret hash back on the key after decoding.
func (e *AgentAuthEntry) Restore() { e.Key.SecretHash = e.SecretHash }
