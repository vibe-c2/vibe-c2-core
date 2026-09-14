package markdown

import (
	"testing"
)

func TestSlugify(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"Hello World", "hello-world"},
		{"  Hello   World  ", "hello-world"},
		{"Title/with\\slashes", "title-with-slashes"},
		{"Émoji 🎉 stays text", "émoji-stays-text"},
		{"Отчёт по хосту DC-01", "отчёт-по-хосту-dc-01"},
		{"日本語 のページ", "日本語-のページ"},
		{"!!! 🎉", "untitled"},
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

func TestRelativeLink(t *testing.T) {
	cases := []struct{ from, to, want string }{
		{"root/001-a.md", "root/002-b.md", "002-b.md"},
		{"root/001-a.md", "root/001-a/001-c.md", "001-a/001-c.md"},
		{"root/001-a/001-c.md", "root/002-b.md", "../002-b.md"},
		{"root/001-a/001-c/001-d.md", "root/001-a/002-e.md", "../002-e.md"},
		{"root/001-a/001-c.md", "root/uploads/d/a/img.png", "../uploads/d/a/img.png"},
		{"root/001-a.md", "root/uploads/d/a/img.png", "uploads/d/a/img.png"},
		{"root/001-a.md", "root/001-a.md", "001-a.md"},
	}
	for _, c := range cases {
		if got := relativeLink(c.from, c.to); got != c.want {
			t.Errorf("relativeLink(%q, %q) = %q, want %q", c.from, c.to, got, c.want)
		}
	}
}
