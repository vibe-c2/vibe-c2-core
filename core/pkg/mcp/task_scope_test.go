package mcp

import (
	"slices"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

func TestTaskInAgentScope(t *testing.T) {
	owner := uuid.New()
	colleague := uuid.New()
	stranger := uuid.New()

	cases := []struct {
		name      string
		assignees []uuid.UUID
		want      bool
		why       string
	}{
		{
			name: "unassigned", assignees: nil, want: true,
			why: "nobody has claimed it, and an agent must be able to read back a task it just created",
		},
		{
			name: "assigned to the owner", assignees: []uuid.UUID{owner}, want: true,
			why: "this is the operator's own work",
		},
		{
			name: "shared between the owner and a colleague", assignees: []uuid.UUID{colleague, owner}, want: true,
			why: "still the operator's work; sharing it does not remove them from it",
		},
		{
			name: "taken by someone else", assignees: []uuid.UUID{colleague}, want: false,
			why: "a colleague's work is not something delegating a key hands over",
		},
		{
			name: "taken by several other people", assignees: []uuid.UUID{colleague, stranger}, want: false,
			why: "same, with more of them",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			task := &models.Task{Name: "t", AssigneeIDs: tc.assignees}
			if got := taskInAgentScope(task, owner); got != tc.want {
				t.Fatalf("taskInAgentScope = %v, want %v — %s", got, tc.want, tc.why)
			}
		})
	}
}

func TestRequireTaskInScope(t *testing.T) {
	owner := uuid.New()

	if err := requireTaskInScope(&models.Task{AssigneeIDs: []uuid.UUID{owner}}, owner); err != nil {
		t.Fatalf("the operator's own task was refused: %v", err)
	}

	err := requireTaskInScope(&models.Task{Name: "Rotate creds", AssigneeIDs: []uuid.UUID{uuid.New()}}, owner)
	if err == nil {
		t.Fatal("another operator's task was allowed")
	}
	if !isRefusal(err) {
		t.Errorf("should be a refusal, not a fault: %v", err)
	}
	// The agent needs to know the rule, or it will keep trying variations.
	if !strings.Contains(err.Error(), "another operator") {
		t.Errorf("the refusal should explain why: %v", err)
	}
}

// An agent may add or remove only itself. SetTaskAssignees replaces the list
// outright, so anything that hands it a freshly-built list has to preserve
// everyone else — otherwise an agent claiming a shared task silently drops the
// colleague who was already on it.
func TestOwnAssignmentPreservesOthers(t *testing.T) {
	owner := uuid.New()
	colleague := uuid.New()

	t.Run("assigning keeps existing assignees", func(t *testing.T) {
		got := withOwnerAssigned([]uuid.UUID{colleague}, owner)
		if !slices.Contains(got, colleague.String()) {
			t.Error("the colleague's claim was dropped")
		}
		if !slices.Contains(got, owner.String()) {
			t.Error("the owner was not added")
		}
		if len(got) != 2 {
			t.Fatalf("got %v, want exactly the two", got)
		}
	})

	t.Run("assigning twice does not duplicate", func(t *testing.T) {
		got := withOwnerAssigned([]uuid.UUID{owner}, owner)
		if len(got) != 1 {
			t.Fatalf("got %v, want one entry", got)
		}
	})

	t.Run("unassigning removes only the owner", func(t *testing.T) {
		got := withOwnerUnassigned([]uuid.UUID{colleague, owner}, owner)
		if slices.Contains(got, owner.String()) {
			t.Error("the owner was not removed")
		}
		if !slices.Contains(got, colleague.String()) {
			t.Error("the colleague's claim was removed too")
		}
	})

	t.Run("unassigning when not assigned is a no-op", func(t *testing.T) {
		got := withOwnerUnassigned([]uuid.UUID{colleague}, owner)
		if len(got) != 1 || got[0] != colleague.String() {
			t.Fatalf("got %v, want just the colleague", got)
		}
	})
}
