package gqlctx

import (
	"context"
	"sync"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// Request-scoped operation memo.
//
// Almost every resolver call starts by loading the operation to authorize
// against it, and a tool call in the MCP layer authorizes once itself and then
// calls a resolver that authorizes again — the same document, fetched twice
// (or three times) per request. The memo lets every loader on one request
// share a single fetch. It lives in the context so it is created per request
// and dies with it; nothing is cached across requests, so a membership change
// is visible on the next call exactly as before.

type opMemoKey struct{}

type operationMemo struct {
	mu  sync.Mutex
	ops map[uuid.UUID]models.Operation
}

// OperationFinder is the one repository method the memo wraps.
type OperationFinder interface {
	FindByID(ctx context.Context, id uuid.UUID) (models.Operation, error)
}

// WithOperationMemo attaches a fresh memo to the context. Call once per
// request, at the boundary where the context is built.
func WithOperationMemo(ctx context.Context) context.Context {
	return context.WithValue(ctx, opMemoKey{}, &operationMemo{ops: map[uuid.UUID]models.Operation{}})
}

// LoadOperation fetches an operation through the request's memo when there
// is one, and straight from the finder otherwise. Errors are never memoised:
// a transient failure should not poison the rest of the request.
func LoadOperation(ctx context.Context, finder OperationFinder, id uuid.UUID) (models.Operation, error) {
	memo, _ := ctx.Value(opMemoKey{}).(*operationMemo)
	if memo == nil {
		return finder.FindByID(ctx, id)
	}

	memo.mu.Lock()
	op, hit := memo.ops[id]
	memo.mu.Unlock()
	if hit {
		return op, nil
	}

	op, err := finder.FindByID(ctx, id)
	if err != nil {
		return op, err
	}
	memo.mu.Lock()
	memo.ops[id] = op
	memo.mu.Unlock()
	return op, nil
}
