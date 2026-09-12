package mcp

import (
	"context"
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/authorization"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/middleware"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// authInfoFromGin converts what middleware.AuthN put on the gin context into
// the AuthInfo the resolver layer expects.
//
// The identity is the key OWNER's — an agent is a delegate, not an account —
// so every existing resolver check keeps working unchanged. What the Agent
// field adds is the ceiling that authorization.AuthorizeOperationRole
// intersects with the owner's live membership.
func authInfoFromGin(c *gin.Context) (gqlctx.AuthInfo, error) {
	key := middleware.AgentKeyFromContext(c)
	if key == nil {
		// Unreachable behind the route wiring: /api/v1/mcp is mounted after
		// AuthN, and a human or API-key caller is rejected in transport.go
		// before reaching here. Guard anyway rather than build an AuthInfo
		// with a nil ceiling, which would silently be an uncapped agent.
		return gqlctx.AuthInfo{}, fmt.Errorf("mcp: request is not agent-authenticated")
	}

	roles, _ := c.Get("roles")
	roleList, _ := roles.([]string)

	return gqlctx.AuthInfo{
		UserID:   c.GetString("userID"),
		Username: c.GetString("username"),
		Roles:    roleList,
		// No CurrentSessionID: agent auth is sessionless, same as API keys.
		Agent: &gqlctx.AgentInfo{
			AgentKeyID:      key.AgentKeyID.String(),
			KeyID:           key.KeyID,
			Name:            key.Name,
			OperationScopes: key.OperationScopes,
			MaxRole:         key.MaxRole,
			AllowWrites:     key.AllowWrites,
		},
	}, nil
}

// agentFromContext returns the calling agent. Every tool runs behind
// transport.go, which refuses non-agent callers, so a nil here is a wiring
// bug rather than an authorization decision.
func agentFromContext(ctx context.Context) (*gqlctx.AgentInfo, error) {
	agent := gqlctx.AuthFromContext(ctx).Agent
	if agent == nil {
		return nil, fmt.Errorf("no agent identity on this request")
	}
	return agent, nil
}

// agentKeyIDFromContext is the tolerant form of agentFromContext for the
// audit and replay paths, which need the key even when the call was refused
// before reaching a handler and must not add an error of their own.
func agentKeyIDFromContext(ctx context.Context) string {
	if agent := gqlctx.AuthFromContext(ctx).Agent; agent != nil {
		return agent.AgentKeyID
	}
	return ""
}

// requireWrites gates every mutating tool. This is a second, independent check
// on top of the role cap: a key may be operator-capped for reading depth while
// still being refused writes, and an operator who turns writes off expects
// that to hold even where the role would allow them.
func requireWrites(ctx context.Context) error {
	agent, err := agentFromContext(ctx)
	if err != nil {
		return err
	}
	if !agent.AllowWrites {
		return refuse("this agent key is read-only; ask the operator to enable writes on it")
	}
	return nil
}

// resolveOperation decides which operation a tool acts on.
//
// MCP has no notion of a "current" operation, so the id has to come from
// somewhere. In order of preference:
//
//  1. the explicit argument, if the tool was given one;
//  2. the operator's current focus, if they are looking at one right now
//     (see the focus beacon) — this is what lets an agent follow along
//     without being told where to look;
//  3. the key's only scope, when it is scoped to exactly one operation;
//  4. otherwise an error naming the candidates, because guessing wrong here
//     writes to the wrong engagement.
func (s *Server) resolveOperation(ctx context.Context, explicit string) (uuid.UUID, error) {
	if explicit != "" {
		opID, err := uuid.Parse(explicit)
		if err != nil {
			return uuid.Nil, fmt.Errorf("operation_id %q is not a valid id", explicit)
		}
		return opID, nil
	}

	agent, err := agentFromContext(ctx)
	if err != nil {
		return uuid.Nil, err
	}

	if opID, ok := s.focusOperation(ctx); ok {
		// Only follow the operator's focus into an operation this key may
		// actually use; otherwise fall through to the scope rules below and
		// produce a comprehensible error rather than a permission failure.
		if agent.AllowsOperation(opID) {
			return opID, nil
		}
	}

	if len(agent.OperationScopes) == 1 {
		return agent.OperationScopes[0], nil
	}

	if len(agent.OperationScopes) == 0 {
		return uuid.Nil, fmt.Errorf(
			"no operation_id given and this key is not scoped to one: pass operation_id, or call list_operations to see the options")
	}

	return uuid.Nil, fmt.Errorf(
		"no operation_id given and this key is scoped to %d operations: pass operation_id explicitly (call list_operations for the ids)",
		len(agent.OperationScopes))
}

// authorizeOperation loads the operation and applies the full check: the
// owner's membership, intersected with the key's scope list and role ceiling.
func (s *Server) authorizeOperation(ctx context.Context, opID uuid.UUID, minRole models.OperationRole) (models.Operation, error) {
	op, err := s.deps.OperationRepo.FindByID(ctx, opID)
	if err != nil {
		return models.Operation{}, fmt.Errorf("operation not found")
	}
	if err := authorization.AuthorizeOperationRole(ctx, &op, minRole); err != nil {
		return models.Operation{}, err
	}
	return op, nil
}
