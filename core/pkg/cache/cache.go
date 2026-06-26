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
	SetWithTags(ctx context.Context, key string, value interface{}, tags []string, expiration time.Duration) error
	Del(ctx context.Context, keys ...string) error
	InvalidateCache(ctx context.Context, entityName string, entityID string) error
	Close() error
	IsEnabled() bool
}
