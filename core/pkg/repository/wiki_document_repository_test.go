package repository

import (
	"regexp"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// TestBuildWikiDocumentFilter_EscapesRegexMetachars proves the $regex branch
// cannot be weaponized with ReDoS patterns or accidental broad matches.
// Related history: before this guard, `filter.Search` went straight into
// `$regex` unescaped — any user could send `.*` (full scan) or `(a+)+$`
// (catastrophic backtracking).
func TestBuildWikiDocumentFilter_EscapesRegexMetachars(t *testing.T) {
	opID := uuid.New()

	cases := []struct {
		name   string
		search string
		want   string // expected value of the escaped $regex pattern
	}{
		{"plain text", "hello", "hello"},
		{"dot-star", ".*", `\.\*`},
		{"redos backreference", "(a+)+$", `\(a\+\)\+\$`},
		{"large repetition", "a{100000}", `a\{100000\}`},
		{"pipe union", "a|b", `a\|b`},
		{"anchors", "^foo$", `\^foo\$`},
		{"char class", "[abc]", `\[abc\]`},
		{"escape", `\d+`, `\\d\+`},
		{"spaces preserved", "hello world", "hello world"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			start := time.Now()
			f := buildWikiDocumentFilter(opID, WikiDocumentFilter{Search: tc.search})
			if elapsed := time.Since(start); elapsed > 50*time.Millisecond {
				t.Fatalf("filter build took %v — should be near-instant", elapsed)
			}

			or, ok := f["$or"].(bson.A)
			if !ok {
				t.Fatalf("expected $or to be bson.A, got %T", f["$or"])
			}
			if len(or) != 2 {
				t.Fatalf("expected 2 $or clauses (title, content), got %d", len(or))
			}

			titleClause, ok := or[0].(bson.M)
			if !ok {
				t.Fatalf("expected bson.M, got %T", or[0])
			}
			titleRegex, ok := titleClause["title"].(bson.M)
			if !ok {
				t.Fatalf("expected title regex to be bson.M, got %T", titleClause["title"])
			}
			got, _ := titleRegex["$regex"].(string)
			if got != tc.want {
				t.Fatalf("title regex = %q, want %q", got, tc.want)
			}
			if titleRegex["$options"] != "i" {
				t.Fatalf("expected case-insensitive option, got %v", titleRegex["$options"])
			}
		})
	}
}

// TestBuildWikiDocumentFilter_EmptySearchOmitsOr confirms an empty search does
// not add a useless $or clause that would force Mongo to evaluate it.
func TestBuildWikiDocumentFilter_EmptySearchOmitsOr(t *testing.T) {
	f := buildWikiDocumentFilter(uuid.New(), WikiDocumentFilter{Search: ""})
	if _, present := f["$or"]; present {
		t.Fatal("empty search should not produce an $or clause")
	}
}

// TestBuildWikiDocumentFilter_Trashed confirms the deleted_at flag
// respects the Trashed bool — regression guard alongside the search changes.
func TestBuildWikiDocumentFilter_Trashed(t *testing.T) {
	active := buildWikiDocumentFilter(uuid.New(), WikiDocumentFilter{Trashed: false})
	if active["deleted_at"] != nil {
		t.Fatalf("active filter expected deleted_at == nil, got %v", active["deleted_at"])
	}

	trashed := buildWikiDocumentFilter(uuid.New(), WikiDocumentFilter{Trashed: true})
	m, ok := trashed["deleted_at"].(bson.M)
	if !ok || m["$ne"] != nil {
		t.Fatalf("trashed filter expected deleted_at {$ne: nil}, got %v", trashed["deleted_at"])
	}
}

// TestBuildWikiDocumentFilter_EscapedPatternMatchesLiteral proves that the
// escaped $regex string treats the raw input as a literal — meaning every
// metachar has been neutralized. A leaked `$` or `.` would cause the compiled
// pattern to match more than the input string.
func TestBuildWikiDocumentFilter_EscapedPatternMatchesLiteral(t *testing.T) {
	metas := `.+*?()|[]{}^$\`
	f := buildWikiDocumentFilter(uuid.New(), WikiDocumentFilter{Search: metas})

	or := f["$or"].(bson.A)
	pattern := or[0].(bson.M)["title"].(bson.M)["$regex"].(string)

	re, err := regexp.Compile("(?i)" + pattern)
	if err != nil {
		t.Fatalf("escaped pattern %q failed to compile: %v", pattern, err)
	}
	if !re.MatchString(metas) {
		t.Fatalf("escaped pattern %q does not match its source literal %q", pattern, metas)
	}
	// Structural guarantee: a `.` in the pattern would match `x`. It must not.
	if re.MatchString("xxxxxxxxxxxxxxxx") {
		t.Fatalf("escaped pattern %q accidentally matches unrelated input", pattern)
	}
}

// TestWalkAncestorChain covers the pure walk logic used by FindAncestors.
// We don't stand up Mongo here — the lookup closure stands in for FindByID.
func TestWalkAncestorChain(t *testing.T) {
	idA, idB, idC := uuid.New(), uuid.New(), uuid.New()
	mk := func(id uuid.UUID, parent *uuid.UUID, title string, deleted bool) models.WikiDocument {
		d := models.WikiDocument{
			DocumentID:       id,
			ParentDocumentID: parent,
			Title:            title,
		}
		if deleted {
			now := time.Now().UTC()
			d.DeletedAt = &now
		}
		return d
	}

	t.Run("three-deep chain returns root→leaf for the parent of the leaf", func(t *testing.T) {
		store := map[uuid.UUID]models.WikiDocument{
			idA: mk(idA, nil, "A", false),
			idB: mk(idB, &idA, "B", false),
			idC: mk(idC, &idB, "C", false),
		}
		// Caller convention: resolver passes obj.ParentDocumentID, i.e. B's
		// ID when asking for C's ancestors. Expect [A, B].
		got := walkAncestorChain(idB, lookupStore(store))
		if !equalTitles(got, []string{"A", "B"}) {
			t.Fatalf("expected [A, B], got %v", titles(got))
		}
	})

	t.Run("includes trashed ancestors with deleted_at preserved", func(t *testing.T) {
		store := map[uuid.UUID]models.WikiDocument{
			idA: mk(idA, nil, "A", false),
			idB: mk(idB, &idA, "B", true),
			idC: mk(idC, &idB, "C", false),
		}
		got := walkAncestorChain(idB, lookupStore(store))
		if !equalTitles(got, []string{"A", "B"}) {
			t.Fatalf("expected [A, B], got %v", titles(got))
		}
		if got[1].DeletedAt == nil {
			t.Fatal("B should still carry DeletedAt when walked")
		}
		if got[0].DeletedAt != nil {
			t.Fatal("A should not be flagged as deleted")
		}
	})

	t.Run("missing ancestor stops the walk and returns partial path", func(t *testing.T) {
		// B exists and points at idA, but A is absent from the store —
		// simulating a hard-deleted root. We expect [B], not a panic.
		store := map[uuid.UUID]models.WikiDocument{
			idB: mk(idB, &idA, "B", false),
		}
		got := walkAncestorChain(idB, lookupStore(store))
		if !equalTitles(got, []string{"B"}) {
			t.Fatalf("expected [B], got %v", titles(got))
		}
	})

	t.Run("cycle is bounded by visited guard", func(t *testing.T) {
		// A -> B -> A. Walking from A visits {A, B} exactly once then stops.
		store := map[uuid.UUID]models.WikiDocument{
			idA: mk(idA, &idB, "A", false),
			idB: mk(idB, &idA, "B", false),
		}
		got := walkAncestorChain(idA, lookupStore(store))
		if len(got) != 2 {
			t.Fatalf("expected 2 distinct nodes in cycle walk, got %d: %v", len(got), titles(got))
		}
	})
}

func lookupStore(store map[uuid.UUID]models.WikiDocument) func(uuid.UUID) (models.WikiDocument, bool) {
	return func(id uuid.UUID) (models.WikiDocument, bool) {
		d, ok := store[id]
		return d, ok
	}
}

func titles(docs []models.WikiDocument) []string {
	out := make([]string, len(docs))
	for i, d := range docs {
		out[i] = d.Title
	}
	return out
}

func equalTitles(got []models.WikiDocument, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i].Title != want[i] {
			return false
		}
	}
	return true
}
