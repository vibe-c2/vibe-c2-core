package gqlctx

import (
	"context"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// Request-scoped user memo.
//
// Users are the most re-resolved entity in the schema: createdBy,
// lastUpdatedBy, deletedBy, assignees, actor, commentAuthor and session owner
// are all per-row field resolvers, and a page of rows is usually the work of a
// handful of operators. Fourteen field resolvers used to issue one query each,
// per row, per field — a list of 200 tasks showing createdBy and lastUpdatedBy
// cost 400 lookups of maybe three distinct users.
//
// Mechanics and lifetime are in entitymemo.go.

// UserFinder is the single-row lookup the memo wraps.
type UserFinder interface {
	FindByID(ctx context.Context, id uuid.UUID) (models.User, error)
}

// UserBatchFinder is the batch lookup PreloadUsers uses. Repositories that
// satisfy UserFinder generally satisfy this too; it is a separate interface so
// a caller with only one of them is not forced to implement the other.
type UserBatchFinder interface {
	FindByIDs(ctx context.Context, ids []uuid.UUID) ([]models.User, error)
}

// WithUserMemo attaches a fresh memo to the context. Call once per request.
func WithUserMemo(ctx context.Context) context.Context {
	return withMemo[models.User](ctx)
}

// LoadUser fetches a user through the request's memo when there is one, and
// straight from the finder otherwise. Per-row field resolvers should call this
// rather than userRepo.FindByID; a mutation that re-reads a user it just wrote
// should not, since the memo would return the pre-write copy.
func LoadUser(ctx context.Context, finder UserFinder, id uuid.UUID) (models.User, error) {
	return loadEntity(ctx, id, finder.FindByID)
}

// PreloadUsers fills the memo for ids in one round trip, turning the field
// resolvers that follow into map lookups. Call it from a list resolver once the
// rows are known and their user ids can be collected.
//
// Ids already memoised are not re-fetched, and nil ids are skipped; with
// nothing left to fetch there is no query at all. Ids that match no row are
// simply absent, so LoadUser still reaches the repository for them and the
// caller's existing "user was deleted" handling is unchanged.
//
// A failure is not fatal and is returned only for logging: every field resolver
// still works without a primed memo, just one query at a time. Callers may
// ignore it.
func PreloadUsers(ctx context.Context, batch UserBatchFinder, ids []uuid.UUID) error {
	missing := memoMissing[models.User](ctx, ids)
	if len(missing) == 0 {
		return nil
	}

	users, err := batch.FindByIDs(ctx, missing)
	if err != nil {
		return err
	}
	for i := range users {
		primeEntity(ctx, users[i].UserID, users[i])
	}
	return nil
}
