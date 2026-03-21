// context.go — Bridges authentication data from the Gin HTTP layer into
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

package resolver

import "context"

// authKey is a private type used as a context key. Using a private type
// (instead of a string like "auth") prevents other packages from
// accidentally overwriting our value — a Go best practice for context keys.
type authKey struct{}

// AuthInfo holds the authenticated user's identity, extracted from the JWT.
// This is what resolvers see when they need to know "who is calling?".
type AuthInfo struct {
	UserID   string   // The user's UUID (from JWT "sub" claim)
	Username string   // The user's display name
	Roles    []string // RBAC roles like ["admin"] or ["user"]
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
