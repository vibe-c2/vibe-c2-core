package cache

import (
	"context"
	"time"
)

// Cache provides key-value caching with tag-based invalidation.
type Cache interface {
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key string, value interface{}, expiration time.Duration) error
	SetWithTags(ctx context.Context, key string, value interface{}, tags []string, expiration time.Duration) error
	Del(ctx context.Context, keys ...string) error
	InvalidateCache(ctx context.Context, entityName string, entityID string) error
	Close() error
	IsEnabled() bool
}

