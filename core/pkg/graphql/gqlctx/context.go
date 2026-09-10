// Package gqlctx bridges authentication data from the Gin HTTP layer into
// the GraphQL resolver layer via Go's context.Context.
//
// How the auth flow works:
//
//  1. Client sends HTTP request with "Authorization: Bearer <JWT>" header
//  2. Gin's JWTAuth middleware validates the token and sets userID, username,
//     and roles on the *gin.Context (Gin's own key-value store)
//  3. Our GraphQL handler (handler.go) extracts these values from gin.Context
//     and puts them into context.Context using WithAuthInfo()
//  4. Resolvers and directives call AuthFromContext() to read them back
//
// Why not just use gin.Context directly?
// Because GraphQL resolvers receive a plain context.Context, not a *gin.Context.
// We need to transfer the auth data from Gin's world into Go's standard context.
package gqlctx

import (
	"context"
	"slices"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// authKey is a private type used as a context key. Using a private type
// (instead of a string like "auth") prevents other packages from
// accidentally overwriting our value — a Go best practice for context keys.
type authKey struct{}

// AuthInfo holds the authenticated user's identity, extracted from the JWT.
// This is what resolvers see when they need to know "who is calling?".
type AuthInfo struct {
	UserID           string   // The user's UUID (from JWT "sub" claim)
	Username         string   // The user's display name
	Roles            []string // RBAC roles like ["admin"] or ["user"]
	CurrentSessionID string   // Session UUID from the JWT (for isCurrent detection)

	// Agent is non-nil only when the request authenticated with a delegated
	// agent key. UserID/Username/Roles still describe the OWNER — the agent
	// is not an account — so every existing check keeps working unchanged.
	// What this field adds is a ceiling: see authorization.AuthorizeOperationRole.
	Agent *AgentInfo
}

// AgentInfo is the authority-relevant subset of an agent key. Deliberately not
// the models.AgentKey row: resolvers have no business reaching the secret hash,
// and listing the fields here documents exactly what can narrow a request.
type AgentInfo struct {
	AgentKeyID      string
	KeyID           string
	Name            string
	OperationScopes []uuid.UUID
	MaxRole         models.OperationRole
	AllowWrites     bool
}

// AllowsOperation reports whether the key may act in the given operation.
// An empty OperationScopes means "any operation the owner belongs to" — the
// membership check itself is separate, so this is a narrowing filter and never
// a grant.
//
// The Public wiki is never narrowed away. It is not one of the owner's
// operations: it is a shared space every authenticated user already has, so
// scoping a key to an engagement says nothing about it. Treating an
// operation scope as a reason to withhold Public cut agents off from the
// shared templates and notes their operator was looking straight at.
//
// This is not a widening. Public grants an implicit *operator* role to
// everyone, and MaxRole still caps what the key may do there — a viewer-
// capped key reads Public and cannot write to it.
func (a *AgentInfo) AllowsOperation(operationID uuid.UUID) bool {
	if models.IsPublicOperation(operationID) {
		return true
	}
	if len(a.OperationScopes) == 0 {
		return true
	}
	return slices.Contains(a.OperationScopes, operationID)
}

// Label renders the agent for display and audit, e.g.
// "Claude — Nightfall (via eugen)".
func (a *AgentInfo) Label(ownerUsername string) string {
	if ownerUsername == "" {
		return a.Name
	}
	return a.Name + " (via " + ownerUsername + ")"
}

// WithAuthInfo stores authentication data in the context.
// Called by the GraphQL HTTP handler after extracting auth from Gin.
func WithAuthInfo(ctx context.Context, info AuthInfo) context.Context {
	return context.WithValue(ctx, authKey{}, info)
}

// AuthFromContext retrieves the authenticated user's info from the context.
// Returns a zero AuthInfo if not present (which should never happen behind
// the JWTAuth middleware, but is safe to handle).
func AuthFromContext(ctx context.Context) AuthInfo {
	info, _ := ctx.Value(authKey{}).(AuthInfo)
	return info
}
