package mcp

import (
	"context"
	"fmt"
	"slices"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// Task visibility for agents.
//
// An agent may work on its owner's tasks and on unclaimed ones. It may not see
// or touch work somebody else has taken.
//
// This is narrower than the platform's own rule, deliberately. Any operator in
// an operation can see the whole board — that is what a shared board is for.
// An agent is not a member of the team: it acts for one person, and having it
// read a colleague's task list, or quietly rewrite work they had picked up, is
// not something that person delegated by handing over a key. The restriction
// therefore lives here, in the agent layer, rather than in the task API where
// it would change what humans can do.
//
// Unassigned tasks stay in reach on purpose. Nobody has claimed them, an agent
// proposing or refining them steps on no one, and the alternative would make
// an agent unable to read back the very task it had just created.

// agentOwnerID is the user an agent is acting for.
func agentOwnerID(ctx context.Context) (uuid.UUID, error) {
	if _, err := agentFromContext(ctx); err != nil {
		return uuid.Nil, err
	}
	id, err := uuid.Parse(gqlctx.AuthFromContext(ctx).UserID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid caller id")
	}
	return id, nil
}

// taskInAgentScope reports whether an agent acting for owner may see a task.
//
// Note the deliberate asymmetry with "assigned to somebody else": a task the
// owner shares with a colleague is still the owner's work, so it stays
// visible. Only a task claimed exclusively by other people is out of bounds.
func taskInAgentScope(task *models.Task, owner uuid.UUID) bool {
	if len(task.AssigneeIDs) == 0 {
		return true
	}
	return slices.Contains(task.AssigneeIDs, owner)
}

// requireTaskInScope is the gate every task tool runs before acting.
func requireTaskInScope(task *models.Task, owner uuid.UUID) error {
	if taskInAgentScope(task, owner) {
		return nil
	}
	return refuse(
		"task %q is assigned to another operator, so this agent key cannot read or change it. "+
			"You can work on tasks assigned to the operator you act for, and on unassigned ones.",
		task.Name)
}

// withOwnerAssigned returns the assignee list with the owner added, preserving
// everyone else. An agent may only ever add or remove ITSELF — replacing the
// list wholesale is how it would silently drop a colleague's claim on shared
// work.
func withOwnerAssigned(existing []uuid.UUID, owner uuid.UUID) []string {
	out := make([]string, 0, len(existing)+1)
	for _, id := range existing {
		out = append(out, id.String())
	}
	if !slices.Contains(existing, owner) {
		out = append(out, owner.String())
	}
	return out
}

// withOwnerUnassigned is the inverse, again leaving other assignees alone.
func withOwnerUnassigned(existing []uuid.UUID, owner uuid.UUID) []string {
	out := make([]string, 0, len(existing))
	for _, id := range existing {
		if id != owner {
			out = append(out, id.String())
		}
	}
	return out
}
