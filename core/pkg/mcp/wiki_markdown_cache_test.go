package mcp

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.uber.org/zap"
)

func cachedServer() (*Server, *memCache) {
	c := newMemCache()
	return &Server{deps: Deps{Cache: c, Logger: zap.NewNop()}}, c
}

func stampedDoc(at time.Time, state string) *models.WikiDocument {
	return &models.WikiDocument{
		DocumentID:     uuid.New(),
		ContentState:   []byte(state),
		ContentStateAt: &at,
	}
}

// A hit is only a hit for the exact state the text was rendered from.
func TestMarkdownCache_ValidatesAgainstTheStateStamp(t *testing.T) {
	s, _ := cachedServer()
	ctx := context.Background()
	now := time.Now()
	doc := stampedDoc(now, "state-1")

	if _, hit := s.cachedMarkdown(ctx, doc); hit {
		t.Fatal("hit before anything was stored")
	}
	s.rememberMarkdown(ctx, doc, "# rendered")

	if got, hit := s.cachedMarkdown(ctx, doc); !hit || got != "# rendered" {
		t.Fatalf("expected a hit, got %q %v", got, hit)
	}

	// Same document, newer persisted state: the entry is stale.
	later := stampedDoc(now.Add(time.Second), "state-1")
	later.DocumentID = doc.DocumentID
	if _, hit := s.cachedMarkdown(ctx, later); hit {
		t.Fatal("served a rendering of an older state")
	}

	// Same stamp, different bytes (a clock that did not move): also stale.
	changed := stampedDoc(now, "state-22")
	changed.DocumentID = doc.DocumentID
	if _, hit := s.cachedMarkdown(ctx, changed); hit {
		t.Fatal("served a rendering of different bytes under the same stamp")
	}
}

// A write evicts, so the agent's next read renders the new body even though
// the persisted stamp has not moved yet.
func TestMarkdownCache_ForgetsAfterAWrite(t *testing.T) {
	s, _ := cachedServer()
	ctx := context.Background()
	doc := stampedDoc(time.Now(), "state")

	s.rememberMarkdown(ctx, doc, "before")
	s.forgetMarkdown(ctx, doc.DocumentID.String())
	if _, hit := s.cachedMarkdown(ctx, doc); hit {
		t.Fatal("still cached after the write")
	}
}

// A document with no persistence stamp cannot be validated, so it is never
// cached rather than risking a false hit.
func TestMarkdownCache_SkipsUnstampedDocuments(t *testing.T) {
	s, c := cachedServer()
	ctx := context.Background()
	doc := &models.WikiDocument{DocumentID: uuid.New(), ContentState: []byte("x")}

	s.rememberMarkdown(ctx, doc, "text")
	if len(c.data) != 0 {
		t.Fatal("an unstamped document was cached")
	}
}
