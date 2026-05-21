package wikiexport

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestCollectAttachmentRefs(t *testing.T) {
	body := `Here is an image: ![alt](/api/v1/wiki/images/11111111-1111-1111-1111-111111111111 " =640x480")

And a file: [report.pdf 1024](/api/v1/wiki/files/22222222-2222-2222-2222-222222222222)

A repeated image: /api/v1/wiki/images/11111111-1111-1111-1111-111111111111

Another file: /api/v1/wiki/files/33333333-3333-3333-3333-333333333333
`
	images, files := collectAttachmentRefs(body)
	if len(images) != 1 {
		t.Errorf("images: got %d, want 1 (deduped) — %v", len(images), images)
	}
	if len(files) != 2 {
		t.Errorf("files: got %d, want 2 — %v", len(files), files)
	}
}

func TestRewriteAttachmentRefs(t *testing.T) {
	imgID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	fileID := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	body := `Image: /api/v1/wiki/images/` + imgID.String() + `
File: /api/v1/wiki/files/` + fileID.String() + `
Missing: /api/v1/wiki/images/99999999-9999-9999-9999-999999999999`

	out := rewriteAttachmentRefs(body,
		func(id uuid.UUID) (string, bool) {
			if id == imgID {
				return "uploads/x/y/img.png", true
			}
			return "", false
		},
		func(id uuid.UUID) (string, bool) {
			if id == fileID {
				return "uploads/x/z/report.pdf", true
			}
			return "", false
		},
	)
	if !strings.Contains(out, "uploads/x/y/img.png") {
		t.Errorf("image ref not rewritten: %s", out)
	}
	if !strings.Contains(out, "uploads/x/z/report.pdf") {
		t.Errorf("file ref not rewritten: %s", out)
	}
	// Missing refs left untouched.
	if !strings.Contains(out, "/api/v1/wiki/images/99999999-9999-9999-9999-999999999999") {
		t.Errorf("missing ref should be left in place: %s", out)
	}
}

func TestRenderDocMarkdown(t *testing.T) {
	got := renderDocMarkdown("📘", "Intro", "Hello world.")
	want := "# 📘 Intro\n\nHello world.\n"
	if got != want {
		t.Errorf("with emoji: got %q want %q", got, want)
	}

	got = renderDocMarkdown("", "Plain", "")
	want = "# Plain\n\n"
	if got != want {
		t.Errorf("no body: got %q want %q", got, want)
	}
}

func TestSanitizeFilename(t *testing.T) {
	cases := []struct{ in, want string }{
		{"normal.pdf", "normal.pdf"},
		{"path/sep.png", "sep.png"},
		{"back\\slash.png", "slash.png"},
		{"", "file"},
		{"with\x00null.txt", "withnull.txt"},
		{"trailing. ", "trailing"},
	}
	for _, c := range cases {
		got := sanitizeFilename(c.in)
		if got != c.want {
			t.Errorf("sanitizeFilename(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
