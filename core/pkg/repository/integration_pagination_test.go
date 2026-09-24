package repository

import (
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
)

// Keyset pagination, against a real server.
//
// The invariant every test here rests on: walking a list in small pages must
// see every row exactly once, in the same order one large page would. That
// single property covers a reversed comparison operator, an off-by-one at the
// page boundary, a cursor filter that repeats or skips the row on the seam, and
// a missing _id tiebreaker. None of those produce an error — they produce a
// page that looks fine and is wrong.

const integrationPageSize = 3

func TestIntegrationWikiDocumentPaginationCoversEveryRow(t *testing.T) {
	db := integrationDB(t)
	ctx := testCtx(t)
	repo := NewWikiDocumentRepository(db)

	opID := uuid.New()
	const total = 10
	clock := newSeedClock(time.Minute)

	for i := range total {
		created := clock.next()
		doc := &models.WikiDocument{
			DocumentID:   uuid.New(),
			OperationID:  opID,
			Title:        fmt.Sprintf("doc-%02d", i),
			DefaultField: createdAt(created),
		}
		if err := repo.Create(ctx, doc); err != nil {
			t.Fatalf("seed %d: %v", i, err)
		}
	}

	filter := WikiDocumentFilter{Sort: SortByCreatedAt}

	// One page big enough for everything is the reference order.
	want, err := repo.FindByOperationIDWithCursor(ctx, opID, filter, nil, total+5, true)
	if err != nil {
		t.Fatalf("reference fetch: %v", err)
	}
	if len(want) != total {
		t.Fatalf("reference fetch returned %d rows, want %d", len(want), total)
	}

	got := pageAll(t, integrationPageSize, total,
		func(cursor *pagination.Cursor, limit int64) ([]models.WikiDocument, error) {
			return repo.FindByOperationIDWithCursor(ctx, opID, filter, cursor, limit, true)
		},
		func(d *models.WikiDocument) string { return pagination.EncodeCursor(d.CreateAt, d.Id) },
	)

	assertNoDuplicates(t, "paged titles", titlesOf(got))
	assertSameOrder(t, "paged vs single fetch", titlesOf(got), titlesOf(want))

	// And the order is the documented one: newest first.
	for i := 1; i < len(got); i++ {
		if got[i].CreateAt.After(got[i-1].CreateAt) {
			t.Errorf("createAt sort is not descending at index %d: %s then %s",
				i, got[i-1].CreateAt, got[i].CreateAt)
			break
		}
	}
}

// TestIntegrationWikiDocumentPaginationTiebreaker is the case the seeded data
// usually hides: every row shares one sort value, so ordering rests entirely on
// the _id tiebreaker in the cursor filter. Without it a page boundary either
// repeats or loses the rows that tie.
func TestIntegrationWikiDocumentPaginationTiebreaker(t *testing.T) {
	db := integrationDB(t)
	ctx := testCtx(t)
	repo := NewWikiDocumentRepository(db)

	opID := uuid.New()
	const total = 9
	same := newSeedClock(0).next() // identical createAt for every row

	for i := range total {
		doc := &models.WikiDocument{
			DocumentID:   uuid.New(),
			OperationID:  opID,
			Title:        fmt.Sprintf("tie-%02d", i),
			DefaultField: createdAt(same),
		}
		if err := repo.Create(ctx, doc); err != nil {
			t.Fatalf("seed %d: %v", i, err)
		}
	}

	filter := WikiDocumentFilter{Sort: SortByCreatedAt}
	want, err := repo.FindByOperationIDWithCursor(ctx, opID, filter, nil, total+5, true)
	if err != nil {
		t.Fatalf("reference fetch: %v", err)
	}

	got := pageAll(t, integrationPageSize, total,
		func(cursor *pagination.Cursor, limit int64) ([]models.WikiDocument, error) {
			return repo.FindByOperationIDWithCursor(ctx, opID, filter, cursor, limit, true)
		},
		func(d *models.WikiDocument) string { return pagination.EncodeCursor(d.CreateAt, d.Id) },
	)

	assertNoDuplicates(t, "tied-value paging", titlesOf(got))
	if len(got) != total {
		t.Errorf("paging over %d rows with an identical sort value returned %d", total, len(got))
	}
	assertSameOrder(t, "tied-value paging vs single fetch", titlesOf(got), titlesOf(want))
}

// TestIntegrationWikiDocumentBackwardPagination covers last/before. Backward
// pages traverse against the list's primary direction and the repository
// returns them in traversal order, so the caller sees the tail of the list
// reversed — the resolver is what flips it back. Asserting the set and the
// absence of duplicates is the part that matters here.
func TestIntegrationWikiDocumentBackwardPagination(t *testing.T) {
	db := integrationDB(t)
	ctx := testCtx(t)
	repo := NewWikiDocumentRepository(db)

	opID := uuid.New()
	const total = 8
	clock := newSeedClock(time.Minute)
	for i := range total {
		doc := &models.WikiDocument{
			DocumentID:   uuid.New(),
			OperationID:  opID,
			Title:        fmt.Sprintf("back-%02d", i),
			DefaultField: createdAt(clock.next()),
		}
		if err := repo.Create(ctx, doc); err != nil {
			t.Fatalf("seed %d: %v", i, err)
		}
	}

	filter := WikiDocumentFilter{Sort: SortByCreatedAt}
	forward, err := repo.FindByOperationIDWithCursor(ctx, opID, filter, nil, total+5, true)
	if err != nil {
		t.Fatalf("forward fetch: %v", err)
	}

	// Start from the middle of the forward list and page backward from there.
	mid := forward[len(forward)/2]
	cur, err := pagination.DecodeCursor(pagination.EncodeCursor(mid.CreateAt, mid.Id))
	if err != nil {
		t.Fatalf("decode cursor: %v", err)
	}

	back, err := repo.FindByOperationIDWithCursor(ctx, opID, filter, &cur, total+5, false)
	if err != nil {
		t.Fatalf("backward fetch: %v", err)
	}

	assertNoDuplicates(t, "backward page", titlesOf(back))

	// Backward from the middle must return exactly the rows that precede it in
	// the forward order, and never the cursor row itself.
	forwardTitles := titlesOf(forward)
	idx := indexOf(forwardTitles, mid.Title)
	if idx < 0 {
		t.Fatalf("cursor row %q missing from forward order", mid.Title)
	}
	expected := map[string]bool{}
	for _, tt := range forwardTitles[:idx] {
		expected[tt] = true
	}
	for _, tt := range titlesOf(back) {
		if tt == mid.Title {
			t.Errorf("backward page contains the cursor row %q", tt)
		}
		if !expected[tt] {
			t.Errorf("backward page contains %q, which does not precede the cursor", tt)
		}
	}
	if len(back) != len(expected) {
		t.Errorf("backward page returned %d rows, want the %d preceding the cursor",
			len(back), len(expected))
	}
}

// TestIntegrationWikiDocumentSortByLastUpdatedAt covers the second sort mode
// and the exclusion the comment on SortByLastUpdatedAt promises: rows with a
// null last_updated_at have nothing to sort against and must not appear.
func TestIntegrationWikiDocumentSortByLastUpdatedAt(t *testing.T) {
	db := integrationDB(t)
	ctx := testCtx(t)
	repo := NewWikiDocumentRepository(db)

	opID := uuid.New()
	clock := newSeedClock(time.Minute)

	// Six edited documents and three never edited.
	const edited, never = 6, 3
	for i := range edited {
		at := clock.next()
		doc := &models.WikiDocument{
			DocumentID:    uuid.New(),
			OperationID:   opID,
			Title:         fmt.Sprintf("edited-%02d", i),
			DefaultField:  createdAt(at),
			LastUpdatedAt: &at,
		}
		if err := repo.Create(ctx, doc); err != nil {
			t.Fatalf("seed edited %d: %v", i, err)
		}
	}
	for i := range never {
		doc := &models.WikiDocument{
			DocumentID:   uuid.New(),
			OperationID:  opID,
			Title:        fmt.Sprintf("never-%02d", i),
			DefaultField: createdAt(clock.next()),
		}
		if err := repo.Create(ctx, doc); err != nil {
			t.Fatalf("seed never %d: %v", i, err)
		}
	}

	filter := WikiDocumentFilter{Sort: SortByLastUpdatedAt}
	got := pageAll(t, integrationPageSize, edited,
		func(cursor *pagination.Cursor, limit int64) ([]models.WikiDocument, error) {
			return repo.FindByOperationIDWithCursor(ctx, opID, filter, cursor, limit, true)
		},
		func(d *models.WikiDocument) string {
			at := d.CreateAt
			if d.LastUpdatedAt != nil {
				at = *d.LastUpdatedAt
			}
			return pagination.EncodeCursor(at, d.Id)
		},
	)

	assertNoDuplicates(t, "last_updated_at paging", titlesOf(got))
	if len(got) != edited {
		t.Errorf("got %d rows, want %d: never-edited rows must be excluded (got %v)",
			len(got), edited, titlesOf(got))
	}
	for _, d := range got {
		if d.LastUpdatedAt == nil {
			t.Errorf("row %q has a null last_updated_at and should not be in this sort", d.Title)
		}
	}
	for i := 1; i < len(got); i++ {
		if got[i].LastUpdatedAt.After(*got[i-1].LastUpdatedAt) {
			t.Errorf("last_updated_at sort is not descending at index %d", i)
			break
		}
	}
}

// TestIntegrationCredentialStringSortPagination covers the string-keyed cursor.
// name and username sort as strings and encode the cursor through
// EncodeStringCursor rather than the timestamp slot, so this exercises a
// different comparison path from every time-ordered list — and both directions
// of it, since credentials are the only list the client can sort ascending.
func TestIntegrationCredentialStringSortPagination(t *testing.T) {
	db := integrationDB(t)
	ctx := testCtx(t)
	repo := NewCredentialRepository(db)

	opID := uuid.New()
	// Deliberately not in sorted order, and with a repeated name so the
	// tiebreaker matters on the string path too.
	names := []string{"delta", "alpha", "charlie", "alpha", "echo", "bravo", "foxtrot"}
	clock := newSeedClock(time.Minute)
	for i, n := range names {
		c := &models.Credential{
			CredentialID: uuid.New(),
			OperationID:  opID,
			Name:         n,
			Username:     fmt.Sprintf("user-%02d", i),
			DefaultField: createdAt(clock.next()),
		}
		if err := repo.Create(ctx, c); err != nil {
			t.Fatalf("seed %s: %v", n, err)
		}
	}

	for _, tc := range []struct {
		name      string
		ascending bool
	}{
		{"name ascending", true},
		{"name descending", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			sort := CredentialSort{Field: CredentialSortFieldName, Ascending: tc.ascending}
			filter := CredentialFilter{}

			want, err := repo.FindByOperationIDWithCursor(ctx, opID, filter, sort, nil, int64(len(names))+5, true)
			if err != nil {
				t.Fatalf("reference fetch: %v", err)
			}
			if len(want) != len(names) {
				t.Fatalf("reference fetch returned %d rows, want %d", len(want), len(names))
			}

			got := pageAll(t, integrationPageSize, len(names),
				func(cursor *pagination.Cursor, limit int64) ([]models.Credential, error) {
					return repo.FindByOperationIDWithCursor(ctx, opID, filter, sort, cursor, limit, true)
				},
				func(c *models.Credential) string { return sort.Cursor(c) },
			)

			assertNoDuplicates(t, tc.name+" ids", credIDsOf(got))
			assertSameOrder(t, tc.name+" paged vs single", credNamesOf(got), credNamesOf(want))

			// The direction actually asked for.
			for i := 1; i < len(got); i++ {
				a, b := got[i-1].Name, got[i].Name
				if tc.ascending && a > b {
					t.Errorf("ascending sort broken at %d: %q then %q", i, a, b)
					break
				}
				if !tc.ascending && a < b {
					t.Errorf("descending sort broken at %d: %q then %q", i, a, b)
					break
				}
			}
		})
	}
}

// TestIntegrationCredentialCursorRejectsMismatchedSort covers SortKey's
// ValidateCursor against a live query. A time-keyed cursor replayed against a
// name-sorted list has no string value to compare, and comparing a zero time
// against names would return quietly wrong pages rather than fail.
func TestIntegrationCredentialCursorRejectsMismatchedSort(t *testing.T) {
	db := integrationDB(t)
	ctx := testCtx(t)
	repo := NewCredentialRepository(db)

	opID := uuid.New()
	c := &models.Credential{
		CredentialID: uuid.New(),
		OperationID:  opID,
		Name:         "only",
		DefaultField: createdAt(newSeedClock(0).next()),
	}
	if err := repo.Create(ctx, c); err != nil {
		t.Fatalf("seed: %v", err)
	}

	timeSort := CredentialSort{Field: CredentialSortFieldCreatedAt}
	nameSort := CredentialSort{Field: CredentialSortFieldName, Ascending: true}

	rows, err := repo.FindByOperationIDWithCursor(ctx, opID, CredentialFilter{}, timeSort, nil, 10, true)
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	timeCursor, err := pagination.DecodeCursor(timeSort.Cursor(&rows[0]))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}

	if _, err := repo.FindByOperationIDWithCursor(ctx, opID, CredentialFilter{}, nameSort, &timeCursor, 10, true); err == nil {
		t.Error("a createAt cursor replayed against a name sort should be rejected, not silently used")
	}
}

// TestIntegrationTaskPaginationFilterCombination pins the interaction that is
// easiest to get wrong: a filter narrowing the set *and* a cursor walking it.
// The cursor filter is combined with the base query under $and, so a mistake
// there drops rows that match the filter, and only from pages after the first.
func TestIntegrationTaskPaginationFilterCombination(t *testing.T) {
	db := integrationDB(t)
	ctx := testCtx(t)
	repo := NewTaskRepository(db)

	opID := uuid.New()
	clock := newSeedClock(time.Minute)

	// Interleave two stages so a filtered walk has to skip rows throughout,
	// not just at the ends.
	const perStage = 7
	for i := range perStage * 2 {
		stage := models.TaskStageTodo
		if i%2 == 1 {
			stage = models.TaskStageBacklog
		}
		task := &models.Task{
			TaskID:       uuid.New(),
			OperationID:  opID,
			Name:         fmt.Sprintf("task-%02d", i),
			Stage:        stage,
			DefaultField: createdAt(clock.next()),
		}
		if err := repo.Create(ctx, task); err != nil {
			t.Fatalf("seed %d: %v", i, err)
		}
	}

	filter := TaskFilter{Stage: models.TaskStageTodo}

	total, err := repo.CountByOperationID(ctx, opID, filter)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if total != perStage {
		t.Fatalf("count returned %d, want %d — the filter itself is wrong", total, perStage)
	}

	got := pageAll(t, 2, int(total),
		func(cursor *pagination.Cursor, limit int64) ([]models.Task, error) {
			return repo.FindByOperationIDWithCursor(ctx, opID, filter, cursor, limit, true)
		},
		func(tk *models.Task) string { return pagination.EncodeCursor(tk.CreateAt, tk.Id) },
	)

	assertNoDuplicates(t, "filtered task paging", taskNamesOf(got))
	if len(got) != int(total) {
		t.Errorf("paged %d filtered rows, but Count says %d — the cursor filter is "+
			"dropping rows that match the filter (got %v)", len(got), total, taskNamesOf(got))
	}
	for _, tk := range got {
		if tk.Stage != models.TaskStageTodo {
			t.Errorf("task %q has stage %q, which the filter excludes", tk.Name, tk.Stage)
		}
	}
}

// --- small helpers, kept here so the assertions above read as prose ---

func titlesOf(docs []models.WikiDocument) []string {
	out := make([]string, len(docs))
	for i := range docs {
		out[i] = docs[i].Title
	}
	return out
}

func credNamesOf(cs []models.Credential) []string {
	out := make([]string, len(cs))
	for i := range cs {
		out[i] = cs[i].Name
	}
	return out
}

func credIDsOf(cs []models.Credential) []string {
	out := make([]string, len(cs))
	for i := range cs {
		out[i] = cs[i].CredentialID.String()
	}
	return out
}

func taskNamesOf(ts []models.Task) []string {
	out := make([]string, len(ts))
	for i := range ts {
		out[i] = ts[i].Name
	}
	return out
}

func indexOf(hay []string, needle string) int {
	for i, v := range hay {
		if v == needle {
			return i
		}
	}
	return -1
}
