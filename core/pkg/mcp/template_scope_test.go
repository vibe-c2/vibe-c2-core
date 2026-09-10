package mcp

import (
	"fmt"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// A template listing used to cover exactly one operation, which hid the
// Public wiki entirely — the place a team keeps its house templates, and
// often the only place there are any. An operator looking straight at a list
// of templates was told the agent could see none.
func TestPublicTemplateScope(t *testing.T) {
	engagement := uuid.New()
	other := uuid.New()

	tests := []struct {
		name        string
		opID        uuid.UUID
		agent       *gqlctx.AgentInfo
		agentErr    error
		wantInclude bool
		wantNote    bool
	}{
		{
			name:        "unscoped key reaches the shared templates",
			opID:        engagement,
			agent:       &gqlctx.AgentInfo{},
			wantInclude: true,
		},
		{
			name:        "key scoped to an operation that includes Public reaches them",
			opID:        engagement,
			agent:       &gqlctx.AgentInfo{OperationScopes: []uuid.UUID{engagement, models.PublicOperationID}},
			wantInclude: true,
		},
		{
			name:        "key scoped away from Public is told why they are missing",
			opID:        engagement,
			agent:       &gqlctx.AgentInfo{OperationScopes: []uuid.UUID{engagement, other}},
			wantInclude: false,
			wantNote:    true,
		},
		{
			// Listing Public itself already returns them; reaching again
			// would show every shared template twice.
			name:        "listing Public does not fold Public in again",
			opID:        models.PublicOperationID,
			agent:       &gqlctx.AgentInfo{},
			wantInclude: false,
			wantNote:    false,
		},
		{
			name:        "a scoped key listing Public still does not duplicate",
			opID:        models.PublicOperationID,
			agent:       &gqlctx.AgentInfo{OperationScopes: []uuid.UUID{engagement}},
			wantInclude: false,
			wantNote:    false,
		},
		{
			name:        "missing agent identity is refused, not assumed",
			opID:        engagement,
			agent:       nil,
			agentErr:    fmt.Errorf("no agent identity on this request"),
			wantInclude: false,
			wantNote:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			include, note := publicTemplateScope(tt.opID, tt.agent, tt.agentErr)

			if include != tt.wantInclude {
				t.Errorf("include = %v, want %v", include, tt.wantInclude)
			}
			if got := note != ""; got != tt.wantNote {
				t.Errorf("note = %q, wanted a note: %v", note, tt.wantNote)
			}
			if include && note != "" {
				t.Errorf("included the shared templates and still explained their absence: %q", note)
			}
			// The note is the only thing that tells an agent its view is
			// narrower than the operator's, so it has to name where the
			// missing templates live.
			if note != "" && !strings.Contains(note, "Public") {
				t.Errorf("note does not say where the templates are: %q", note)
			}
		})
	}
}
