package gqlctx

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

type countingFinder struct {
	calls int
	fail  bool
}

func (f *countingFinder) FindByID(_ context.Context, id uuid.UUID) (models.Operation, error) {
	f.calls++
	if f.fail {
		return models.Operation{}, errors.New("down")
	}
	return models.Operation{OperationID: id}, nil
}

// One fetch per request per operation is the whole point.
func TestLoadOperation_MemoisesWithinARequest(t *testing.T) {
	finder := &countingFinder{}
	ctx := WithOperationMemo(context.Background())
	id := uuid.New()

	for i := 0; i < 3; i++ {
		op, err := LoadOperation(ctx, finder, id)
		if err != nil || op.OperationID != id {
			t.Fatalf("load %d: %v %+v", i, err, op)
		}
	}
	if _, err := LoadOperation(ctx, finder, uuid.New()); err != nil {
		t.Fatal(err)
	}
	if finder.calls != 2 {
		t.Fatalf("finder called %d times, want 2 (one per distinct id)", finder.calls)
	}
}

// Without a memo on the context the call is a plain pass-through, so the
// GraphQL path is unchanged.
func TestLoadOperation_PassesThroughWithoutAMemo(t *testing.T) {
	finder := &countingFinder{}
	id := uuid.New()
	for i := 0; i < 2; i++ {
		if _, err := LoadOperation(context.Background(), finder, id); err != nil {
			t.Fatal(err)
		}
	}
	if finder.calls != 2 {
		t.Fatalf("finder called %d times, want 2", finder.calls)
	}
}

// A failed fetch must not be remembered as "not found" for the rest of the
// request.
func TestLoadOperation_DoesNotMemoiseErrors(t *testing.T) {
	finder := &countingFinder{fail: true}
	ctx := WithOperationMemo(context.Background())
	id := uuid.New()

	if _, err := LoadOperation(ctx, finder, id); err == nil {
		t.Fatal("expected an error")
	}
	finder.fail = false
	if _, err := LoadOperation(ctx, finder, id); err != nil {
		t.Fatalf("second load should have retried: %v", err)
	}
	if finder.calls != 2 {
		t.Fatalf("finder called %d times, want 2", finder.calls)
	}
}
