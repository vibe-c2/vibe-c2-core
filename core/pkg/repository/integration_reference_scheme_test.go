package repository

import (
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// BackfillReferenceScheme is the step that makes swapping to a build which only
// understands the current chip spellings safe: the derived markdown is what the
// CRDT rebuild path reads, so a body left on the old scheme would lower its
// chips into plain links. The update is an aggregation pipeline ($replaceAll),
// which is the part worth proving against a real server rather than a mock.
func TestIntegrationBackfillReferenceScheme(t *testing.T) {
	db := integrationDB(t)
	ctx := testCtx(t)
	repo := NewWikiDocumentRepository(db)

	host := uuid.New()
	legacy := "on [host](vibe://host/" + host.String() + ")\n\n" +
		"```vibe-credential\n{\"id\": \"" + uuid.New().String() + "\"}\n```"
	untouched := "plain [link](https://github.com/vibe-c2) stays"

	ids := map[string]uuid.UUID{}
	for _, c := range []struct{ title, content string }{
		{"legacy", legacy},
		{"external link", untouched},
	} {
		id := uuid.New()
		ids[c.title] = id
		if err := repo.Create(ctx, &models.WikiDocument{
			DocumentID: id, OperationID: uuid.New(),
			Title: c.title, TitleLower: strings.ToLower(c.title), Content: c.content,
		}); err != nil {
			t.Fatalf("seed %q: %v", c.title, err)
		}
	}

	n, err := repo.BackfillReferenceScheme(ctx)
	if err != nil {
		t.Fatalf("backfill: %v", err)
	}
	if n != 1 {
		t.Fatalf("rows = %d, want 1 (only the legacy body qualifies)", n)
	}

	// Re-running must be a no-op, or every boot would rewrite the collection.
	again, err := repo.BackfillReferenceScheme(ctx)
	if err != nil {
		t.Fatalf("second backfill: %v", err)
	}
	if again != 0 {
		t.Fatalf("second run modified %d rows, want 0", again)
	}

	got, err := repo.FindByID(ctx, ids["legacy"])
	if err != nil {
		t.Fatalf("read back rewritten doc: %v", err)
	}
	if strings.Contains(got.Content, "vibe://") || strings.Contains(got.Content, "vibe-credential") {
		t.Errorf("old spelling survived: %s", got.Content)
	}
	if !strings.Contains(got.Content, "logos://host/"+host.String()) {
		t.Errorf("chip not rewritten: %s", got.Content)
	}
	if !strings.Contains(got.Content, "```logos-credential") {
		t.Errorf("credential fence not rewritten: %s", got.Content)
	}

	// A user-authored link that merely mentions the old org is not a marker,
	// and rewriting it would silently edit someone's page.
	other, err := repo.FindByID(ctx, ids["external link"])
	if err != nil {
		t.Fatalf("read back untouched doc: %v", err)
	}
	if other.Content != untouched {
		t.Errorf("unrelated body was modified:\n got: %s\nwant: %s", other.Content, untouched)
	}
}
