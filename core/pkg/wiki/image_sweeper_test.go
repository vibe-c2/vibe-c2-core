package wiki

import (
	"testing"

	"github.com/google/uuid"
)

func TestExtractReferencedImageIDs(t *testing.T) {
	keep1 := uuid.New()
	keep2 := uuid.New()
	notMatched := uuid.New()

	content := "paragraph\n\n" +
		"![alt](/api/v1/wiki/images/" + keep1.String() + ")\n\n" +
		"inline <img src=\"/api/v1/wiki/images/" + keep2.String() + "\"/>\n\n" +
		"bogus /api/v1/wiki/images/not-a-uuid should not match\n" +
		"unrelated " + notMatched.String() + " text"

	got := extractReferencedImageIDs(content)
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

func TestExtractReferencedImageIDs_Empty(t *testing.T) {
	got := extractReferencedImageIDs("no images here")
	if len(got) != 0 {
		t.Fatalf("expected empty, got %v", got)
	}
}
