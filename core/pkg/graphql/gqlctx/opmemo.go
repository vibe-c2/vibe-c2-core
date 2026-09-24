package gqlctx

import (
	"context"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// Request-scoped operation memo.
//
// Almost every resolver call starts by loading the operation to authorize
// against it, and a tool call in the MCP layer authorizes once itself and then
// calls a resolver that authorizes again — the same document, fetched twice
// (or three times) per request. A list response resolves the `operation` field
// once per row, every time for the same document. The memo lets every loader
// on one request share a single fetch.
//
// Mechanics and lifetime are in entitymemo.go.

// OperationFinder is the one repository method the memo wraps.
type OperationFinder interface {
	FindByID(ctx context.Context, id uuid.UUID) (models.Operation, error)
}

// WithOperationMemo attaches a fresh memo to the context. Call once per
// request, at the boundary where the context is built.
func WithOperationMemo(ctx context.Context) context.Context {
	return withMemo[models.Operation](ctx)
}

// LoadOperation fetches an operation through the request's memo when there
// is one, and straight from the finder otherwise. Errors are never memoised:
// a transient failure should not poison the rest of the request.
//
// Authorization helpers must call this rather than finder.FindByID, or the
// fetch is not shared. The exception is a re-read after a write: the memo
// would hand back the pre-write copy.
func LoadOperation(ctx context.Context, finder OperationFinder, id uuid.UUID) (models.Operation, error) {
	return loadEntity(ctx, id, finder.FindByID)
}
