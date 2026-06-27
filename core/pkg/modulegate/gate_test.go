package modulegate

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/qiniu/qmgo"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.uber.org/zap"
)

// memCache is a minimal in-memory cache.Cache for asserting read-through and
// invalidation behavior. A missing key returns an error (mirrors redis.Nil).
type memCache struct {
	data map[string]string
}

func newMemCache() *memCache { return &memCache{data: map[string]string{}} }

func (m *memCache) Get(_ context.Context, key string) (string, error) {
	v, ok := m.data[key]
	if !ok {
		return "", errors.New("miss")
	}
	return v, nil
}
func (m *memCache) Set(_ context.Context, key string, value any, _ time.Duration) error {
	m.data[key] = value.(string)
	return nil
}
func (m *memCache) SetNX(_ context.Context, key string, value any, _ time.Duration) (bool, error) {
	if _, ok := m.data[key]; ok {
		return false, nil
	}
	m.data[key] = value.(string)
	return true, nil
}
func (m *memCache) SetWithTags(_ context.Context, key string, value any, _ []string, _ time.Duration) error {
	m.data[key] = value.(string)
	return nil
}
func (m *memCache) Del(_ context.Context, keys ...string) error {
	for _, k := range keys {
		delete(m.data, k)
	}
	return nil
}
func (m *memCache) InvalidateCache(_ context.Context, _ string, _ string) error { return nil }
func (m *memCache) Close() error                                                { return nil }
func (m *memCache) IsEnabled() bool                                             { return true }

// fakeRepo implements repository.IModuleRegistryRepository; only FindByInstance
// is exercised by the gate. It counts calls so caching can be asserted.
type fakeRepo struct {
	row   *models.Module
	err   error
	calls int
}

func (f *fakeRepo) FindByInstance(_ context.Context, _ string) (models.Module, error) {
	f.calls++
	if f.err != nil {
		return models.Module{}, f.err
	}
	if f.row == nil {
		return models.Module{}, qmgo.ErrNoSuchDocuments
	}
	return *f.row, nil
}

func (f *fakeRepo) Upsert(context.Context, *models.Module) error { return nil }
func (f *fakeRepo) TouchHeartbeat(context.Context, string, string, map[string]any, time.Time) (bool, error) {
	return false, nil
}
func (f *fakeRepo) MarkDeregistered(context.Context, string, string, time.Time) (bool, error) {
	return false, nil
}
func (f *fakeRepo) FindStaleRegistered(context.Context, time.Time, int64) ([]models.Module, error) {
	return nil, nil
}
func (f *fakeRepo) MarkDead(context.Context, []string, time.Time) error { return nil }
func (f *fakeRepo) ListActive(context.Context) ([]models.Module, error) { return nil, nil }

func newGate(repo *fakeRepo, c *memCache) *Gate {
	return New(repo, c, time.Minute, zap.NewNop())
}

func TestIsRegistered_RegisteredCachesPositive(t *testing.T) {
	repo := &fakeRepo{row: &models.Module{Instance: "http-1", Status: models.ModuleStatusRegistered}}
	c := newMemCache()
	g := newGate(repo, c)

	ok, err := g.IsRegistered(context.Background(), "http-1")
	if err != nil || !ok {
		t.Fatalf("first check: ok=%v err=%v, want true/nil", ok, err)
	}
	if repo.calls != 1 {
		t.Fatalf("repo calls = %d, want 1 (miss → registry)", repo.calls)
	}
	if _, cached := c.data[cacheKeyPrefix+"http-1"]; !cached {
		t.Fatal("positive result was not cached")
	}

	// Second check is served from cache — no further registry read.
	ok, err = g.IsRegistered(context.Background(), "http-1")
	if err != nil || !ok {
		t.Fatalf("second check: ok=%v err=%v", ok, err)
	}
	if repo.calls != 1 {
		t.Errorf("repo calls = %d, want still 1 (cache hit)", repo.calls)
	}
}

func TestIsRegistered_UnknownNotCached(t *testing.T) {
	repo := &fakeRepo{row: nil} // ErrNoSuchDocuments
	c := newMemCache()
	g := newGate(repo, c)

	ok, err := g.IsRegistered(context.Background(), "ghost")
	if err != nil || ok {
		t.Fatalf("ok=%v err=%v, want false/nil", ok, err)
	}
	if len(c.data) != 0 {
		t.Errorf("negative result must not be cached, cache = %v", c.data)
	}
}

func TestIsRegistered_DeadNotCached(t *testing.T) {
	repo := &fakeRepo{row: &models.Module{Instance: "http-1", Status: models.ModuleStatusDead}}
	c := newMemCache()
	g := newGate(repo, c)

	ok, err := g.IsRegistered(context.Background(), "http-1")
	if err != nil || ok {
		t.Fatalf("dead instance: ok=%v err=%v, want false/nil", ok, err)
	}
	if len(c.data) != 0 {
		t.Errorf("dead instance must not be cached, cache = %v", c.data)
	}
}

func TestIsRegistered_RepoErrorPropagates(t *testing.T) {
	repo := &fakeRepo{err: errors.New("mongo down")}
	g := newGate(repo, newMemCache())

	ok, err := g.IsRegistered(context.Background(), "http-1")
	if err == nil {
		t.Fatal("expected error to propagate (fail closed)")
	}
	if ok {
		t.Error("ok must be false on error")
	}
}

func TestInvalidate_RemovesCacheEntry(t *testing.T) {
	repo := &fakeRepo{row: &models.Module{Instance: "http-1", Status: models.ModuleStatusRegistered}}
	c := newMemCache()
	g := newGate(repo, c)

	// Prime the positive cache.
	if _, err := g.IsRegistered(context.Background(), "http-1"); err != nil {
		t.Fatalf("prime: %v", err)
	}
	g.Invalidate(context.Background(), "http-1")
	if _, cached := c.data[cacheKeyPrefix+"http-1"]; cached {
		t.Fatal("cache entry should be gone after Invalidate")
	}

	// Next check re-reads the registry.
	if _, err := g.IsRegistered(context.Background(), "http-1"); err != nil {
		t.Fatalf("post-invalidate: %v", err)
	}
	if repo.calls != 2 {
		t.Errorf("repo calls = %d, want 2 (prime + post-invalidate)", repo.calls)
	}
}
