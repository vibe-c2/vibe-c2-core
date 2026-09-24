package repository

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// Wiki search and projections, against a real server.
//
// SearchByOperationID fans out to four branches — anchored title prefix, title
// substring, content substring, and $text — merges them and dedupes, keeping
// each document at its highest-priority position. Every part of that needs a
// server: the anchored regex relies on title_lower being pre-lowercased, the
// $text branch needs the text index the repository builds at construction, and
// the ranking is only observable in the merged output.
//
// The projections matter for a different reason. Several queries project
// `content` away because shipping document bodies for up to mergeFetchCap
// candidates was the dominant payload; a projection quietly dropping a field
// the caller needs looks like empty data, not an error.

// seedSearchDocs creates documents with known titles and bodies and returns the
// repository and operation to query.
func seedSearchDocs(t *testing.T, docs []struct{ title, content string }) (IWikiDocumentRepository, uuid.UUID) {
	t.Helper()
	db := integrationDB(t)
	ctx := testCtx(t)
	repo := NewWikiDocumentRepository(db)

	opID := uuid.New()
	clock := newSeedClock(time.Minute)
	for i, d := range docs {
		doc := &models.WikiDocument{
			DocumentID:   uuid.New(),
			OperationID:  opID,
			Title:        d.title,
			TitleLower:   strings.ToLower(d.title),
			Content:      d.content,
			DefaultField: createdAt(clock.next()),
		}
		if err := repo.Create(ctx, doc); err != nil {
			t.Fatalf("seed %d (%q): %v", i, d.title, err)
		}
	}
	return repo, opID
}

func TestIntegrationWikiSearchBranches(t *testing.T) {
	repo, opID := seedSearchDocs(t, []struct{ title, content string }{
		{"Alpha Runbook", "nothing relevant here"},
		{"Beta Notes", "the alpha protocol is described below"},
		{"Gamma 10.0.0.5_cmg-1 host", "unrelated body"},
		{"Delta", "no match at all"},
	})
	ctx := testCtx(t)

	t.Run("title prefix beats content match in the ranking", func(t *testing.T) {
		hits, total, err := repo.SearchByOperationID(ctx, opID, nil, "alpha", 0, 20)
		if err != nil {
			t.Fatalf("search: %v", err)
		}
		if total < 2 {
			t.Fatalf("expected at least the title and content matches, got %d", total)
		}
		// "Alpha Runbook" matches on the title prefix; "Beta Notes" only in the
		// body. The title hit must rank first — that ordering is the whole
		// point of running the branches separately and merging them in order.
		if hits[0].Doc.Title != "Alpha Runbook" {
			t.Errorf("first hit is %q, want the title-prefix match %q",
				hits[0].Doc.Title, "Alpha Runbook")
		}
		if titleIndex(hits, "Beta Notes") < 0 {
			t.Error("the content-only match is missing from the merged results")
		}
	})

	t.Run("mid-title substring the prefix branch cannot reach", func(t *testing.T) {
		// "cmg" sits inside "10.0.0.5_cmg-1". The anchored prefix branch misses
		// it, and $text misses it too because Mongo's word-breaker keeps "_" as
		// a word character; only the title-substring branch finds it. This is
		// the case the branch exists for.
		hits, _, err := repo.SearchByOperationID(ctx, opID, nil, "cmg", 0, 20)
		if err != nil {
			t.Fatalf("search: %v", err)
		}
		if titleIndex(hits, "Gamma 10.0.0.5_cmg-1 host") < 0 {
			t.Errorf("mid-title substring not found; got %v", hitTitles(hits))
		}
	})

	t.Run("no match returns empty rather than everything", func(t *testing.T) {
		hits, total, err := repo.SearchByOperationID(ctx, opID, nil, "zzzznomatch", 0, 20)
		if err != nil {
			t.Fatalf("search: %v", err)
		}
		if total != 0 || len(hits) != 0 {
			t.Errorf("got %d hits (total %d), want none: %v", len(hits), total, hitTitles(hits))
		}
	})

	t.Run("results are deduped across branches", func(t *testing.T) {
		// "Alpha Runbook" can match the prefix branch and $text at once; it
		// must appear once, at its best position.
		hits, _, err := repo.SearchByOperationID(ctx, opID, nil, "alpha", 0, 20)
		if err != nil {
			t.Fatalf("search: %v", err)
		}
		assertNoDuplicates(t, "merged search hits", hitTitles(hits))
	})

	t.Run("empty query lists recent documents", func(t *testing.T) {
		// Browse mode: the palette shows recent docs before anything is typed.
		hits, total, err := repo.SearchByOperationID(ctx, opID, nil, "", 0, 20)
		if err != nil {
			t.Fatalf("search: %v", err)
		}
		if total != 4 || len(hits) != 4 {
			t.Errorf("browse mode returned %d hits (total %d), want all 4", len(hits), total)
		}
	})

	t.Run("search is scoped to one operation", func(t *testing.T) {
		// The strongest thing to get wrong here: leaking another engagement's
		// documents into a search.
		hits, _, err := repo.SearchByOperationID(ctx, uuid.New(), nil, "alpha", 0, 20)
		if err != nil {
			t.Fatalf("search: %v", err)
		}
		if len(hits) != 0 {
			t.Errorf("search in an unrelated operation returned %v", hitTitles(hits))
		}
	})
}

// TestIntegrationQuotedSearchOnListFilters is the live regression test for the
// quoted whole-token syntax.
//
// It targets the list filters rather than the search box, because that is where
// the bug was fatal. A list filter is a single $regex with no fallback, so a
// quoted query compiled with a bare QuoteMeta demanded literal quote characters
// and matched nothing. The search box degrades instead of failing: its $text
// branch strips quotes in buildTextSearchPhrase, so it keeps returning rows even
// when its three regex branches contribute none.
//
// Unquoted queries cannot detect this at all — searchPattern and QuoteMeta
// produce byte-identical patterns for input with no quotes. Only a quoted query
// separates them.
func TestIntegrationQuotedSearchOnListFilters(t *testing.T) {
	db := integrationDB(t)
	ctx := testCtx(t)

	opID := uuid.New()
	clock := newSeedClock(time.Minute)

	t.Run("wiki documents", func(t *testing.T) {
		repo := NewWikiDocumentRepository(db)
		for _, title := range []string{"admin", "administrator", "the admin account"} {
			d := &models.WikiDocument{
				DocumentID:   uuid.New(),
				OperationID:  opID,
				Title:        title,
				TitleLower:   strings.ToLower(title),
				DefaultField: createdAt(clock.next()),
			}
			if err := repo.Create(ctx, d); err != nil {
				t.Fatalf("seed %q: %v", title, err)
			}
		}

		got, err := repo.FindByOperationIDWithCursor(ctx, opID,
			WikiDocumentFilter{Search: `"admin"`}, nil, 20, true)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		titles := titlesOf(got)

		if len(got) == 0 {
			t.Fatal(`quoted search returned no rows — the quote characters are being matched literally`)
		}
		if indexOf(titles, "admin") < 0 || indexOf(titles, "the admin account") < 0 {
			t.Errorf(`"admin" should match whole-token occurrences; got %v`, titles)
		}
		if indexOf(titles, "administrator") >= 0 {
			t.Errorf(`"admin" must not match "administrator"; got %v`, titles)
		}
	})

	t.Run("tasks", func(t *testing.T) {
		repo := NewTaskRepository(db)
		taskOp := uuid.New()
		for _, name := range []string{"admin", "administrator", "reset admin password"} {
			tk := &models.Task{
				TaskID:       uuid.New(),
				OperationID:  taskOp,
				Name:         name,
				Stage:        models.TaskStageTodo,
				DefaultField: createdAt(clock.next()),
			}
			if err := repo.Create(ctx, tk); err != nil {
				t.Fatalf("seed %q: %v", name, err)
			}
		}

		got, err := repo.FindByOperationIDWithCursor(ctx, taskOp,
			TaskFilter{Search: `"admin"`}, nil, 20, true)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		names := taskNamesOf(got)

		if len(got) == 0 {
			t.Fatal(`quoted search returned no tasks — the quote characters are being matched literally`)
		}
		if indexOf(names, "admin") < 0 || indexOf(names, "reset admin password") < 0 {
			t.Errorf(`"admin" should match whole-token occurrences; got %v`, names)
		}
		if indexOf(names, "administrator") >= 0 {
			t.Errorf(`"admin" must not match "administrator"; got %v`, names)
		}
	})
}

// TestIntegrationWikiSearchSubtreeScope covers the path_ids scope filter, which
// replaced an O(depth) descendant walk with a single index probe. A scoped
// search must reach the whole subtree, not just direct children.
func TestIntegrationWikiSearchSubtreeScope(t *testing.T) {
	db := integrationDB(t)
	ctx := testCtx(t)
	repo := NewWikiDocumentRepository(db)

	opID := uuid.New()
	clock := newSeedClock(time.Minute)

	// root → child → grandchild, all matching the query, plus an outsider.
	mk := func(title string, parent *uuid.UUID) *models.WikiDocument {
		d := &models.WikiDocument{
			DocumentID:       uuid.New(),
			OperationID:      opID,
			ParentDocumentID: parent,
			Title:            title,
			TitleLower:       strings.ToLower(title),
			Content:          "needle",
			DefaultField:     createdAt(clock.next()),
		}
		if err := repo.Create(ctx, d); err != nil {
			t.Fatalf("seed %q: %v", title, err)
		}
		return d
	}

	root := mk("needle root", nil)
	child := mk("needle child", &root.DocumentID)
	mk("needle grandchild", &child.DocumentID)
	mk("needle outsider", nil)

	hits, _, err := repo.SearchByOperationID(ctx, opID, &root.DocumentID, "needle", 0, 20)
	if err != nil {
		t.Fatalf("scoped search: %v", err)
	}
	titles := hitTitles(hits)

	for _, want := range []string{"needle root", "needle child", "needle grandchild"} {
		if titleIndex(hits, want) < 0 {
			t.Errorf("scoped search missed %q — the subtree scope does not reach the "+
				"whole descendant chain; got %v", want, titles)
		}
	}
	if titleIndex(hits, "needle outsider") >= 0 {
		t.Errorf("scoped search leaked a document outside the subtree; got %v", titles)
	}
}

// TestIntegrationWikiSearchProjectionKeepsMetadata pins what the content
// projection is allowed to drop. The branches project `content` away to keep
// the candidate payload small, and the caller re-fetches bodies only for the
// page it returns — so the fields the UI renders must survive the projection.
func TestIntegrationWikiSearchProjectionKeepsMetadata(t *testing.T) {
	repo, opID := seedSearchDocs(t, []struct{ title, content string }{
		{"Projection Probe", "the needle is in the body"},
	})
	ctx := testCtx(t)

	hits, _, err := repo.SearchByOperationID(ctx, opID, nil, "needle", 0, 20)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(hits) != 1 {
		t.Fatalf("got %d hits, want 1: %v", len(hits), hitTitles(hits))
	}

	got := hits[0].Doc
	if got.DocumentID == uuid.Nil {
		t.Error("document_id was projected away; the UI cannot link to the result")
	}
	if got.OperationID != opID {
		t.Errorf("operation_id did not survive the projection: %v", got.OperationID)
	}
	if got.Title == "" {
		t.Error("title was projected away; the result has nothing to display")
	}
	if got.CreateAt.IsZero() {
		t.Error("createAt was projected away; it is the cursor field for browse mode")
	}
	// A content match must still produce a snippet, which means the caller
	// re-fetched the body for the returned page after the projection dropped it.
	if hits[0].Snippet == "" {
		t.Error("no snippet for a content match — the body was never re-fetched")
	}
	if !strings.Contains(strings.ToLower(hits[0].Snippet), "needle") {
		t.Errorf("snippet %q does not contain the match", hits[0].Snippet)
	}
}

// TestIntegrationWikiSearchPaging covers offset/limit over the merged result,
// which is applied after the branches are combined and deduped.
func TestIntegrationWikiSearchPaging(t *testing.T) {
	var docs []struct{ title, content string }
	for i := range 7 {
		docs = append(docs, struct{ title, content string }{
			title:   fmt.Sprintf("match-%02d", i),
			content: "shared needle body",
		})
	}
	repo, opID := seedSearchDocs(t, docs)
	ctx := testCtx(t)

	full, total, err := repo.SearchByOperationID(ctx, opID, nil, "needle", 0, 20)
	if err != nil {
		t.Fatalf("full search: %v", err)
	}
	if total != int64(len(docs)) {
		t.Fatalf("total is %d, want %d", total, len(docs))
	}

	// Walking the result in pages of 2 must reproduce the single-page order.
	var paged []string
	for offset := int64(0); offset < total; offset += 2 {
		page, pageTotal, err := repo.SearchByOperationID(ctx, opID, nil, "needle", offset, 2)
		if err != nil {
			t.Fatalf("page at offset %d: %v", offset, err)
		}
		if pageTotal != total {
			t.Errorf("total changed mid-pagination: %d at offset %d, want %d",
				pageTotal, offset, total)
		}
		paged = append(paged, hitTitles(page)...)
	}

	assertNoDuplicates(t, "search paging", paged)
	assertSameOrder(t, "search paged vs single fetch", paged, hitTitles(full))
}

func hitTitles(hits []WikiDocumentSearchHit) []string {
	out := make([]string, len(hits))
	for i := range hits {
		out[i] = hits[i].Doc.Title
	}
	return out
}

func titleIndex(hits []WikiDocumentSearchHit, title string) int {
	for i := range hits {
		if hits[i].Doc.Title == title {
			return i
		}
	}
	return -1
}
