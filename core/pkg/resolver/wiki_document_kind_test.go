package resolver

import (
	"context"
	"testing"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// hasContent gates the create-from-template picker and the hover preview. Read
// from Content alone it reports every drawing as empty forever, because a
// drawing's body never reaches that field — so a finished diagram would be
// hidden from the picker and captioned "This page is empty".
func TestWikiDocumentHasContentIsKindAware(t *testing.T) {
	r := &wikiDocumentResolver{}

	tests := []struct {
		name string
		doc  models.WikiDocument
		want bool
	}{
		{
			name: "prose page with a body",
			doc:  models.WikiDocument{Content: "some prose"},
			want: true,
		},
		{
			name: "prose page that is only whitespace",
			doc:  models.WikiDocument{Content: "  \n\t "},
			want: false,
		},
		{
			name: "legacy row with no kind behaves as prose",
			doc:  models.WikiDocument{Content: "some prose", Kind: ""},
			want: true,
		},
		{
			name: "drawing with elements, despite an empty Content",
			doc: models.WikiDocument{
				Kind:                models.WikiDocumentKindDrawing,
				Content:             "",
				DrawingElementCount: 3,
			},
			want: true,
		},
		{
			name: "drawing with a blank canvas",
			doc: models.WikiDocument{
				Kind:                models.WikiDocumentKindDrawing,
				DrawingElementCount: 0,
			},
			want: false,
		},
		{
			// The scene's labels are projected into Content for search, so a
			// drawing can carry text — but the element count is still what
			// decides, since a diagram of unlabelled boxes has no text at all.
			name: "drawing whose labels were projected into Content",
			doc: models.WikiDocument{
				Kind:                models.WikiDocumentKindDrawing,
				Content:             "Domain Controller",
				DrawingElementCount: 2,
			},
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := r.WikiDocumentHasContent(context.Background(), &tt.doc)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("hasContent = %v, want %v", got, tt.want)
			}
		})
	}
}

// A drawing backup measured by its Markdown reports 0 bytes however elaborate
// the scene is, which makes the backup list useless for exactly the pages
// whose history is hardest to reason about.
func TestWikiDocumentBackupContentLengthIsKindAware(t *testing.T) {
	r := &wikiDocumentResolver{}

	prose := &models.WikiDocumentBackup{Content: "hello"}
	drawing := &models.WikiDocumentBackup{
		Kind:         models.WikiDocumentKindDrawing,
		Content:      "",
		ContentState: []byte{1, 2, 3, 4, 5, 6, 7},
	}

	if got, _ := r.WikiDocumentBackupContentLength(context.Background(), prose); got != 5 {
		t.Fatalf("prose length = %d, want 5", got)
	}
	if got, _ := r.WikiDocumentBackupContentLength(context.Background(), drawing); got != 7 {
		t.Fatalf("drawing length = %d, want 7", got)
	}
}
