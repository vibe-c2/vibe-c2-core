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

// strDerefOr returns the pointed-to string or the fallback for nil. Unlike
// strDeref it preserves an explicit empty string ("" overrides the fallback),
// which matters for optional overrides where nil means "inherit" but "" means
// "clear" — e.g. instantiateTemplate's per-glyph icon args.
func strDerefOr(p *string, fallback string) string {
	if p == nil {
		return fallback
	}
	return *p
}
