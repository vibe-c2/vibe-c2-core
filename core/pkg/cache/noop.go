package cache

import (
	"context"
	"errors"
	"time"
)

var ErrCacheDisabled = errors.New("cache disabled")

type noopCache struct{}

func NewNoopCache() Cache {
	return &noopCache{}
}

func (n *noopCache) IsEnabled() bool { return false }
func (n *noopCache) Close() error    { return nil }

func (n *noopCache) Get(ctx context.Context, key string) (string, error) {
	return "", ErrCacheDisabled
}

func (n *noopCache) Set(ctx context.Context, key string, value interface{}, expiration time.Duration) error {
	return nil
}

// SetNX always reports the key as newly set. With caching disabled there is no
// dedup state, so callers fail open and process every message rather than
// silently dropping it as a duplicate.
func (n *noopCache) SetNX(ctx context.Context, key string, value interface{}, expiration time.Duration) (bool, error) {
	return true, nil
}

// IncrWithTTL always reports 1. With caching disabled there is no shared
// counter to enforce a limit against, so callers fail OPEN — refusing every
// request because the rate limiter cannot see a count would turn a missing
// Redis into a total outage.
func (n *noopCache) IncrWithTTL(ctx context.Context, key string, expiration time.Duration) (int64, error) {
	return 1, nil
}

func (n *noopCache) SetWithTags(ctx context.Context, key string, value interface{}, tags []string, expiration time.Duration) error {
	return nil
}

func (n *noopCache) Del(ctx context.Context, keys ...string) error {
	return nil
}

func (n *noopCache) InvalidateCache(ctx context.Context, entityName string, entityID string) error {
	return nil
}
