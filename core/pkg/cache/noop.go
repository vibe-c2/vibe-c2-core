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

func (n *noopCache) SetWithTags(ctx context.Context, key string, value interface{}, tags []string, expiration time.Duration) error {
	return nil
}

func (n *noopCache) Del(ctx context.Context, keys ...string) error {
	return nil
}

func (n *noopCache) InvalidateCache(ctx context.Context, entityName string, entityID string) error {
	return nil
}
