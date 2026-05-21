package wikiexport

import (
	"testing"

	"github.com/google/uuid"
)

func TestSlugify(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"Hello World", "hello-world"},
		{"  Hello   World  ", "hello-world"},
		{"Title/with\\slashes", "title-with-slashes"},
		{"Émoji 🎉 stays text", "moji-stays-text"},
		{"!!!", "untitled"},
		{"", "untitled"},
		{
			"this title is far too long to fit inside the eighty character cap so it gets truncated nicely",
			"this-title-is-far-too-long-to-fit-inside-the-eighty-character-cap-so-it-gets-tru",
		},
	}
	for _, c := range cases {
		got := slugify(c.in)
		if got != c.want {
			t.Errorf("slugify(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestUniqueSlug(t *testing.T) {
	used := map[string]struct{}{}
	if got := uniqueSlug("foo", used); got != "foo" {
		t.Fatalf("first call: got %q want foo", got)
	}
	if got := uniqueSlug("foo", used); got != "foo-2" {
		t.Fatalf("second call: got %q want foo-2", got)
	}
	if got := uniqueSlug("foo", used); got != "foo-3" {
		t.Fatalf("third call: got %q want foo-3", got)
	}
	if got := uniqueSlug("bar", used); got != "bar" {
		t.Fatalf("new slug: got %q want bar", got)
	}
}

func TestBuildDocFilename(t *testing.T) {
	cases := []struct {
		idx  int
		slug string
		want string
	}{
		{0, "intro", "001-intro.md"},
		{9, "ten", "010-ten.md"},
		{99, "hundred", "100-hundred.md"},
	}
	for _, c := range cases {
		got := buildDocFilename(c.idx, c.slug)
		if got != c.want {
			t.Errorf("buildDocFilename(%d, %q) = %q, want %q", c.idx, c.slug, got, c.want)
		}
	}
}

func TestMarkdownRelativePath(t *testing.T) {
	docID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	attID := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	// The link target is the Outline-convention "logical" path, always
	// rooted at `uploads/...` regardless of doc depth. The importer's
	// parser matches `](uploads/...)` exactly and looks the suffix up
	// in the blob map.
	expected := "uploads/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/img.png"
	for _, depth := range []int{0, 1, 5} {
		if got := markdownRelativePath(depth, docID, attID, "img.png"); got != expected {
			t.Errorf("depth=%d: got %q, want %q", depth, got, expected)
		}
	}
}
