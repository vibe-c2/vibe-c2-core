package mcp

import (
	"context"
	"testing"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"go.uber.org/zap"
)

// memCache is a minimal in-memory cache.Cache for exercising the replay path
// without Redis.
type memCache struct {
	data     map[string]string
	counters map[string]int64
}

func newMemCache() *memCache {
	return &memCache{data: map[string]string{}, counters: map[string]int64{}}
}

func (m *memCache) Get(_ context.Context, key string) (string, error) { return m.data[key], nil }

func (m *memCache) Set(_ context.Context, key string, value any, _ time.Duration) error {
	m.data[key] = value.(string)
	return nil
}

func (m *memCache) SetNX(_ context.Context, key string, value any, _ time.Duration) (bool, error) {
	if _, exists := m.data[key]; exists {
		return false, nil
	}
	m.data[key] = value.(string)
	return true, nil
}

func (m *memCache) IncrWithTTL(_ context.Context, key string, _ time.Duration) (int64, error) {
	n := m.counters[key] + 1
	m.counters[key] = n
	return n, nil
}

func (m *memCache) SetWithTags(context.Context, string, any, []string, time.Duration) error {
	return nil
}
func (m *memCache) Del(_ context.Context, keys ...string) error {
	for _, k := range keys {
		delete(m.data, k)
	}
	return nil
}
func (m *memCache) InvalidateCache(context.Context, string, string) error { return nil }
func (m *memCache) Close() error                                          { return nil }
func (m *memCache) IsEnabled() bool                                       { return true }

var _ cache.Cache = (*memCache)(nil)

func idemServer() (*Server, *memCache) {
	c := newMemCache()
	return &Server{deps: Deps{Cache: c, Logger: zap.NewNop()}}, c
}

// The point of the feature: a retried write replays instead of repeating.
func TestIdempotency_ReplaysARecordedResult(t *testing.T) {
	s, _ := idemServer()
	ctx := context.Background()

	if _, hit := s.replay(ctx, "key-1", "create_task", "abc"); hit {
		t.Fatal("replayed a result that was never recorded")
	}

	s.remember(ctx, "key-1", "create_task", "abc", `{"id":"task-1"}`)

	got, hit := s.replay(ctx, "key-1", "create_task", "abc")
	if !hit {
		t.Fatal("a recorded result was not replayed; a retry would duplicate the write")
	}
	if got != `{"id":"task-1"}` {
		t.Fatalf("replayed the wrong result: %s", got)
	}
}

// The cache key has to separate agents, tools and keys, or a retry could
// replay somebody else's result.
func TestIdempotency_ScopeSeparation(t *testing.T) {
	s, _ := idemServer()
	ctx := context.Background()

	s.remember(ctx, "key-1", "create_task", "abc", `{"id":"task-1"}`)

	cases := []struct {
		name             string
		agent, tool, key string
	}{
		{"a different agent key", "key-2", "create_task", "abc"},
		{"a different tool", "key-1", "create_host", "abc"},
		{"a different idempotency key", "key-1", "create_task", "xyz"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, hit := s.replay(ctx, tc.agent, tc.tool, tc.key); hit {
				t.Fatal("replayed across a scope boundary")
			}
		})
	}
}

// No key means no replay: an agent that does not opt in gets ordinary
// at-least-once behaviour rather than silent deduplication it did not ask for.
func TestIdempotency_EmptyKeyIsInert(t *testing.T) {
	s, c := idemServer()
	ctx := context.Background()

	s.remember(ctx, "key-1", "create_task", "", `{"id":"task-1"}`)
	if len(c.data) != 0 {
		t.Fatalf("recorded a result under an empty key: %v", c.data)
	}
	if _, hit := s.replay(ctx, "key-1", "create_task", ""); hit {
		t.Fatal("replayed for an empty key")
	}
}

// Without a cache the feature degrades to at-least-once rather than failing.
func TestIdempotency_NoCacheDegradesQuietly(t *testing.T) {
	s := &Server{deps: Deps{Logger: zap.NewNop()}}
	ctx := context.Background()

	s.remember(ctx, "key-1", "create_task", "abc", `{"id":"task-1"}`)
	if _, hit := s.replay(ctx, "key-1", "create_task", "abc"); hit {
		t.Fatal("replayed with no cache configured")
	}
}

// Every write tool must accept a key. A write that cannot be retried safely is
// the failure this guards.
func TestIdempotency_EveryWriteToolAcceptsAKey(t *testing.T) {
	writeArgs := []any{
		createHostArgs{},
		updateHostArgs{},
		createCredentialArgs{},
		createHashArgs{},
		importHashesArgs{},
		updateHashArgs{},
		markHashCrackedArgs{},
		addCredentialCommentArgs{},
		createTaskArgs{},
		updateTaskArgs{},
		addTaskWikiReferenceArgs{},
		changeTaskStageArgs{},
		createWikiDocumentArgs{},
		appendWikiSectionArgs{},
		updateWikiDocumentArgs{},
		createTimelineEventArgs{},
	}
	for _, args := range writeArgs {
		if _, ok := args.(idempotent); !ok {
			t.Errorf("%T does not embed IdempotencyKey; retrying it would duplicate the write", args)
		}
	}
}
