package gqlctx

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

type countingUserFinder struct {
	calls   int
	batches [][]uuid.UUID
	err     error
}

func (f *countingUserFinder) FindByID(_ context.Context, id uuid.UUID) (models.User, error) {
	f.calls++
	if f.err != nil {
		return models.User{}, f.err
	}
	return models.User{UserID: id, Username: "u"}, nil
}

func (f *countingUserFinder) FindByIDs(_ context.Context, ids []uuid.UUID) ([]models.User, error) {
	f.batches = append(f.batches, ids)
	if f.err != nil {
		return nil, f.err
	}
	out := make([]models.User, 0, len(ids))
	for _, id := range ids {
		out = append(out, models.User{UserID: id, Username: "u"})
	}
	return out, nil
}

func TestLoadUser_MemoisesWithinAnOperation(t *testing.T) {
	// The shape this exists for: one createdBy id resolved once per row.
	ctx := WithUserMemo(context.Background())
	f := &countingUserFinder{}
	id := uuid.New()

	for range 200 {
		u, err := LoadUser(ctx, f, id)
		if err != nil {
			t.Fatalf("LoadUser: %v", err)
		}
		if u.UserID != id {
			t.Fatalf("got user %s, want %s", u.UserID, id)
		}
	}
	if f.calls != 1 {
		t.Errorf("200 resolutions of one id made %d queries, want 1", f.calls)
	}
}

func TestLoadUser_DistinctIDsEachFetchOnce(t *testing.T) {
	ctx := WithUserMemo(context.Background())
	f := &countingUserFinder{}
	ids := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}

	for range 3 {
		for _, id := range ids {
			if _, err := LoadUser(ctx, f, id); err != nil {
				t.Fatalf("LoadUser: %v", err)
			}
		}
	}
	if f.calls != len(ids) {
		t.Errorf("made %d queries for %d distinct ids, want %d", f.calls, len(ids), len(ids))
	}
}

func TestLoadUser_PassesThroughWithoutAMemo(t *testing.T) {
	// Non-HTTP callers and subscriptions have no memo; they must still work.
	f := &countingUserFinder{}
	id := uuid.New()
	for range 3 {
		if _, err := LoadUser(context.Background(), f, id); err != nil {
			t.Fatalf("LoadUser: %v", err)
		}
	}
	if f.calls != 3 {
		t.Errorf("made %d queries, want 3 (no memo means no caching)", f.calls)
	}
}

func TestLoadUser_DoesNotMemoiseErrors(t *testing.T) {
	// A deleted user and a timed-out Mongo look the same to these resolvers, so
	// a failure must not be cached as a fact about the row.
	ctx := WithUserMemo(context.Background())
	f := &countingUserFinder{err: errors.New("mongo timeout")}
	id := uuid.New()

	if _, err := LoadUser(ctx, f, id); err == nil {
		t.Fatal("expected an error")
	}
	f.err = nil
	if _, err := LoadUser(ctx, f, id); err != nil {
		t.Fatalf("second attempt should reach the finder again: %v", err)
	}
	if f.calls != 2 {
		t.Errorf("made %d queries, want 2", f.calls)
	}
}

func TestPreloadUsers_OneBatchThenNoQueries(t *testing.T) {
	ctx := WithUserMemo(context.Background())
	f := &countingUserFinder{}
	ids := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}

	if err := PreloadUsers(ctx, f, ids); err != nil {
		t.Fatalf("PreloadUsers: %v", err)
	}
	if len(f.batches) != 1 {
		t.Fatalf("made %d batch queries, want 1", len(f.batches))
	}
	for _, id := range ids {
		if _, err := LoadUser(ctx, f, id); err != nil {
			t.Fatalf("LoadUser: %v", err)
		}
	}
	if f.calls != 0 {
		t.Errorf("made %d single lookups after preloading, want 0", f.calls)
	}
}

func TestPreloadUsers_SkipsDuplicatesNilsAndCachedIDs(t *testing.T) {
	ctx := WithUserMemo(context.Background())
	f := &countingUserFinder{}
	a, b := uuid.New(), uuid.New()

	if err := PreloadUsers(ctx, f, []uuid.UUID{a}); err != nil {
		t.Fatalf("PreloadUsers: %v", err)
	}
	// a is cached, uuid.Nil is not a row, and b appears twice.
	if err := PreloadUsers(ctx, f, []uuid.UUID{a, uuid.Nil, b, b}); err != nil {
		t.Fatalf("PreloadUsers: %v", err)
	}
	if len(f.batches) != 2 {
		t.Fatalf("made %d batches, want 2", len(f.batches))
	}
	second := f.batches[1]
	if len(second) != 1 || second[0] != b {
		t.Errorf("second batch = %v, want just [%s]", second, b)
	}
}

func TestPreloadUsers_NoQueryWhenNothingIsMissing(t *testing.T) {
	ctx := WithUserMemo(context.Background())
	f := &countingUserFinder{}

	if err := PreloadUsers(ctx, f, nil); err != nil {
		t.Fatalf("PreloadUsers: %v", err)
	}
	if err := PreloadUsers(ctx, f, []uuid.UUID{uuid.Nil}); err != nil {
		t.Fatalf("PreloadUsers: %v", err)
	}
	if len(f.batches) != 0 {
		t.Errorf("made %d batches for nothing to fetch, want 0", len(f.batches))
	}
}

func TestPreloadUsers_MissingRowsStillResolveIndividually(t *testing.T) {
	// An id that matches no row must not be primed as absent-forever; the
	// field resolver's own "user was deleted" handling has to still run.
	ctx := WithUserMemo(context.Background())
	absent := uuid.New()
	f := &onlyBatchMisses{}

	if err := PreloadUsers(ctx, f, []uuid.UUID{absent}); err != nil {
		t.Fatalf("PreloadUsers: %v", err)
	}
	if _, err := LoadUser(ctx, f, absent); err == nil {
		t.Fatal("expected the single lookup to run and report not-found")
	}
	if f.singles != 1 {
		t.Errorf("made %d single lookups, want 1", f.singles)
	}
}

type onlyBatchMisses struct{ singles int }

func (f *onlyBatchMisses) FindByID(_ context.Context, _ uuid.UUID) (models.User, error) {
	f.singles++
	return models.User{}, errors.New("not found")
}

func (f *onlyBatchMisses) FindByIDs(_ context.Context, _ []uuid.UUID) ([]models.User, error) {
	return nil, nil // the batch matched nothing
}

func TestUserAndOperationMemosDoNotCollide(t *testing.T) {
	// The memos are keyed by a generic type parameter; if that ever collapsed
	// to a single key, one entity's cache would answer for the other.
	ctx := WithUserMemo(WithOperationMemo(context.Background()))
	id := uuid.New()

	uf := &countingUserFinder{}
	if _, err := LoadUser(ctx, uf, id); err != nil {
		t.Fatalf("LoadUser: %v", err)
	}

	of := &countingOpFinder{}
	op, err := LoadOperation(ctx, of, id)
	if err != nil {
		t.Fatalf("LoadOperation: %v", err)
	}
	if of.calls != 1 {
		t.Errorf("operation lookup made %d queries, want 1 — the user memo answered it", of.calls)
	}
	if op.OperationID != id {
		t.Errorf("got operation %s, want %s", op.OperationID, id)
	}
}

type countingOpFinder struct{ calls int }

func (f *countingOpFinder) FindByID(_ context.Context, id uuid.UUID) (models.Operation, error) {
	f.calls++
	return models.Operation{OperationID: id}, nil
}
