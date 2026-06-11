package pagination

import (
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func testCursor(t *testing.T) *Cursor {
	t.Helper()
	id, err := primitive.ObjectIDFromHex("65f000000000000000000001")
	if err != nil {
		t.Fatalf("bad test object id: %v", err)
	}
	return &Cursor{
		CreateAt: time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC),
		ID:       id,
	}
}

// TestApplyCursorFilter_NilCursorReturnsBaseUnchanged verifies the first-page
// path: no cursor means the base filter passes through untouched.
func TestApplyCursorFilter_NilCursorReturnsBaseUnchanged(t *testing.T) {
	base := bson.M{"operation_id": "op-1"}

	got := ApplyCursorFilter(base, nil, true)

	if len(got) != 1 || got["operation_id"] != "op-1" {
		t.Fatalf("expected base filter unchanged, got %v", got)
	}
	if _, hasAnd := got["$and"]; hasAnd {
		t.Fatalf("did not expect $and wrapper without a cursor")
	}
}

// TestApplyCursorFilter_PreservesBaseOr is the regression test for the
// search-dropped-on-page-2 bug: the cursor keyset filter is itself a $or, and
// the old `q[k] = v` merge overwrote any $or already present in the base
// filter (the multi-field text search). $and composition must keep both.
func TestApplyCursorFilter_PreservesBaseOr(t *testing.T) {
	searchOr := bson.A{
		bson.M{"name": bson.M{"$regex": "psp"}},
		bson.M{"username": bson.M{"$regex": "psp"}},
	}
	base := bson.M{
		"operation_id": "op-1",
		"$or":          searchOr,
	}

	got := ApplyCursorFilter(base, testCursor(t), true)

	and, ok := got["$and"].(bson.A)
	if !ok {
		t.Fatalf("expected $and composition, got %v", got)
	}
	if len(and) != 2 {
		t.Fatalf("expected 2 $and branches (base, cursor), got %d", len(and))
	}

	gotBase, ok := and[0].(bson.M)
	if !ok {
		t.Fatalf("expected base branch to be bson.M, got %T", and[0])
	}
	if gotBase["operation_id"] != "op-1" {
		t.Fatalf("base branch lost operation_id: %v", gotBase)
	}
	if _, hasSearch := gotBase["$or"]; !hasSearch {
		t.Fatalf("base branch lost its search $or: %v", gotBase)
	}

	cursorBranch, ok := and[1].(bson.M)
	if !ok {
		t.Fatalf("expected cursor branch to be bson.M, got %T", and[1])
	}
	if _, hasOr := cursorBranch["$or"]; !hasOr {
		t.Fatalf("cursor branch missing keyset $or: %v", cursorBranch)
	}
}

// TestApplyCursorFilterOn_UsesGivenField verifies the field-parameterized
// variant threads the sort column into the keyset comparison.
func TestApplyCursorFilterOn_UsesGivenField(t *testing.T) {
	got := ApplyCursorFilterOn(bson.M{}, testCursor(t), true, "done_at")

	and, ok := got["$and"].(bson.A)
	if !ok || len(and) != 2 {
		t.Fatalf("expected $and with 2 branches, got %v", got)
	}
	cursorBranch := and[1].(bson.M)
	or, ok := cursorBranch["$or"].(bson.A)
	if !ok || len(or) != 2 {
		t.Fatalf("expected keyset $or with 2 branches, got %v", cursorBranch)
	}
	first := or[0].(bson.M)
	if _, ok := first["done_at"]; !ok {
		t.Fatalf("keyset filter should target done_at, got %v", first)
	}
}
