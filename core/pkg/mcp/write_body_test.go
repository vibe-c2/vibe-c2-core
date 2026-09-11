package mcp

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
	"go.uber.org/zap"
)

// An oversized body must be refused here, with the limit named and a way
// forward, rather than travelling to the sidecar and coming back as
// "apply-markdown returned 413" — an error naming a service the agent has
// never heard of, from which the natural recovery is to start chunking.
// Chunking is the behaviour this message exists to prevent.
func TestWriteBody_RefusesOversizedBodyWithGuidance(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})
	doc := &models.WikiDocument{DocumentID: uuid.New(), Title: "Recon"}

	_, err := s.writeBody(context.Background(), doc,
		strings.Repeat("x", wiki.MaxMarkdownBytes+1), wiki.ApplyReplace)

	if err == nil {
		t.Fatal("accepted a body over the limit")
	}
	if !isRefusal(err) {
		t.Errorf("not a refusal, so the agent will treat it as a fault to retry: %v", err)
	}

	msg := err.Error()
	for _, want := range []string{"attach_text_to_wiki_document", "Do not split"} {
		if !strings.Contains(msg, want) {
			t.Errorf("message does not mention %q: %s", want, msg)
		}
	}
	// The refusal has to fire before the sidecar is consulted, or a
	// deployment without one configured would report the wrong problem.
	if strings.Contains(msg, "collaboration service is not configured") {
		t.Errorf("size check ran after the sidecar check: %s", msg)
	}
}

// The limit the tools advertise and the limit the sidecar enforces are
// declared in different languages and can only be kept together by hand.
// This pins the Go half so a change here is deliberate.
func TestMaxMarkdownBytes_MatchesTheSidecar(t *testing.T) {
	const sidecarMaxInputBytes = 1024 * 1024 // hocuspocus/src/apply-markdown.ts
	if wiki.MaxMarkdownBytes != sidecarMaxInputBytes {
		t.Fatalf("MaxMarkdownBytes = %d, sidecar MAX_INPUT_BYTES = %d",
			wiki.MaxMarkdownBytes, sidecarMaxInputBytes)
	}
}
