package mcp

import (
	"context"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/focus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
)

// focusOperation reports the operation the key's OWNER is currently looking
// at. Only ever the owner's own focus: an agent follows the person who
// delegated to it, not whoever else happens to be online.
func (s *Server) focusOperation(ctx context.Context) (uuid.UUID, bool) {
	auth := gqlctx.AuthFromContext(ctx)
	if auth.UserID == "" {
		return uuid.Nil, false
	}
	f, ok := focus.Read(ctx, s.deps.Cache, auth.UserID)
	if !ok || f.OperationID == "" {
		return uuid.Nil, false
	}
	opID, err := uuid.Parse(f.OperationID)
	if err != nil {
		return uuid.Nil, false
	}
	return opID, true
}
