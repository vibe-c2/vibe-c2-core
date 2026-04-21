package wiki

import (
	"testing"

	"github.com/google/uuid"
)

func TestExtractReferencedFileIDs(t *testing.T) {
	keep1 := uuid.New()
	keep2 := uuid.New()
	notMatched := uuid.New()

	content := "paragraph\n\n" +
		"[download](/api/v1/wiki/files/" + keep1.String() + ")\n\n" +
		`<a href="/api/v1/wiki/files/` + keep2.String() + `">link</a>` + "\n\n" +
		"bogus /api/v1/wiki/files/not-a-uuid should not match\n" +
		"unrelated " + notMatched.String() + " text"

	got := extractReferencedFileIDs(content)
	if len(got) != 2 {
		t.Fatalf("want 2 refs, got %d (%v)", len(got), got)
	}
	if _, ok := got[keep1]; !ok {
		t.Errorf("missing keep1")
	}
	if _, ok := got[keep2]; !ok {
		t.Errorf("missing keep2")
	}
	if _, ok := got[notMatched]; ok {
		t.Errorf("unexpectedly matched bare UUID")
	}
}

func TestExtractReferencedFileIDs_Empty(t *testing.T) {
	got := extractReferencedFileIDs("no files here")
	if len(got) != 0 {
		t.Fatalf("expected empty, got %v", got)
	}
}

// TestExtractReferencedFileIDs_DoesNotMatchImages ensures the file regex does
// not accidentally sweep files whose IDs appear in image URLs (or vice versa).
func TestExtractReferencedFileIDs_DoesNotMatchImages(t *testing.T) {
	imgID := uuid.New()
	content := "![](/api/v1/wiki/images/" + imgID.String() + ")"
	got := extractReferencedFileIDs(content)
	if len(got) != 0 {
		t.Fatalf("file regex should not match image URLs, got %v", got)
	}
}
