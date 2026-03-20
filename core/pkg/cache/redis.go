package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"go.uber.org/zap"
)

type RedisConfig struct {
	Host         string
	Port         string
	Password     string
	CacheEnabled bool
	Logger       *zap.Logger
}

type redisCache struct {
	client       *redis.Client
	cacheEnabled bool
	logger       *zap.Logger
}

func NewRedisCache(ctx context.Context, cfg RedisConfig) (Cache, error) {
	addr := fmt.Sprintf("%s:%s", cfg.Host, cfg.Port)

	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: cfg.Password,
		DB:       0,
	})

	var err error
	for i := 1; i <= 3; i++ {
		err = client.Ping(ctx).Err()
		if err == nil {
			break
		}
		cfg.Logger.Warn("Failed to connect to Redis",
			zap.Int("attempt", i),
			zap.Error(err),
		)
		if i < 3 {
			time.Sleep(3 * time.Second)
		}
	}

	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to connect to Redis after 3 attempts: %w", err)
	}

	cfg.Logger.Info("Redis connection established")

	return &redisCache{
		client:       client,
		cacheEnabled: cfg.CacheEnabled,
		logger:       cfg.Logger,
	}, nil
}

func (r *redisCache) IsEnabled() bool {
	return r.cacheEnabled
}

func (r *redisCache) Get(ctx context.Context, key string) (string, error) {
	return r.client.Get(ctx, key).Result()
}

func (r *redisCache) Set(ctx context.Context, key string, value interface{}, expiration time.Duration) error {
	return r.client.Set(ctx, key, value, expiration).Err()
}

func (r *redisCache) SetWithTags(ctx context.Context, key string, value interface{}, tags []string, expiration time.Duration) error {
	if err := r.client.Set(ctx, key, value, expiration).Err(); err != nil {
		return err
	}
	for _, tag := range tags {
		tagKey := "tag:" + tag
		if err := r.client.SAdd(ctx, tagKey, key).Err(); err != nil {
			return err
		}
		if err := r.client.Expire(ctx, tagKey, expiration+time.Minute).Err(); err != nil {
			return err
		}
	}
	return nil
}

func (r *redisCache) Del(ctx context.Context, keys ...string) error {
	return r.client.Del(ctx, keys...).Err()
}

func (r *redisCache) Close() error {
	return r.client.Close()
}

func (r *redisCache) InvalidateCache(ctx context.Context, entityName string, entityID string) error {
	if !r.cacheEnabled {
		return nil
	}

	tags := getTagsForInvalidation(entityName, entityID)
	if len(tags) == 0 {
		return nil
	}
	return r.invalidateByTags(ctx, tags)
}

func (r *redisCache) invalidateByTag(ctx context.Context, tag string) error {
	tagKey := "tag:" + tag
	keys, err := r.client.SMembers(ctx, tagKey).Result()
	if err != nil {
		return err
	}

	if len(keys) == 0 {
		return nil
	}

	keysToDelete := append(keys, tagKey)
	return r.client.Del(ctx, keysToDelete...).Err()
}

func (r *redisCache) invalidateByTags(ctx context.Context, tags []string) error {
	for _, tag := range tags {
		if err := r.invalidateByTag(ctx, tag); err != nil {
			return err
		}
	}
	return nil
}

func getTagsForInvalidation(entityName, entityID string) []string {
	tags := []string{entityName}
	if entityID != "" {
		tags = append(tags, entityName+":"+entityID)
	}
	return tags
}

// GetCachedData retrieves and unmarshals cached data. Returns (true, nil) on hit,
// (false, nil) on miss, (false, error) on corrupted data.
func GetCachedData[T any](c Cache, ctx context.Context, cacheKey string, output *T) (bool, error) {
	if !c.IsEnabled() {
		return false, nil
	}

	cachedData, err := c.Get(ctx, cacheKey)
	if err != nil {
		return false, nil
	}

	if err := json.Unmarshal([]byte(cachedData), output); err != nil {
		_ = c.Del(ctx, cacheKey)
		return false, fmt.Errorf("cache unmarshal error for key %s: %w", cacheKey, err)
	}
	return true, nil
}

// SetCachedData marshals and stores data with auto-detected TTL and tags.
func SetCachedData[T any](c Cache, ctx context.Context, cacheKey string, data T) error {
	if !c.IsEnabled() {
		return nil
	}

	serializedData, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("cache marshal error for key %s: %w", cacheKey, err)
	}

	ttl := GetTTLForKey(cacheKey)
	tags := GetTagsForKey(cacheKey)
	return c.SetWithTags(ctx, cacheKey, serializedData, tags, ttl)
}

// GetTagsForKey extracts tags from the cache key by convention.
// The first colon-separated segment is used as the entity tag.
func GetTagsForKey(cacheKey string) []string {
	parts := strings.SplitN(cacheKey, ":", 2)
	if len(parts) > 0 && parts[0] != "" {
		return []string{parts[0]}
	}
	return nil
}
