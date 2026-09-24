package resolver

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// loadNullableUser resolves a user reference the schema renders as nullable —
// createdBy, lastUpdatedBy, deletedBy, actor, commentAuthor.
//
// The distinction it exists for: a deleted account is null, a database that
// did not answer is an error. Returning null for both means a Mongo timeout
// renders as "this account was deleted" on every row of a page, and the only
// signal is that names quietly stopped appearing. `what` names the reference
// in the error, since a page resolves several kinds at once.
func loadNullableUser(ctx context.Context, finder gqlctx.UserFinder, id uuid.UUID, what string) (*models.User, error) {
	if id == uuid.Nil {
		return nil, nil
	}
	user, err := gqlctx.LoadUser(ctx, finder, id)
	if err != nil {
		if repository.IsNotFound(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to load %s: %w", what, err)
	}
	return &user, nil
}

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
