package mcp

import (
	"strings"
	"testing"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// Writing Markdown into a drawing does not fail — it grows a prose document
// beside the scene and the next projection indexes that instead. Nothing
// surfaces an error, so the refusal has to happen here or not at all.
func TestRequireProse(t *testing.T) {
	tests := []struct {
		name       string
		kind       models.WikiDocumentKind
		wantRefuse bool
	}{
		{"legacy page with no kind", "", false},
		{"prose page", models.WikiDocumentKindDocument, false},
		{"drawing", models.WikiDocumentKindDrawing, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc := &models.WikiDocument{Title: "Attack path", Kind: tt.kind}
			err := requireProse(doc, "write")

			if !tt.wantRefuse {
				if err != nil {
					t.Fatalf("unexpected refusal: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatal("expected a refusal, got nil")
			}
			// A refusal is a policy decision, not a fault: misfiling it as an
			// error sends an operator debugging a working system.
			if !isRefusal(err) {
				t.Fatalf("not classified as a refusal: %v", err)
			}
			// An agent that gets a bare "not allowed" retries the same call,
			// so the refusal has to name the tool that does work.
			if !strings.Contains(err.Error(), "edit_wiki_drawing") {
				t.Fatalf("refusal does not point at the drawing tools: %v", err)
			}
		})
	}
}

// The mirror: a drawing tool pointed at a prose page is equally wrong, and
// equally worth naming the right tool for.
func TestRequireDrawing(t *testing.T) {
	tests := []struct {
		name       string
		kind       models.WikiDocumentKind
		wantRefuse bool
	}{
		{"legacy page with no kind", "", true},
		{"prose page", models.WikiDocumentKindDocument, true},
		{"drawing", models.WikiDocumentKindDrawing, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc := &models.WikiDocument{Title: "Runbook", Kind: tt.kind}
			err := requireDrawing(doc, "edit")

			if !tt.wantRefuse {
				if err != nil {
					t.Fatalf("unexpected refusal: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatal("expected a refusal, got nil")
			}
			if !isRefusal(err) {
				t.Fatalf("not classified as a refusal: %v", err)
			}
			if !strings.Contains(err.Error(), "edit_wiki_document") {
				t.Fatalf("refusal does not point at the Markdown tools: %v", err)
			}
		})
	}
}
