package mcp

import (
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// The cascade guard counts every page below the target, at any depth, and
// nothing beside it.
func TestCountDescendantsIn(t *testing.T) {
	root, child, grandchild, sibling := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	docs := []*models.WikiDocument{
		{DocumentID: root},
		{DocumentID: child, PathIDs: []uuid.UUID{root}},
		{DocumentID: grandchild, PathIDs: []uuid.UUID{root, child}},
		{DocumentID: sibling},
	}

	tests := []struct {
		name string
		id   uuid.UUID
		want int
	}{
		{"root counts child and grandchild", root, 2},
		{"child counts only the grandchild", child, 1},
		{"leaf has none", grandchild, 0},
		{"sibling has none", sibling, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := countDescendantsIn(docs, tt.id); got != tt.want {
				t.Fatalf("got %d, want %d", got, tt.want)
			}
		})
	}
}
