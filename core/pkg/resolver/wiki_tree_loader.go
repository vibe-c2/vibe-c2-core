package resolver

// WikiTreeLoader is a per-request scratch space used by tree-style resolvers
// to share already-computed child counts and ancestor metadata with the
// per-document field resolvers. Without it, every row of a tree response
// triggers its own Mongo Count() or FindAncestors() — an N+1 storm. With it,
// the parent query runs one aggregation (or one bulk fetch) and the field
// resolvers become map lookups.
//
// One instance per HTTP request, attached to context in the GraphQL handler.
// Sub-resolvers may run in parallel under gqlgen, so the maps are guarded by
// an RWMutex.
//
// When the loader is absent from context (non-HTTP paths, subscriptions,
// callers that didn't precompute) the field resolvers fall back to a live
// Mongo path — no correctness loss, just no acceleration.

import (
	"context"
	"sync"

	"github.com/google/uuid"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
)

type wikiTreeLoaderKey struct{}

// WikiTreeLoader caches precomputed direct-child counts and per-document
// ancestor entries keyed by document id. The ancestor cache stores the
// flattened crumb shape (not the chain) so siblings sharing a parent reuse
// the same entry without duplication; chain assembly happens in the field
// resolver from each row's materialized PathIDs.
type WikiTreeLoader struct {
	mu          sync.RWMutex
	childCounts map[uuid.UUID]int
	ancestors   map[uuid.UUID]*model.WikiDocumentAncestor
}

// NewWikiTreeLoader returns an empty loader ready to be attached to a context.
func NewWikiTreeLoader() *WikiTreeLoader {
	return &WikiTreeLoader{
		childCounts: make(map[uuid.UUID]int),
		ancestors:   make(map[uuid.UUID]*model.WikiDocumentAncestor),
	}
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

// SetAncestorEntries merges the given (documentID → flattened crumb) entries
// into the loader. Used by list resolvers that bulk-fetch the union of
// PathIDs for a page so the per-row `ancestors` field becomes a map walk.
func (l *WikiTreeLoader) SetAncestorEntries(entries map[uuid.UUID]*model.WikiDocumentAncestor) {
	if l == nil || len(entries) == 0 {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	for k, v := range entries {
		l.ancestors[k] = v
	}
}

// Ancestor returns the cached crumb for the given document id. The second
// return is false when no entry was preloaded — callers should fall back to
// a live FindAncestors walk so trashed/edge paths still resolve.
func (l *WikiTreeLoader) Ancestor(id uuid.UUID) (*model.WikiDocumentAncestor, bool) {
	if l == nil {
		return nil, false
	}
	l.mu.RLock()
	defer l.mu.RUnlock()
	a, ok := l.ancestors[id]
	return a, ok
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
