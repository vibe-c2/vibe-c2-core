package mcp

import (
	"strings"
	"testing"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/skills"
)

// The built-in appears in the listing, because a listing that silently leaves
// something out invites the reader to conclude it does not exist — reported
// from production twice as "can't find builtin vibe-c2 skill".
func TestBuiltinSkillIsListed(t *testing.T) {
	view, ok := builtinSkillView("")
	if !ok {
		t.Fatal("an unfiltered listing must include the built-in skill")
	}
	if view.Name != SkillName || !view.BuiltIn {
		t.Fatalf("got %+v, want the built-in marked as such", view)
	}
	// Nobody published it, so nobody owns it and there is no history to show.
	if view.Owner != "" || view.Mine {
		t.Fatalf("built-in should have no owner, got %+v", view)
	}
}

// It still answers a query, so searching for it finds it rather than
// returning the whole registry.
func TestBuiltinSkillMatchesAQuery(t *testing.T) {
	for _, q := range []string{"vibe-c2", "VIBE-C2", "  vibe-c2  "} {
		if _, ok := builtinSkillView(q); !ok {
			t.Fatalf("query %q should match the built-in", q)
		}
	}
	if _, ok := builtinSkillView("something-else-entirely"); ok {
		t.Fatal("an unrelated query should not match the built-in")
	}
}

// get_skill has to answer for it without consulting the registry, which holds
// no row for it and would report it missing.
func TestBuiltinSkillDetailIsFetchable(t *testing.T) {
	detail := builtinSkillDetail()
	if detail.DownloadURL == "" {
		t.Fatal("the built-in must carry a download URL an agent can fetch")
	}
	if !strings.Contains(detail.DownloadURL, SkillName) {
		t.Fatalf("download URL does not name the skill: %q", detail.DownloadURL)
	}
	// The one thing an agent must not conclude is that it can install this
	// into the session it is running in.
	if !strings.Contains(detail.HowToUse, "cannot be loaded into this session") &&
		!strings.Contains(detail.HowToUse, "cannot be loaded into the session") {
		t.Fatalf("HowToUse should say it cannot self-install: %q", detail.HowToUse)
	}
}

func TestBuiltinSkillNameIsRecognisedInAQuery(t *testing.T) {
	tests := []struct {
		query string
		want  bool
	}{
		{"vibe-c2", true},
		{"VIBE-C2", true},
		{"  vibe-c2  ", true},
		{"vibe-c2-extras", true},
		{"recon", false},
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.query, func(t *testing.T) {
			got := skills.IsReserved(strings.ToLower(strings.TrimSpace(tt.query)))
			if got != tt.want {
				t.Fatalf("IsReserved(%q) = %v, want %v", tt.query, got, tt.want)
			}
		})
	}
}

// The note has to fire on an unfiltered listing, not only on a search for the
// name. An agent asked to inventory a server's skills passes no query at all,
// enumerates what comes back and reports the built-in as absent — which is how
// this arrived the second time, after a first fix that only covered the search.
func TestBuiltinNoteFiresOnAnUnfilteredListing(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  bool
	}{
		{"unfiltered listing", "", true},
		{"searching for the name", "vibe-c2", true},
		{"searching for something else", "recon", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			q := strings.ToLower(strings.TrimSpace(tt.query))
			got := q == "" || skills.IsReserved(q)
			if got != tt.want {
				t.Fatalf("note fires = %v for query %q, want %v", got, tt.query, tt.want)
			}
		})
	}
}

// NormalizeName cannot stand in for the check above: it is the guard that
// refuses a reserved name at publish time, so it reports an error rather than
// the name.
func TestNormalizeNameRefusesTheBuiltinName(t *testing.T) {
	if _, err := skills.NormalizeName("vibe-c2"); err == nil {
		t.Fatal("expected the reserved name to be refused")
	}
}
