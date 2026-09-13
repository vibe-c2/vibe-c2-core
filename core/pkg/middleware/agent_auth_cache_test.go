package middleware

import (
	"context"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// memCache is the smallest goroutine-safe cache.Cache the middleware needs.
type memCache struct {
	cache.Cache
	mu   sync.Mutex
	data map[string]string
}

func newMemCache() *memCache { return &memCache{data: map[string]string{}} }

func (m *memCache) IsEnabled() bool { return true }
func (m *memCache) Get(_ context.Context, key string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.data[key], nil
}
func (m *memCache) Set(_ context.Context, key string, value interface{}, _ time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data[key] = value.(string)
	return nil
}
func (m *memCache) SetNX(_ context.Context, key string, value interface{}, _ time.Duration) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.data[key]; ok {
		return false, nil
	}
	m.data[key] = value.(string)
	return true, nil
}
func (m *memCache) Del(_ context.Context, keys ...string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, k := range keys {
		delete(m.data, k)
	}
	return nil
}

// countingAgentKeys counts key lookups, which the cache is there to avoid.
type countingAgentKeys struct {
	repository.IAgentKeyRepository
	mu    sync.Mutex
	finds int
}

func (c *countingAgentKeys) FindByKeyID(ctx context.Context, keyID string) (models.AgentKey, error) {
	c.mu.Lock()
	c.finds++
	c.mu.Unlock()
	return c.IAgentKeyRepository.FindByKeyID(ctx, keyID)
}

func (c *countingAgentKeys) count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.finds
}

func cachedAgentEnv(t *testing.T) (*gin.Engine, string, *countingAgentKeys, *memCache) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	raw, keyID, hash, err := auth.GenerateKey(auth.AgentKeyPrefix)
	if err != nil {
		t.Fatalf("gen: %v", err)
	}
	uid := uuid.New()
	key := models.AgentKey{AgentKeyID: uuid.New(), KeyID: keyID, UserID: uid, Name: "Claude",
		SecretHash: hash, Enabled: true, MaxRole: models.OperationRoleOperator, Version: 1}
	user := models.User{UserID: uid, Username: "alice", Roles: []string{"user"}, Active: true}

	inner := newFakeAgentKeyRepo()
	inner.put(key)
	agentRepo := &countingAgentKeys{IAgentKeyRepository: inner}
	userRepo := newFakeUserRepo()
	userRepo.put(user)
	c := newMemCache()

	r := gin.New()
	r.Use(AuthN(stubJWTProvider{}, newFakeAPIKeyRepo(), agentRepo, userRepo, c))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })
	return r, raw, agentRepo, c
}

// The second request must be served from the cache: that is the round trip
// the cache exists to remove.
func TestAuthN_AgentKey_CachesTheResolvedKey(t *testing.T) {
	r, raw, repo, _ := cachedAgentEnv(t)

	for i := 0; i < 3; i++ {
		if w := getWithBearer(r, "/x", raw); w.Code != http.StatusOK {
			t.Fatalf("request %d: %d %s", i, w.Code, w.Body.String())
		}
	}
	if got := repo.count(); got != 1 {
		t.Fatalf("key looked up %d times, want 1", got)
	}
}

// A cached key is still a key: the wrong secret is refused on a hit, and an
// evicted entry is re-read.
func TestAuthN_AgentKey_CacheDoesNotWeakenTheCheck(t *testing.T) {
	r, raw, repo, c := cachedAgentEnv(t)
	if w := getWithBearer(r, "/x", raw); w.Code != http.StatusOK {
		t.Fatalf("warm-up: %d", w.Code)
	}

	wrong := raw[:len(raw)-4] + "zzzz"
	if w := getWithBearer(r, "/x", wrong); w.Code != http.StatusUnauthorized {
		t.Fatalf("wrong secret accepted from cache: %d", w.Code)
	}

	// Eviction (what every key mutation does) forces a fresh read.
	keyID, _, _ := parseForTest(raw)
	_ = c.Del(context.Background(), repository.AgentAuthCacheKey(keyID))
	if w := getWithBearer(r, "/x", raw); w.Code != http.StatusOK {
		t.Fatalf("after eviction: %d", w.Code)
	}
	if got := repo.count(); got != 2 {
		t.Fatalf("key looked up %d times, want 2 (once before and once after eviction)", got)
	}
}

func parseForTest(raw string) (string, string, bool) {
	return auth.ParseKey(auth.AgentKeyPrefix, raw)
}
