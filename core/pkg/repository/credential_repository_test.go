package repository

import (
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
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
