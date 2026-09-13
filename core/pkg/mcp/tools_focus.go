package mcp

import (
	"context"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/focus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

type getUserFocusArgs struct{}

type userFocusResult struct {
	// Present is false when the operator has not published a location
	// recently — they closed the tab, or went to do something else.
	Present bool         `json:"present"`
	Focus   *focus.Focus `json:"focus,omitempty"`
	// Summary is the focused operation in numbers, when there is one this
	// key may read. Orienting used to be two calls — focus, then summary —
	// each a full round trip through the dispatcher; now it is one.
	Summary *operationCounts `json:"summary,omitempty"`
	Notes   []string         `json:"notes,omitempty"`
}

func registerFocusTools(s *Server) {
	register(s, &mcp.Tool{
		Name: "get_user_focus",
		Description: "What the operator is looking at now: operation, page, selected record, " +
			"plus that operation's counts. Other tools default to this operation.",
	}, readTool, handleGetUserFocus)
}

func handleGetUserFocus(ctx context.Context, s *Server, _ getUserFocusArgs) (toolResult, error) {
	auth := gqlctx.AuthFromContext(ctx)

	// Only ever the key owner's focus. An agent follows the person who
	// delegated to it, not whoever else happens to be online.
	current, ok := focus.Read(ctx, s.deps.Cache, auth.UserID)
	if !ok {
		return toolResult{
			Payload: userFocusResult{
				Present: false,
				Notes:   []string{"The operator is not currently active in the app. Pass operation_id explicitly."},
			},
			Summary: "checked operator focus (away)",
		}, nil
	}

	result := userFocusResult{Present: true, Focus: &current}
	if opID, err := uuid.Parse(current.OperationID); err == nil {
		if _, err := s.authorizeOperation(ctx, opID, models.OperationRoleViewer); err == nil {
			counts, notes := s.countOperation(ctx, opID)
			result.Summary = &counts
			result.Notes = notes
		} else {
			result.Notes = append(result.Notes,
				"The operator's current operation is outside this key's scope; call list_operations.")
		}
	}

	return toolResult{
		Payload:     result,
		OperationID: focusOperationID(current),
		Summary:     "checked operator focus",
	}, nil
}

// focusOperationID is the focused operation for attribution, or nil.
func focusOperationID(f focus.Focus) *uuid.UUID {
	id, err := uuid.Parse(f.OperationID)
	if err != nil {
		return nil
	}
	return &id
}
