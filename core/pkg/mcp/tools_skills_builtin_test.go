package mcp

import (
	"strings"
	"testing"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/skills"
)

// Asking the registry for the built-in skill is the one search whose empty
// result means something other than "not here": it is generated per download
// rather than published, and the agent running the search already has it.
// Reported from production as "can't find builtin vibe-c2 skill", which is
// exactly the conclusion an empty list invites.
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

// NormalizeName cannot stand in for the check above: it is the guard that
// refuses a reserved name at publish time, so it reports an error rather than
// the name.
func TestNormalizeNameRefusesTheBuiltinName(t *testing.T) {
	if _, err := skills.NormalizeName("vibe-c2"); err == nil {
		t.Fatal("expected the reserved name to be refused")
	}
}
