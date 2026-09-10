package mcp

import (
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
	tests := []struct {
		name string
		opID uuid.UUID
		want bool
	}{
		{
			name: "an operation listing also reaches the shared templates",
			opID: uuid.New(),
			want: true,
		},
		{
			// Listing Public itself already returns them; reaching again
			// would show every shared template twice.
			name: "listing Public does not fold Public in again",
			opID: models.PublicOperationID,
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := publicTemplateScope(tt.opID); got != tt.want {
				t.Errorf("publicTemplateScope = %v, want %v", got, tt.want)
			}
		})
	}
}

// The reach into Public must not depend on the key's operation scope. This is
// the property the listing bug came down to: a key scoped to one engagement
// was refused on Public, so it saw none of the shared templates its operator
// could see. Asserted here as well as in pkg/authorization because this is the
// call site that regressed.
func TestPublicTemplatesIgnoreOperationScope(t *testing.T) {
	engagement := uuid.New()

	agents := map[string]*gqlctx.AgentInfo{
		"unscoped key":                                    {},
		"key scoped to one operation":                     {OperationScopes: []uuid.UUID{engagement}},
		"key scoped away from the operation being listed": {OperationScopes: []uuid.UUID{uuid.New()}},
	}

	for name, agent := range agents {
		t.Run(name, func(t *testing.T) {
			if !agent.AllowsOperation(models.PublicOperationID) {
				t.Error("agent key was narrowed away from the Public wiki by its operation scope")
			}
		})
	}
}

// The carve-out is a carve-out, not a hole: everything that is a real
// operation is still subject to the scope list.
func TestOperationScopeStillNarrowsRealOperations(t *testing.T) {
	scoped := uuid.New()
	agent := &gqlctx.AgentInfo{OperationScopes: []uuid.UUID{scoped}}

	if !agent.AllowsOperation(scoped) {
		t.Error("key refused the operation it is scoped to")
	}
	if agent.AllowsOperation(uuid.New()) {
		t.Error("key allowed an operation outside its scope")
	}
}
