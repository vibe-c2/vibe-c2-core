package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// TestBuildCredentialFilter_OperationOnly verifies that an empty filter still
// scopes the query to the operation — the bare minimum invariant.
func TestBuildCredentialFilter_OperationOnly(t *testing.T) {
	opID := uuid.New()
	f := buildCredentialFilter(opID, CredentialFilter{})

	if f["operation_id"] != opID {
		t.Fatalf("operation_id missing or wrong: got %v", f["operation_id"])
	}
	if _, hasSearch := f["$or"]; hasSearch {
		t.Fatalf("did not expect $or when no search provided")
	}
}

// TestBuildCredentialFilter_TypeAndValid verifies that the type and is_valid
// constraints land on the right BSON keys when present.
func TestBuildCredentialFilter_TypeAndValid(t *testing.T) {
	opID := uuid.New()
	pwd := models.CredentialTypePassword
	valid := true

	f := buildCredentialFilter(opID, CredentialFilter{
		Type:      &pwd,
		ValidOnly: &valid,
	})

	if f["type"] != pwd {
		t.Fatalf("type filter missing or wrong: got %v", f["type"])
	}
	if f["is_valid"] != true {
		t.Fatalf("is_valid filter missing or wrong: got %v", f["is_valid"])
	}
}

// TestBuildCredentialFilter_TagsAllSemantics verifies tag filtering uses
// $all (AND-match) — a credential must carry every requested tag to match.
func TestBuildCredentialFilter_TagsAllSemantics(t *testing.T) {
	opID := uuid.New()
	tags := []string{"prod", "admin"}

	f := buildCredentialFilter(opID, CredentialFilter{Tags: tags})

	tagsFilter, ok := f["tags"].(bson.M)
	if !ok {
		t.Fatalf("expected tags filter to be bson.M, got %T", f["tags"])
	}
	got, ok := tagsFilter["$all"].([]string)
	if !ok {
		t.Fatalf("expected $all []string, got %T", tagsFilter["$all"])
	}
	if len(got) != 2 || got[0] != "prod" || got[1] != "admin" {
		t.Fatalf("unexpected $all contents: %v", got)
	}
}

// TestBuildCredentialFilter_SearchEscapesRegexMetachars protects against
// accidental ReDoS / broad matches via untrusted user input. Same shape as
// the WikiDocument filter guard.
func TestBuildCredentialFilter_SearchEscapesRegexMetachars(t *testing.T) {
	opID := uuid.New()

	cases := []struct {
		name   string
		search string
		want   string
	}{
		{"plain", "hello", "hello"},
		{"dot-star", ".*", `\.\*`},
		{"redos", "(a+)+$", `\(a\+\)\+\$`},
		{"anchors", "^foo$", `\^foo\$`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := buildCredentialFilter(opID, CredentialFilter{Search: tc.search})

			orVal, ok := f["$or"].(bson.A)
			if !ok {
				t.Fatalf("expected $or bson.A, got %T", f["$or"])
			}
			if len(orVal) != 4 {
				t.Fatalf("expected $or with 4 branches (name/username/password/properties.value), got %d", len(orVal))
			}
			first, ok := orVal[0].(bson.M)
			if !ok {
				t.Fatalf("expected $or[0] to be bson.M")
			}
			nameRx, ok := first["name"].(bson.M)
			if !ok {
				t.Fatalf("expected name regex to be bson.M")
			}
			if got := nameRx["$regex"]; got != tc.want {
				t.Fatalf("expected escaped regex %q, got %q", tc.want, got)
			}
			if nameRx["$options"] != "i" {
				t.Fatalf("expected case-insensitive $options=i, got %v", nameRx["$options"])
			}
		})
	}
}

// TestBuildCredentialFilter_SearchFieldsRestrictsOrBranches verifies that a
// non-empty SearchFields restricts the $or to exactly the selected field paths,
// while an empty set falls back to the four default fields.
func TestBuildCredentialFilter_SearchFieldsRestrictsOrBranches(t *testing.T) {
	opID := uuid.New()

	cases := []struct {
		name   string
		fields []CredentialSearchField
		want   []string
	}{
		{
			"default-when-empty",
			nil,
			[]string{"name", "username", "password", "properties.value"},
		},
		{
			"username-only",
			[]CredentialSearchField{CredentialSearchFieldUsername},
			[]string{"username"},
		},
		{
			"password-and-properties",
			[]CredentialSearchField{CredentialSearchFieldPassword, CredentialSearchFieldProperties},
			[]string{"password", "properties.value"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := buildCredentialFilter(opID, CredentialFilter{
				Search:       "needle",
				SearchFields: tc.fields,
			})

			orVal, ok := f["$or"].(bson.A)
			if !ok {
				t.Fatalf("expected $or bson.A, got %T", f["$or"])
			}
			if len(orVal) != len(tc.want) {
				t.Fatalf("expected %d $or branches, got %d", len(tc.want), len(orVal))
			}
			for i, field := range tc.want {
				branch, ok := orVal[i].(bson.M)
				if !ok {
					t.Fatalf("expected $or[%d] to be bson.M", i)
				}
				if _, present := branch[field]; !present {
					t.Fatalf("expected $or[%d] to target %q, got %v", i, field, branch)
				}
			}
		})
	}
}

// TestBuildCredentialFilter_SearchFieldsIgnoredWithoutSearch verifies that
// selecting fields without a search term produces no $or constraint.
func TestBuildCredentialFilter_SearchFieldsIgnoredWithoutSearch(t *testing.T) {
	opID := uuid.New()
	f := buildCredentialFilter(opID, CredentialFilter{
		SearchFields: []CredentialSearchField{CredentialSearchFieldUsername},
	})
	if _, ok := f["$or"]; ok {
		t.Fatalf("expected no $or when Search is empty, got %v", f["$or"])
	}
}

// TestBuildCredentialFilter_ValidOnlyFalseSelectsInvalid verifies that passing
// ValidOnly=false produces a filter for is_valid=false (invalid-only), not a
// missing filter. This is the path the UI uses when the user toggles to
// "only invalid" if that mode is ever exposed.
func TestBuildCredentialFilter_ValidOnlyFalseSelectsInvalid(t *testing.T) {
	opID := uuid.New()
	invalid := false

	f := buildCredentialFilter(opID, CredentialFilter{ValidOnly: &invalid})

	if got, ok := f["is_valid"]; !ok {
		t.Fatalf("expected is_valid filter present")
	} else if got != false {
		t.Fatalf("expected is_valid=false, got %v", got)
	}
}

// TestBuildCredentialFilter_NilValidOnlyShowsBoth verifies that when ValidOnly
// is nil the filter does not constrain is_valid — both valid and invalid are
// returned. This is the "Show invalid" toggle's "on" state.
func TestBuildCredentialFilter_NilValidOnlyShowsBoth(t *testing.T) {
	opID := uuid.New()

	f := buildCredentialFilter(opID, CredentialFilter{ValidOnly: nil})

	if _, ok := f["is_valid"]; ok {
		t.Fatalf("did not expect is_valid filter when ValidOnly is nil")
	}
}

// TestBuildCredentialFilterMulti_UsesIn verifies the multi-op builder pins the
// operation_id predicate to a {$in: [...]} clause instead of a single value.
// All other filter fields layer on top identically.
func TestBuildCredentialFilterMulti_UsesIn(t *testing.T) {
	op1 := uuid.New()
	op2 := uuid.New()
	pwd := models.CredentialTypePassword

	f := buildCredentialFilterMulti([]uuid.UUID{op1, op2}, CredentialFilter{
		Type: &pwd,
		Tags: []string{"prod"},
	})

	opPred, ok := f["operation_id"].(bson.M)
	if !ok {
		t.Fatalf("expected operation_id to be bson.M, got %T", f["operation_id"])
	}
	got, ok := opPred["$in"].([]uuid.UUID)
	if !ok {
		t.Fatalf("expected $in []uuid.UUID, got %T", opPred["$in"])
	}
	if len(got) != 2 || got[0] != op1 || got[1] != op2 {
		t.Fatalf("unexpected $in contents: %v", got)
	}
	if f["type"] != pwd {
		t.Fatalf("type filter did not carry over: got %v", f["type"])
	}
	tagsFilter, ok := f["tags"].(bson.M)
	if !ok {
		t.Fatalf("expected tags filter to be bson.M, got %T", f["tags"])
	}
	tagsAll, _ := tagsFilter["$all"].([]string)
	if len(tagsAll) != 1 || tagsAll[0] != "prod" {
		t.Fatalf("unexpected tags $all: %v", tagsAll)
	}
}

// TestBuildCredentialFilterMulti_SingleOp confirms a one-element slice still
// goes through the $in path — we don't optimise to a scalar predicate. This
// keeps the multi-op resolver path uniform regardless of selection size.
func TestBuildCredentialFilterMulti_SingleOp(t *testing.T) {
	op1 := uuid.New()

	f := buildCredentialFilterMulti([]uuid.UUID{op1}, CredentialFilter{})

	opPred, ok := f["operation_id"].(bson.M)
	if !ok {
		t.Fatalf("expected operation_id to be bson.M, got %T", f["operation_id"])
	}
	if _, ok := opPred["$in"]; !ok {
		t.Fatalf("expected $in predicate even for single op")
	}
}

// TestCredentialSearchSurvivesCursorPagination is the regression test for the
// "page 2 ignores the search" bug: buildCredentialFilter puts the multi-field
// text search under $or, and the cursor keyset filter is also a $or. The old
// key-merge composition let the cursor overwrite the search, so every page
// after the first returned unfiltered results. The $and composition must keep
// both predicates.
func TestCredentialSearchSurvivesCursorPagination(t *testing.T) {
	opID := uuid.New()
	base := buildCredentialFilter(opID, CredentialFilter{Search: "psp"})

	cur := &pagination.Cursor{CreateAt: time.Now()}
	q := pagination.ApplyCursorFilter(base, cur, true)

	and, ok := q["$and"].(bson.A)
	if !ok || len(and) != 2 {
		t.Fatalf("expected $and composition of base + cursor, got %v", q)
	}

	gotBase := and[0].(bson.M)
	searchOr, ok := gotBase["$or"].(bson.A)
	if !ok {
		t.Fatalf("search $or was dropped from the paginated query: %v", gotBase)
	}
	if len(searchOr) != len(defaultCredentialSearchFields) {
		t.Fatalf("expected %d search branches, got %d",
			len(defaultCredentialSearchFields), len(searchOr))
	}
	if gotBase["operation_id"] != opID {
		t.Fatalf("operation scope was dropped: %v", gotBase)
	}

	cursorBranch := and[1].(bson.M)
	if _, ok := cursorBranch["$or"]; !ok {
		t.Fatalf("cursor keyset $or missing: %v", cursorBranch)
	}
}

// --- CredentialSort tests ---

// TestCredentialSortSortKey verifies the repo→pagination mapping: name and
// username are string-keyed columns, createAt keeps the time-keyed cursor.
func TestCredentialSortSortKey(t *testing.T) {
	cases := []struct {
		sort       CredentialSort
		wantField  string
		wantString bool
		wantAsc    bool
	}{
		{DefaultCredentialSort(), "createAt", false, false},
		{CredentialSort{Field: CredentialSortFieldName, Ascending: true}, "name", true, true},
		{CredentialSort{Field: CredentialSortFieldUsername, Ascending: false}, "username", true, false},
	}
	for _, tc := range cases {
		key := tc.sort.SortKey()
		if key.Field != tc.wantField || key.String != tc.wantString || key.Ascending != tc.wantAsc {
			t.Fatalf("sort %+v: got key %+v", tc.sort, key)
		}
	}
}

// TestCredentialSortCursor verifies edge cursors carry the active sort
// column's value: the string slot for name/username, the timestamp for
// createAt — and that each round-trips through DecodeCursor.
func TestCredentialSortCursor(t *testing.T) {
	cred := &models.Credential{
		Name:     "DC Admin",
		Username: "administrator",
	}
	cred.CreateAt = time.Date(2026, 6, 1, 10, 0, 0, 0, time.UTC)

	byName := CredentialSort{Field: CredentialSortFieldName, Ascending: true}
	c, err := pagination.DecodeCursor(byName.Cursor(cred))
	if err != nil {
		t.Fatalf("decode name cursor: %v", err)
	}
	if c.Str == nil || *c.Str != "DC Admin" {
		t.Fatalf("name cursor should carry the name, got %v", c.Str)
	}

	byUsername := CredentialSort{Field: CredentialSortFieldUsername}
	c, err = pagination.DecodeCursor(byUsername.Cursor(cred))
	if err != nil {
		t.Fatalf("decode username cursor: %v", err)
	}
	if c.Str == nil || *c.Str != "administrator" {
		t.Fatalf("username cursor should carry the username, got %v", c.Str)
	}

	c, err = pagination.DecodeCursor(DefaultCredentialSort().Cursor(cred))
	if err != nil {
		t.Fatalf("decode createAt cursor: %v", err)
	}
	if c.Str != nil {
		t.Fatalf("createAt cursor should not carry a string key, got %q", *c.Str)
	}
	if !c.CreateAt.Equal(cred.CreateAt) {
		t.Fatalf("createAt cursor should carry the timestamp, got %v", c.CreateAt)
	}
}
