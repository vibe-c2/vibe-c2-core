// directive.go — Implements the @hasPermission GraphQL directive.
//
// In GraphQL, a "directive" is a decorator you attach to schema fields to add
// cross-cutting behavior. Think of it like middleware, but for individual
// GraphQL fields instead of HTTP routes.
//
// In our schema, we write:
//
//	type Query {
//	    users(...): UserConnection! @hasPermission(permission: "user:read")
//	}
//
// gqlgen sees this and generates code that calls our HasPermission function
// BEFORE the actual resolver runs. If we return an error, the resolver is
// never called and the client gets a "forbidden" error.
//
// This is much cleaner than checking permissions inside every resolver —
// you can see the required permission right in the schema file.

package resolver

import (
	"context"
	"fmt"

	"github.com/99designs/gqlgen/graphql"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/permissions"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
)

// HasPermission is the directive handler for @hasPermission.
//
// Parameters:
//   - ctx:        the request context (contains AuthInfo from the JWT)
//   - obj:        the parent object being resolved (unused for our top-level directives)
//   - next:       the actual resolver function — we call this if the check passes
//   - permission: the required permission string from the schema (e.g. "user:read")
//
// Returns:
//   - The resolver's result if permission is granted
//   - An error if the user lacks the required permission
func HasPermission(ctx context.Context, obj interface{}, next graphql.Resolver, permission string) (interface{}, error) {
	// Extract the authenticated user's info from the context.
	// This was placed there by the GraphQL handler (see handler.go).
	auth := gqlctx.AuthFromContext(ctx)

	// Check if any of the user's roles grant the required permission.
	// For example, the "admin" role has "user:read", but the "user" role does not.
	// The AdminPermission ("admin") acts as a wildcard — it grants everything.
	if !permissions.HasPermissionForRoles(auth.Roles, permission) {
		return nil, fmt.Errorf("forbidden: missing permission '%s'", permission)
	}

	// Permission granted — call the actual resolver and return its result.
	return next(ctx)
}
