package resolver

// WikiTreeLoader is a per-request scratch space used by tree-style resolvers
// to share already-computed child counts with the per-document `childCount`
// field resolver. Without it, every row of a tree response triggers its own
// Mongo Count() call — an N+1 storm. With it, the parent query runs one
// aggregation (or derives counts in memory) and the field resolver becomes a
// map lookup.
//
// One instance per HTTP request, attached to context in the GraphQL handler.
// Sub-resolvers may run in parallel under gqlgen, so the map is guarded by
// an RWMutex.
//
// When the loader is absent from context (non-HTTP paths, subscriptions,
// callers that didn't precompute) the field resolver falls back to the live
// Count() call — no correctness loss, just no acceleration.

import (
	"context"
	"sync"

	"github.com/google/uuid"
)

type wikiTreeLoaderKey struct{}

// WikiTreeLoader caches precomputed direct-child counts keyed by document id.
type WikiTreeLoader struct {
	mu          sync.RWMutex
	childCounts map[uuid.UUID]int
}

// NewWikiTreeLoader returns an empty loader ready to be attached to a context.
func NewWikiTreeLoader() *WikiTreeLoader {
	return &WikiTreeLoader{childCounts: make(map[uuid.UUID]int)}
}

// SetAllChildCounts merges the given (documentID → child count) entries into
// the loader. Existing entries are overwritten — concurrent tree queries in
// the same request should agree on counts.
func (l *WikiTreeLoader) SetAllChildCounts(counts map[uuid.UUID]int) {
	if l == nil || len(counts) == 0 {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	for k, v := range counts {
		l.childCounts[k] = v
	}
}

// ChildCount returns the cached child count for the given document id. The
// second return is false when the entry is absent — callers should fall back
// to a live Mongo Count.
func (l *WikiTreeLoader) ChildCount(id uuid.UUID) (int, bool) {
	if l == nil {
		return 0, false
	}
	l.mu.RLock()
	defer l.mu.RUnlock()
	c, ok := l.childCounts[id]
	return c, ok
}

// WithWikiTreeLoader returns ctx with the given loader attached. Called once
// per HTTP request by the GraphQL handler.
func WithWikiTreeLoader(ctx context.Context, l *WikiTreeLoader) context.Context {
	return context.WithValue(ctx, wikiTreeLoaderKey{}, l)
}

// WikiTreeLoaderFromContext retrieves the per-request loader, or nil if no
// loader was attached.
func WikiTreeLoaderFromContext(ctx context.Context) *WikiTreeLoader {
	l, _ := ctx.Value(wikiTreeLoaderKey{}).(*WikiTreeLoader)
	return l
}
