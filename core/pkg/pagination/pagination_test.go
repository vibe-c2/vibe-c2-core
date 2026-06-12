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

// --- SortKey / string-cursor tests ---

// TestEncodeStringCursor_RoundTrip verifies a string-keyed cursor survives
// encode → decode with its value and tiebreaker intact, and that the time
// slot stays zero (string cursors don't carry a timestamp).
func TestEncodeStringCursor_RoundTrip(t *testing.T) {
	id := testCursor(t).ID

	s := EncodeStringCursor("Admin Portal", id)
	c, err := DecodeCursor(s)
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}

	if c.Str == nil || *c.Str != "Admin Portal" {
		t.Fatalf("expected Str=Admin Portal, got %v", c.Str)
	}
	if c.ID != id {
		t.Fatalf("expected id %v, got %v", id, c.ID)
	}
	if !c.CreateAt.IsZero() {
		t.Fatalf("string cursor should not carry a timestamp, got %v", c.CreateAt)
	}
}

// TestEncodeCursor_RoundTripHasNoStr verifies the legacy time-keyed encoding
// keeps the omitempty contract — decoded time cursors have Str == nil, which
// is what ValidateCursor uses to tell the two shapes apart.
func TestEncodeCursor_RoundTripHasNoStr(t *testing.T) {
	tc := testCursor(t)

	c, err := DecodeCursor(EncodeCursor(tc.CreateAt, tc.ID))
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}

	if c.Str != nil {
		t.Fatalf("time cursor should not carry Str, got %q", *c.Str)
	}
	if !c.CreateAt.Equal(tc.CreateAt) {
		t.Fatalf("expected CreateAt %v, got %v", tc.CreateAt, c.CreateAt)
	}
}

// TestSortKeyValidateCursor matrix: nil cursors always pass (first page);
// shape mismatches in either direction are rejected.
func TestSortKeyValidateCursor(t *testing.T) {
	name := "alpha"
	stringCursor := &Cursor{Str: &name, ID: testCursor(t).ID}
	timeCursor := testCursor(t)

	stringKey := SortKey{Field: "name", String: true}
	timeKey := SortKey{Field: "createAt"}

	cases := []struct {
		label   string
		key     SortKey
		cursor  *Cursor
		wantErr bool
	}{
		{"nil cursor, string key", stringKey, nil, false},
		{"nil cursor, time key", timeKey, nil, false},
		{"string cursor, string key", stringKey, stringCursor, false},
		{"time cursor, time key", timeKey, timeCursor, false},
		{"time cursor, string key", stringKey, timeCursor, true},
		{"string cursor, time key", timeKey, stringCursor, true},
	}
	for _, tc := range cases {
		err := tc.key.ValidateCursor(tc.cursor)
		if (err != nil) != tc.wantErr {
			t.Fatalf("%s: got err=%v, wantErr=%v", tc.label, err, tc.wantErr)
		}
	}
}

// TestSortFieldsKey_DirectionMatrix verifies forward pages follow the list's
// primary direction and backward pages reverse it, for both directions.
func TestSortFieldsKey_DirectionMatrix(t *testing.T) {
	asc := SortKey{Field: "name", Ascending: true, String: true}
	desc := SortKey{Field: "name", Ascending: false, String: true}

	cases := []struct {
		label   string
		key     SortKey
		forward bool
		want    []string
	}{
		{"asc forward", asc, true, []string{"name", "_id"}},
		{"asc backward", asc, false, []string{"-name", "-_id"}},
		{"desc forward", desc, true, []string{"-name", "-_id"}},
		{"desc backward", desc, false, []string{"name", "_id"}},
	}
	for _, tc := range cases {
		got := SortFieldsKey(tc.forward, tc.key)
		if len(got) != 2 || got[0] != tc.want[0] || got[1] != tc.want[1] {
			t.Fatalf("%s: expected %v, got %v", tc.label, tc.want, got)
		}
	}
}

// TestBuildCursorFilterKey_StringAscendingForward verifies the keyset filter
// for the new mode: ascending string sort, forward page ⇒ strictly-greater
// comparisons on the string value with the _id tiebreaker.
func TestBuildCursorFilterKey_StringAscendingForward(t *testing.T) {
	name := "bravo"
	cursor := &Cursor{Str: &name, ID: testCursor(t).ID}
	key := SortKey{Field: "name", Ascending: true, String: true}

	got := BuildCursorFilterKey(cursor, true, key)

	or, ok := got["$or"].(bson.A)
	if !ok || len(or) != 2 {
		t.Fatalf("expected keyset $or with 2 branches, got %v", got)
	}
	first := or[0].(bson.M)
	cmp, ok := first["name"].(bson.M)
	if !ok {
		t.Fatalf("expected name comparison, got %v", first)
	}
	if cmp["$gt"] != "bravo" {
		t.Fatalf("expected {name: {$gt: bravo}}, got %v", cmp)
	}
	tie := or[1].(bson.M)
	if tie["name"] != "bravo" {
		t.Fatalf("tiebreaker branch should pin name=bravo, got %v", tie)
	}
	idCmp, ok := tie["_id"].(bson.M)
	if !ok || idCmp["$gt"] != cursor.ID {
		t.Fatalf("tiebreaker should compare _id with $gt, got %v", tie)
	}
}

// TestBuildCursorFilterKey_DescendingMatchesLegacy verifies the SortKey form
// in descending-time mode produces the same shape as the legacy
// BuildCursorFilterOn helper — the compatibility contract that lets repos
// migrate one at a time.
func TestBuildCursorFilterKey_DescendingMatchesLegacy(t *testing.T) {
	cursor := testCursor(t)
	key := SortKey{Field: "createAt", Ascending: false}

	got := BuildCursorFilterKey(cursor, true, key)
	legacy := BuildCursorFilterOn(cursor, true, "createAt")

	gotOr := got["$or"].(bson.A)
	legacyOr := legacy["$or"].(bson.A)
	for i := range gotOr {
		g, l := gotOr[i].(bson.M), legacyOr[i].(bson.M)
		if len(g) != len(l) {
			t.Fatalf("branch %d differs: got %v, legacy %v", i, g, l)
		}
	}
	gCmp := gotOr[0].(bson.M)["createAt"].(bson.M)
	if _, ok := gCmp["$lt"]; !ok {
		t.Fatalf("descending forward should use $lt, got %v", gCmp)
	}
}

// TestApplyCursorFilterKey_NilCursorReturnsBase mirrors the legacy nil-cursor
// contract for the SortKey-aware variant.
func TestApplyCursorFilterKey_NilCursorReturnsBase(t *testing.T) {
	base := bson.M{"operation_id": "op-1"}

	got := ApplyCursorFilterKey(base, nil, true, SortKey{Field: "name", String: true})

	if len(got) != 1 || got["operation_id"] != "op-1" {
		t.Fatalf("expected base filter unchanged, got %v", got)
	}
}
