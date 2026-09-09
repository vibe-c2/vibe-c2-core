package cache

import (
	"context"
	"time"
)

// Cache provides key-value caching with tag-based invalidation.
type Cache interface {
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key string, value interface{}, expiration time.Duration) error
	// SetNX sets key to value only if it does not already exist, returning true
	// when the key was newly set. Used for idempotency/dedup guards.
	SetNX(ctx context.Context, key string, value interface{}, expiration time.Duration) (bool, error)
	// IncrWithTTL atomically increments a counter and returns its new value,
	// applying expiration on the first increment so the window expires on its
	// own. The atomicity is the point: a read-then-write counter lets
	// concurrent callers each observe the same value and collectively exceed
	// whatever limit is being enforced.
	IncrWithTTL(ctx context.Context, key string, expiration time.Duration) (int64, error)
	SetWithTags(ctx context.Context, key string, value interface{}, tags []string, expiration time.Duration) error
	Del(ctx context.Context, keys ...string) error
	InvalidateCache(ctx context.Context, entityName string, entityID string) error
	Close() error
	IsEnabled() bool
}
