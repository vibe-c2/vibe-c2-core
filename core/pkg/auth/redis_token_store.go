package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
	"go.uber.org/zap"
)

type RedisTokenStoreConfig struct {
	Host     string
	Port     string
	Password string
	DB       int
	Logger   *zap.Logger
}

type redisTokenStore struct {
	client *redis.Client
	logger *zap.Logger
}

func NewRedisTokenStore(ctx context.Context, cfg RedisTokenStoreConfig) (TokenStore, error) {
	addr := fmt.Sprintf("%s:%s", cfg.Host, cfg.Port)

	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	var err error
	for i := 1; i <= 3; i++ {
		err = client.Ping(ctx).Err()
		if err == nil {
			break
		}
		cfg.Logger.Warn("Failed to connect to Redis token store",
			zap.Int("attempt", i),
			zap.Error(err),
		)
		if i < 3 {
			time.Sleep(3 * time.Second)
		}
	}

	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to connect to Redis token store after 3 attempts: %w", err)
	}

	cfg.Logger.Info("Redis token store connection established", zap.Int("db", cfg.DB))

	return &redisTokenStore{
		client: client,
		logger: cfg.Logger,
	}, nil
}

// StoreWithIndex persists token metadata and adds the key to the user's
// session index in a single pipeline.
func (s *redisTokenStore) StoreWithIndex(ctx context.Context, key string, meta RefreshTokenMeta, userID string, ttl time.Duration) error {
	data, err := json.Marshal(meta)
	if err != nil {
		return fmt.Errorf("failed to marshal token metadata: %w", err)
	}

	indexKey := s.userIndexKey(userID)
	pipe := s.client.Pipeline()
	pipe.Set(ctx, key, data, ttl)
	pipe.SAdd(ctx, indexKey, key)
	pipe.Expire(ctx, indexKey, ttl+time.Minute)
	_, err = pipe.Exec(ctx)
	return err
}

func (s *redisTokenStore) Lookup(ctx context.Context, key string) (*RefreshTokenMeta, error) {
	data, err := s.client.Get(ctx, key).Result()
	if err != nil {
		return nil, ErrTokenNotFound
	}

	var meta RefreshTokenMeta
	if err := json.Unmarshal([]byte(data), &meta); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrTokenCorrupted, err)
	}

	return &meta, nil
}

// DeleteAndUnindex removes a token and its entry from the user's session
// index in a single pipeline.
func (s *redisTokenStore) DeleteAndUnindex(ctx context.Context, key string, userID string) error {
	indexKey := s.userIndexKey(userID)
	pipe := s.client.Pipeline()
	pipe.Del(ctx, key)
	pipe.SRem(ctx, indexKey, key)
	_, err := pipe.Exec(ctx)
	return err
}

func (s *redisTokenStore) userIndexKey(userID string) string {
	return fmt.Sprintf("session_index:%s", userID)
}

// UserSessionCount returns active session count using SCARD (O(1)).
func (s *redisTokenStore) UserSessionCount(ctx context.Context, userID string) (int64, error) {
	return s.client.SCard(ctx, s.userIndexKey(userID)).Result()
}

func (s *redisTokenStore) DeleteAllUserSessions(ctx context.Context, userID string) error {
	indexKey := s.userIndexKey(userID)

	keys, err := s.client.SMembers(ctx, indexKey).Result()
	if err != nil {
		return err
	}

	if len(keys) == 0 {
		return nil
	}

	// Delete all token keys and the index in one pipeline
	pipe := s.client.Pipeline()
	pipe.Del(ctx, keys...)
	pipe.Del(ctx, indexKey)
	_, err = pipe.Exec(ctx)
	return err
}

func (s *redisTokenStore) Close() error {
	return s.client.Close()
}
