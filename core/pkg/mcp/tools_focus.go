package mcp

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
)

type getUserFocusArgs struct{}

type userFocusResult struct {
	// Present is false when the operator has not published a location
	// recently — they closed the tab, or went to do something else.
	Present bool   `json:"present"`
	Focus   *Focus `json:"focus,omitempty"`
	Note    string `json:"note,omitempty"`
}

func registerFocusTools(s *Server) {
	register(s, &mcp.Tool{
		Name: "get_user_focus",
		Description: "See what the operator is looking at right now: which operation is open, " +
			"which page they are on, which host or credential is selected. Call this before " +
			"asking them where to look — most of the time it already answers the question. " +
			"Every other tool defaults to the operation reported here.",
	}, readTool, handleGetUserFocus)
}

func handleGetUserFocus(ctx context.Context, s *Server, _ getUserFocusArgs) (toolResult, error) {
	auth := gqlctx.AuthFromContext(ctx)

	// Only ever the key owner's focus. An agent follows the person who
	// delegated to it, not whoever else happens to be online.
	focus, ok := ReadFocus(ctx, s.deps.Cache, auth.UserID)
	if !ok {
		return toolResult{
			Payload: userFocusResult{
				Present: false,
				Note:    "The operator is not currently active in the app. Pass operation_id explicitly.",
			},
			Summary: "checked operator focus (away)",
		}, nil
	}

	return toolResult{
		Payload: userFocusResult{Present: true, Focus: &focus},
		Summary: "checked operator focus",
	}, nil
}
