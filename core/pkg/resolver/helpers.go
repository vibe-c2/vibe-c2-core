package resolver

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
)

// callerUIDFromCtx extracts the authenticated user's UUID from the request
// context. Used wherever a mutation needs to stamp CreatedByID /
// LastUpdatedByID / DeletedByID. Returns a typed error for malformed
// contexts so the resolver layer can wrap with feature-specific context.
func callerUIDFromCtx(ctx context.Context) (uuid.UUID, error) {
	auth := gqlctx.AuthFromContext(ctx)
	uid, err := uuid.Parse(auth.UserID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid caller ID: %w", err)
	}
	return uid, nil
}

// strDeref returns the pointed-to string or empty string for nil. Used to
// flatten optional GraphQL Input pointer fields into their stored form.
func strDeref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// boolDeref returns the pointed-to bool or the fallback for nil. Used to
// flatten optional GraphQL Input pointer fields with a documented default.
func boolDeref(p *bool, fallback bool) bool {
	if p == nil {
		return fallback
	}
	return *p
}
