package wikiexport

import (
	"archive/zip"
	"bytes"
	"io"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikiimport"
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
	got := renderDocMarkdown("📘", "Intro", "", "", "Hello world.")
	want := "# 📘 Intro\n\nHello world.\n"
	if got != want {
		t.Errorf("with emoji, no meta: got %q want %q", got, want)
	}

	got = renderDocMarkdown("", "Plain", "", "", "")
	want = "# Plain\n\n"
	if got != want {
		t.Errorf("no body, no meta: got %q want %q", got, want)
	}

	got = renderDocMarkdown("", "Notes", "Adaptive", "", "Body.")
	want = "# Notes\n<!-- vibe:meta icon=\"Adaptive\" -->\n\nBody.\n"
	if got != want {
		t.Errorf("icon-only meta: got %q want %q", got, want)
	}

	got = renderDocMarkdown("", "Notes", "FileText", "#1f2937", "")
	want = "# Notes\n<!-- vibe:meta icon=\"FileText\" color=\"#1f2937\" -->\n\n"
	if got != want {
		t.Errorf("icon + color meta: got %q want %q", got, want)
	}
}

// TestRenderDocMarkdown_RoundTripIconColor locks the export ↔ import
// contract: every icon/color combination the exporter writes must come
// back out of the import parser unchanged. If the meta grammar drifts on
// either side, this test fails loud.
func TestRenderDocMarkdown_RoundTripIconColor(t *testing.T) {
	cases := []struct {
		name            string
		emoji           string
		title           string
		icon            string
		color           string
		body            string
		wantParserEmoji string
		wantParserIcon  string
		wantParserColor string
		wantParserBody  string
	}{
		{
			name:           "icon only",
			title:          "Project Plan",
			icon:           "Adaptive",
			body:           "details\n",
			wantParserIcon: "Adaptive",
			wantParserBody: "details\n",
		},
		{
			name:            "emoji + icon + color all set",
			emoji:           "🚀",
			title:           "Launch",
			icon:            "Rocket",
			color:           "#ef4444",
			body:            "go\n",
			wantParserEmoji: "🚀",
			wantParserIcon:  "Rocket",
			wantParserColor: "#ef4444",
			wantParserBody:  "go\n",
		},
		{
			name:           "no meta, body preserved",
			title:          "Plain",
			body:           "just text\n",
			wantParserBody: "just text\n",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rendered := renderDocMarkdown(c.emoji, c.title, c.icon, c.color, c.body)
			// Feed the rendered markdown through the real importer to
			// confirm the round-trip — using the public Parse entry
			// point exercises the same code paths a real re-import hits.
			doc := parseOneDoc(t, rendered)
			if doc.Title != c.title {
				t.Errorf("title: got %q want %q", doc.Title, c.title)
			}
			if doc.Emoji != c.wantParserEmoji {
				t.Errorf("emoji: got %q want %q", doc.Emoji, c.wantParserEmoji)
			}
			if doc.Icon != c.wantParserIcon {
				t.Errorf("icon: got %q want %q", doc.Icon, c.wantParserIcon)
			}
			if doc.Color != c.wantParserColor {
				t.Errorf("color: got %q want %q", doc.Color, c.wantParserColor)
			}
			if doc.BodyMarkdown != c.wantParserBody {
				t.Errorf("body: got %q want %q", doc.BodyMarkdown, c.wantParserBody)
			}
		})
	}
}

// parseOneDoc wraps the given markdown body in a minimal in-memory zip
// shaped like an Outline export (one collection folder, one doc inside),
// runs the real import parser over it, and returns the parsed Doc. Avoids
// duplicating the parser's grammar in the export test file.
func parseOneDoc(t *testing.T, body string) *wikiimport.Doc {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, err := zw.Create("col/doc.md")
	if err != nil {
		t.Fatalf("zip.Create: %v", err)
	}
	if _, err := io.WriteString(w, body); err != nil {
		t.Fatalf("zip write: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zip.Close: %v", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatalf("zip.NewReader: %v", err)
	}
	parsed, err := wikiimport.Parse(zr)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(parsed.Collections) != 1 || len(parsed.Collections[0].Documents) != 1 {
		t.Fatalf("unexpected parse shape: %+v", parsed.Collections)
	}
	return parsed.Collections[0].Documents[0]
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
