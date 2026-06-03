package repository

import (
	"testing"

	"github.com/google/uuid"
	v1bson "go.mongodb.org/mongo-driver/bson"
)

// TestBuildTextSearchPhrase_QuotesAndStripsEmbeddedQuotes proves the $text
// branch can never be tricked into OR-splitting on punctuation or applying
// stray `-` as a negation. Before this guard a query like the one below
// returned arbitrary unrelated documents because $text tokenized the
// punctuation into many short terms (e.g. `4`, `YES`, `d`) and OR'd them.
func TestBuildTextSearchPhrase_QuotesAndStripsEmbeddedQuotes(t *testing.T) {
	cases := []struct {
		name    string
		query   string
		want    string
		wantOK  bool
	}{
		{
			name:   "plain word phrase-quoted",
			query:  "hello",
			want:   `"hello"`,
			wantOK: true,
		},
		{
			name:   "multi-word phrase-quoted",
			query:  "search index",
			want:   `"search index"`,
			wantOK: true,
		},
		{
			name:   "leading hyphen no longer negates",
			query:  "-foo",
			want:   `"-foo"`,
			wantOK: true,
		},
		{
			name:   "embedded quotes stripped to keep phrase well-formed",
			query:  `say "hi" now`,
			want:   `"say hi now"`,
			wantOK: true,
		},
		{
			name:   "noisy punctuation kept inside phrase",
			query:  `U-DCuf+kxjESV7%YES&FRx5%4+daZzH%!WwRetFrHPg^)3X[d`,
			want:   `"U-DCuf+kxjESV7%YES&FRx5%4+daZzH%!WwRetFrHPg^)3X[d"`,
			wantOK: true,
		},
		{
			name:   "empty string skips text branch",
			query:  "",
			want:   "",
			wantOK: false,
		},
		{
			name:   "whitespace only skips text branch",
			query:  "   \t  ",
			want:   "",
			wantOK: false,
		},
		{
			name:   "only quotes skips text branch",
			query:  `"""`,
			want:   "",
			wantOK: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := buildTextSearchPhrase(tc.query)
			if ok != tc.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tc.wantOK)
			}
			if got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

// TestBuildWikiBrowseMatch_NoScope confirms the empty-query browse filter is
// just the operation's active docs — no $or clause that would force Mongo to
// evaluate a scope branch.
func TestBuildWikiBrowseMatch_NoScope(t *testing.T) {
	opID := uuid.New()
	m := buildWikiBrowseMatch(opID, nil)

	if m["operation_id"] != opID {
		t.Fatalf("operation_id = %v, want %v", m["operation_id"], opID)
	}
	if got, present := m["deleted_at"]; !present || got != nil {
		t.Fatalf("deleted_at = %v (present=%v), want nil filter for active docs", got, present)
	}
	if _, present := m["$or"]; present {
		t.Fatal("unscoped browse should not produce an $or clause")
	}
}

// TestBuildWikiBrowseMatch_Scoped proves a scoped browse matches the scope doc
// itself plus all descendants via the materialized path_ids chain — same
// semantics as the ranked search path.
func TestBuildWikiBrowseMatch_Scoped(t *testing.T) {
	opID := uuid.New()
	scopeID := uuid.New()
	m := buildWikiBrowseMatch(opID, &scopeID)

	or, ok := m["$or"].(v1bson.A)
	if !ok {
		t.Fatalf("expected $or to be bson.A, got %T", m["$or"])
	}
	if len(or) != 2 {
		t.Fatalf("expected 2 $or clauses (self, descendants), got %d", len(or))
	}

	self, ok := or[0].(v1bson.M)
	if !ok || self["document_id"] != scopeID {
		t.Fatalf("first $or clause should match document_id = scope, got %v", or[0])
	}
	desc, ok := or[1].(v1bson.M)
	if !ok || desc["path_ids"] != scopeID {
		t.Fatalf("second $or clause should match path_ids = scope, got %v", or[1])
	}
}

// TestBuildWikiBrowsePipeline_OrdersNewestUpdatedFirst pins the browse ordering
// contract: sort by an effective-updated key that coalesces last_updated_at to
// createAt (so never-edited docs stay visible), newest first, with _id as the
// final tiebreaker. Also checks skip/limit and that content is projected away.
func TestBuildWikiBrowsePipeline_OrdersNewestUpdatedFirst(t *testing.T) {
	match := buildWikiBrowseMatch(uuid.New(), nil)
	const offset, limit int64 = 40, 25
	p := buildWikiBrowsePipeline(match, offset, limit)

	// Expected stage order: $match, $addFields, $sort, $skip, $limit, $project.
	wantStages := []string{"$match", "$addFields", "$sort", "$skip", "$limit", "$project"}
	if len(p) != len(wantStages) {
		t.Fatalf("pipeline has %d stages, want %d", len(p), len(wantStages))
	}
	for i, want := range wantStages {
		if len(p[i]) != 1 || p[i][0].Key != want {
			t.Fatalf("stage %d = %v, want %q", i, p[i], want)
		}
	}

	// $addFields coalesces last_updated_at → createAt.
	addFields, ok := p[1][0].Value.(v1bson.M)
	if !ok {
		t.Fatalf("$addFields value type = %T", p[1][0].Value)
	}
	eff, ok := addFields["effective_updated"].(v1bson.M)
	if !ok {
		t.Fatalf("effective_updated type = %T", addFields["effective_updated"])
	}
	coalesce, ok := eff["$ifNull"].(v1bson.A)
	if !ok || len(coalesce) != 2 || coalesce[0] != "$last_updated_at" || coalesce[1] != "$createAt" {
		t.Fatalf("$ifNull = %v, want [$last_updated_at $createAt]", eff["$ifNull"])
	}

	// $sort: effective_updated DESC, then _id DESC.
	sort, ok := p[2][0].Value.(v1bson.D)
	if !ok || len(sort) != 2 {
		t.Fatalf("$sort = %v, want 2-key bson.D", p[2][0].Value)
	}
	if sort[0].Key != "effective_updated" || sort[0].Value != -1 {
		t.Fatalf("primary sort = %v, want effective_updated:-1", sort[0])
	}
	if sort[1].Key != "_id" || sort[1].Value != -1 {
		t.Fatalf("secondary sort = %v, want _id:-1", sort[1])
	}

	// $skip / $limit carry the pagination window through verbatim.
	if p[3][0].Value != offset {
		t.Fatalf("$skip = %v, want %d", p[3][0].Value, offset)
	}
	if p[4][0].Value != limit {
		t.Fatalf("$limit = %v, want %d", p[4][0].Value, limit)
	}

	// $project drops content so browse rows never ship the body payload.
	proj, ok := p[5][0].Value.(v1bson.M)
	if !ok {
		t.Fatalf("$project value type = %T", p[5][0].Value)
	}
	for _, field := range []string{"content", "content_state", "effective_updated"} {
		if v, present := proj[field]; !present || v != 0 {
			t.Fatalf("$project should exclude %q (value 0), got %v (present=%v)", field, v, present)
		}
	}
}
