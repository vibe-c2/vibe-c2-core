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

	// Attachment keys are the `uploads/...` suffix exactly as it appears
	// in the markdown — no collection prefix. The orchestrator looks up
	// blobs by what the markdown wrote.
	for k := range got.AttachmentBlobs {
		if !strings.HasPrefix(k, "uploads/") {
			t.Errorf("attachment key %q must start with uploads/", k)
		}
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

// TestParse_NestedUploadsLayout covers Outline's workspace-export layout
// where the `uploads/` directory lives deep inside the folder tree, not at
// the collection root. The cropped single-collection fixture has uploads
// at `<coll>/uploads/...`; a full workspace export emits paths like
// `<coll>/<sub>/<sub2>/uploads/<userId>/<attId>/<file>`, and the doc's
// markdown still references `uploads/<userId>/<attId>/<file>` regardless.
// Regression for the bug where 946 docs imported with 0 attachments
// because indexZip's `segments[1] == "uploads"` check only matched the
// collection-root case.
func TestParse_NestedUploadsLayout(t *testing.T) {
	zr := buildZip(t, map[string]string{
		"col/sub/sub2/doc.md":                                        "# doc\n[file 100](uploads/u1/a1/file.bin)\n",
		"col/sub/sub2/uploads/u1/a1/file.bin":                        "binary",
		"col/other/uploads/u2/a2/img.png":                            "png",
		"col/uploads/u3/a3/at-collection-root.zip":                   "root-zip",
		"col/wrong-path-without-uploads/u9/a9/should-be-ignored.txt": "no",
	})
	got, err := Parse(zr)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	wantKeys := map[string]bool{
		"uploads/u1/a1/file.bin":               false,
		"uploads/u2/a2/img.png":                false,
		"uploads/u3/a3/at-collection-root.zip": false,
	}
	for k := range got.AttachmentBlobs {
		if _, ok := wantKeys[k]; !ok {
			t.Errorf("unexpected attachment key: %q", k)
			continue
		}
		wantKeys[k] = true
	}
	for k, seen := range wantKeys {
		if !seen {
			t.Errorf("attachment key %q not cataloged", k)
		}
	}
	if _, bad := got.AttachmentBlobs["wrong-path-without-uploads/u9/a9/should-be-ignored.txt"]; bad {
		t.Error("non-uploads file got cataloged as attachment")
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

func TestParse_AllowsDoubleDotInFilename(t *testing.T) {
	// Outline preserves trailing punctuation in document titles, so files
	// like "solutions..md" (title ended in ".", then ".md" extension) reach
	// us. ".." inside a filename is not a path-traversal attack and must
	// not crash the import. Regression for the Post-Exploitation export
	// failure where "WMI Disable. Reasons%2Fsolutions..md" was rejected.
	zr := buildZip(t, map[string]string{
		"col/solutions..md":   "# solutions\nbody\n",
		"col/v1.0..md":        "# v1.0\nbody\n",
		"col/sub/foo..bar.md": "# foo bar\nbody\n",
	})
	got, err := Parse(zr)
	if err != nil {
		t.Fatalf("Parse rejected legitimate filenames: %v", err)
	}
	if len(got.Collections) != 1 {
		t.Fatalf("collections: got %d want 1", len(got.Collections))
	}
	titles := docTitles(got.Collections[0].Documents)
	want := []string{"solutions", "v1.0"}
	if !sliceEq(titles, want) {
		t.Errorf("root titles: got %v want %v", titles, want)
	}
}

func TestParse_RejectsTraversalSegmentMidPath(t *testing.T) {
	// ".." as an interior path segment is still rejected.
	zr := buildZip(t, map[string]string{
		"col/sub/../evil.md": "# pwn",
	})
	if _, err := Parse(zr); err == nil {
		t.Fatal("Parse accepted zip with mid-path traversal segment")
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
