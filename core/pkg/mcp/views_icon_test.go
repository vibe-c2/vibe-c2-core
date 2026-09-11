package mcp

import (
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// Listings carry each page's icon so an agent can read the house style in one
// call. Without it, learning what the operator's pages use meant opening them
// one at a time, which in practice meant guessing instead — and a page whose
// icon breaks the tree's convention looks like it came from somewhere else.
func TestToWikiDocView_CarriesTheVisualIdentity(t *testing.T) {
	tests := []struct {
		name      string
		doc       models.WikiDocument
		wantEmoji string
		wantIcon  string
	}{
		{
			name:     "a concept icon travels",
			doc:      models.WikiDocument{Icon: "ShieldAlert"},
			wantIcon: "ShieldAlert",
		},
		{
			name:     "a brand logo travels",
			doc:      models.WikiDocument{Icon: "si:linux"},
			wantIcon: "si:linux",
		},
		{
			name:      "an emoji travels",
			doc:       models.WikiDocument{Emoji: "🔑"},
			wantEmoji: "🔑",
		},
		{
			// The default every page gets when nobody chose anything. Emitting
			// it would bury the handful of deliberate choices in noise, which
			// is the one thing these fields exist to show.
			name: "the adaptive default is omitted",
			doc:  models.WikiDocument{Icon: AdaptiveIconName},
		},
		{
			name: "no identity at all is omitted",
			doc:  models.WikiDocument{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc := tt.doc
			doc.DocumentID = uuid.New()
			doc.Title = "Recon"

			view := toWikiDocView(&doc)
			if view.Icon != tt.wantIcon {
				t.Errorf("Icon = %q, want %q", view.Icon, tt.wantIcon)
			}
			if view.Emoji != tt.wantEmoji {
				t.Errorf("Emoji = %q, want %q", view.Emoji, tt.wantEmoji)
			}
		})
	}
}
