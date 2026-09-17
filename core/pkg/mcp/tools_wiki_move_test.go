package mcp

import (
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// The no-op guard has to treat "no parent" and "the top level" as the same
// place, or moving a root page to the root would look like a real move.
func TestSameWikiParent(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	docA := &models.WikiDocument{DocumentID: a}

	tests := []struct {
		name    string
		current *uuid.UUID
		target  *models.WikiDocument
		want    bool
	}{
		{"root page asked for the root", nil, nil, true},
		{"root page asked for a parent", nil, docA, false},
		{"child asked for the root", &a, nil, false},
		{"child asked for the parent it has", &a, docA, true},
		{"child asked for another parent", &b, docA, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sameWikiParent(tt.current, tt.target); got != tt.want {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}

// Moving a page under something inside its own subtree would cut the branch
// off the tree: the pages stay in the database, reachable from nothing.
func TestWikiParentIsBelow(t *testing.T) {
	root, child, grandchild, elsewhere := uuid.New(), uuid.New(), uuid.New(), uuid.New()

	tests := []struct {
		name   string
		parent *models.WikiDocument
		docID  uuid.UUID
		want   bool
	}{
		{
			name:   "direct child of the page being moved",
			parent: &models.WikiDocument{DocumentID: child, PathIDs: []uuid.UUID{root}},
			docID:  root,
			want:   true,
		},
		{
			name:   "deeper descendant of the page being moved",
			parent: &models.WikiDocument{DocumentID: grandchild, PathIDs: []uuid.UUID{root, child}},
			docID:  root,
			want:   true,
		},
		{
			name:   "unrelated page",
			parent: &models.WikiDocument{DocumentID: elsewhere},
			docID:  root,
			want:   false,
		},
		{
			name:   "the page's own ancestor, which is where it already is",
			parent: &models.WikiDocument{DocumentID: root},
			docID:  child,
			want:   false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := wikiParentIsBelow(tt.parent, tt.docID); got != tt.want {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}
