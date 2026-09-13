package mcp

import (
	"context"
	"encoding/json"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.uber.org/zap"
)

// Rendered-markdown cache.
//
// Every read of a page — full, outline or section — sends the Y.js
// content_state to the sidecar and gets markdown back. An agent working on a
// page reads it several times in a row, and each read paid for that hop and
// the decode behind it. The rendered text is a pure function of the stored
// state, so it is cached per document and validated against the state's
// persistence stamp: a stale entry is detected by comparison, not by TTL.
//
// The TTL is a backstop for documents nobody reads again. Writes through
// this package evict eagerly, so the agent sees its own edit on the next read
// even before the sidecar's debounced store has moved the stamp.

const markdownCacheTTL = 10 * time.Minute

func markdownCacheKey(documentID string) string { return "mcp:md:" + documentID }

// markdownCacheEntry is what is stored. StateAt and StateLen together
// identify the content_state the markdown was rendered from.
type markdownCacheEntry struct {
	StateAt  string `json:"stateAt"`
	StateLen int    `json:"stateLen"`
	Markdown string `json:"markdown"`
}

// stateStamp identifies a document's persisted CRDT state for cache
// validation. Empty when the document carries no stamp, which disables
// caching for it rather than risking a false hit.
func stateStamp(doc *models.WikiDocument) string {
	if doc.ContentStateAt == nil {
		return ""
	}
	return doc.ContentStateAt.UTC().Format(time.RFC3339Nano)
}

// cachedMarkdown returns the rendered text for this exact state, if cached.
func (s *Server) cachedMarkdown(ctx context.Context, doc *models.WikiDocument) (string, bool) {
	stamp := stateStamp(doc)
	if stamp == "" || s.deps.Cache == nil || !s.deps.Cache.IsEnabled() {
		return "", false
	}
	raw, err := s.deps.Cache.Get(ctx, markdownCacheKey(doc.DocumentID.String()))
	if err != nil || raw == "" {
		return "", false
	}
	var entry markdownCacheEntry
	if err := json.Unmarshal([]byte(raw), &entry); err != nil {
		return "", false
	}
	if entry.StateAt != stamp || entry.StateLen != len(doc.ContentState) {
		return "", false
	}
	return entry.Markdown, true
}

// rememberMarkdown stores the rendered text. Best-effort.
func (s *Server) rememberMarkdown(ctx context.Context, doc *models.WikiDocument, markdown string) {
	stamp := stateStamp(doc)
	if stamp == "" || s.deps.Cache == nil || !s.deps.Cache.IsEnabled() {
		return
	}
	encoded, err := json.Marshal(markdownCacheEntry{
		StateAt: stamp, StateLen: len(doc.ContentState), Markdown: markdown,
	})
	if err != nil {
		return
	}
	if err := s.deps.Cache.Set(ctx, markdownCacheKey(doc.DocumentID.String()), string(encoded), markdownCacheTTL); err != nil {
		s.deps.Logger.Warn("mcp: failed to cache rendered markdown",
			zap.String("document_id", doc.DocumentID.String()), zap.Error(err))
	}
}

// forgetMarkdown drops the cached text after a write, so the next read
// renders the new body rather than serving what the stamp still vouches for.
func (s *Server) forgetMarkdown(ctx context.Context, documentID string) {
	if s.deps.Cache == nil || !s.deps.Cache.IsEnabled() {
		return
	}
	_ = s.deps.Cache.Del(ctx, markdownCacheKey(documentID))
}
