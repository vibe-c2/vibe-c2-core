package wikiimport

import (
	"archive/zip"
	"path/filepath"
	"strings"
	"testing"
)

const fixturePath = "../../../local-outline/test-export.markdown.zip"

func openFixture(t *testing.T) *zip.ReadCloser {
	t.Helper()
	zr, err := zip.OpenReader(filepath.Clean(fixturePath))
	if err != nil {
		t.Fatalf("open fixture %q: %v", fixturePath, err)
	}
	t.Cleanup(func() { _ = zr.Close() })
	return zr
}

func TestParse_RealFixture_TopLevelShape(t *testing.T) {
	zr := openFixture(t)

	got, err := Parse(&zr.Reader)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if len(got.Collections) != 1 {
		t.Fatalf("collections: got %d want 1", len(got.Collections))
	}
	coll := got.Collections[0]
	if coll.Name != "test" {
		t.Errorf("collection name: got %q want %q", coll.Name, "test")
	}

	// Two root docs: "test" and "test2"; "test" has one child ("1234").
	titles := docTitles(coll.Documents)
	wantTitles := []string{"test", "test2"}
	if !sliceEq(titles, wantTitles) {
		t.Errorf("root titles: got %v want %v", titles, wantTitles)
	}

	testDoc := findDoc(coll.Documents, "test")
	if testDoc == nil {
		t.Fatal("'test' doc missing")
	}
	if testDoc.Emoji != "😑" {
		t.Errorf("'test' emoji: got %q want %q", testDoc.Emoji, "😑")
	}
	if len(testDoc.Children) != 1 || testDoc.Children[0].Title != "1234" {
		t.Errorf("'test' children: got %v want [1234]", docTitles(testDoc.Children))
	}
}

func TestParse_RealFixture_Attachments(t *testing.T) {
	zr := openFixture(t)
	got, err := Parse(&zr.Reader)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	// Two attachments in the test fixture: a PDF and a PNG image, both
	// referenced from the "test" document body.
	if len(got.AttachmentBlobs) != 2 {
		t.Errorf("attachment count: got %d want 2", len(got.AttachmentBlobs))
	}

	testDoc := findDoc(got.Collections[0].Documents, "test")
	if testDoc == nil {
		t.Fatal("'test' doc missing")
	}

	wantSubstrings := []string{"Roles%20&%20Responsibilities.pdf", "image.png"}
	for _, want := range wantSubstrings {
		found := false
		for _, ref := range testDoc.AttachmentRefs {
			if strings.Contains(ref, want) {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("attachment ref containing %q not found in %v", want, testDoc.AttachmentRefs)
		}
	}
}

func TestParse_RealFixture_BodyDropsH1(t *testing.T) {
	zr := openFixture(t)
	got, _ := Parse(&zr.Reader)
	testDoc := findDoc(got.Collections[0].Documents, "test")
	if testDoc == nil {
		t.Fatal("'test' doc missing")
	}
	if strings.HasPrefix(testDoc.BodyMarkdown, "#") {
		t.Errorf("BodyMarkdown still starts with H1: %q", firstLine(testDoc.BodyMarkdown))
	}
	// The notice block markup must survive the parse — that's what the
	// sidecar's markdown-to-yjs pipeline turns into wikiNotice nodes.
	if !strings.Contains(testDoc.BodyMarkdown, ":::info") {
		t.Errorf("BodyMarkdown missing :::info marker; first 200 chars = %q", truncate(testDoc.BodyMarkdown, 200))
	}
}

func TestParse_RejectsPathTraversal(t *testing.T) {
	// Build an in-memory zip with a "..": should be rejected.
	zr := buildZip(t, map[string]string{
		"../evil.md": "# pwn",
	})
	if _, err := Parse(zr); err == nil {
		t.Fatal("Parse accepted zip with path traversal")
	}
}

func TestParse_EmojiVariants(t *testing.T) {
	cases := []struct {
		name, h1, wantTitle, wantEmoji string
	}{
		{"plain", "# Hello world", "Hello world", ""},
		{"emoji prefix", "# 😑 test", "test", "😑"},
		{"emoji-only", "# 🚀", "🚀", ""}, // no space → not a title-emoji split
		{"emoji + multiword", "# 🎉 release notes for q2", "release notes for q2", "🎉"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			body := c.h1 + "\n\nbody\n"
			zr := buildZip(t, map[string]string{"col/doc.md": body})
			got, err := Parse(zr)
			if err != nil {
				t.Fatalf("Parse: %v", err)
			}
			d := got.Collections[0].Documents[0]
			if d.Title != c.wantTitle {
				t.Errorf("title: got %q want %q", d.Title, c.wantTitle)
			}
			if d.Emoji != c.wantEmoji {
				t.Errorf("emoji: got %q want %q", d.Emoji, c.wantEmoji)
			}
		})
	}
}

func TestParse_NestedHierarchy(t *testing.T) {
	// "col/a.md" + "col/a/b.md" → b is a child of a.
	zr := buildZip(t, map[string]string{
		"col/a.md":   "# a\nbody\n",
		"col/a/b.md": "# b\nbody\n",
	})
	got, err := Parse(zr)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	a := findDoc(got.Collections[0].Documents, "a")
	if a == nil || len(a.Children) != 1 || a.Children[0].Title != "b" {
		t.Errorf("nested hierarchy not built: %+v", got.Collections[0].Documents)
	}
}

// --- test helpers ---

func docTitles(docs []*Doc) []string {
	out := make([]string, 0, len(docs))
	for _, d := range docs {
		out = append(out, d.Title)
	}
	return out
}

func findDoc(docs []*Doc, title string) *Doc {
	for _, d := range docs {
		if d.Title == title {
			return d
		}
	}
	return nil
}

func sliceEq(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func firstLine(s string) string {
	if i := strings.Index(s, "\n"); i >= 0 {
		return s[:i]
	}
	return s
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func buildZip(t *testing.T, contents map[string]string) *zip.Reader {
	t.Helper()
	var buf strings.Builder
	w := zip.NewWriter(&stringWriter{&buf})
	for name, body := range contents {
		f, err := w.Create(name)
		if err != nil {
			t.Fatalf("zip create %q: %v", name, err)
		}
		if _, err := f.Write([]byte(body)); err != nil {
			t.Fatalf("zip write %q: %v", name, err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatalf("zip close: %v", err)
	}
	data := []byte(buf.String())
	zr, err := zip.NewReader(&byteReaderAt{data}, int64(len(data)))
	if err != nil {
		t.Fatalf("zip read: %v", err)
	}
	return zr
}

type stringWriter struct{ sb *strings.Builder }

func (sw *stringWriter) Write(p []byte) (int, error) { return sw.sb.Write(p) }

type byteReaderAt struct{ data []byte }

func (b *byteReaderAt) ReadAt(p []byte, off int64) (int, error) {
	if off >= int64(len(b.data)) {
		return 0, errEOF
	}
	n := copy(p, b.data[off:])
	if n < len(p) {
		return n, errEOF
	}
	return n, nil
}

var errEOF = &eofErr{}

type eofErr struct{}

func (*eofErr) Error() string { return "EOF" }
