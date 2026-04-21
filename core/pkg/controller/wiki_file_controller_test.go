package controller

import (
	"strings"
	"testing"
)

func TestSanitizeUploadFilename(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"plain", "report.pdf", "report.pdf"},
		{"posix path", "/tmp/../secret.pdf", "secret.pdf"},
		{"windows path", `C:\Users\foo\quarterly.xlsx`, "quarterly.xlsx"},
		{"control chars stripped", "a\x00b\x01c.txt", "abc.txt"},
		{"whitespace collapsed", "my   report  final.pdf", "my report final.pdf"},
		{"trim trailing dots and spaces", "weird . ", "weird"},
		{"unicode preserved", "отчёт.pdf", "отчёт.pdf"},
		{"dot files allowed", ".gitignore", ".gitignore"},
		{"empty", "", ""},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := sanitizeUploadFilename(c.in)
			if got != c.want {
				t.Errorf("sanitizeUploadFilename(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestSanitizeUploadFilename_LongName(t *testing.T) {
	// A 400-char base + ".pdf" should be truncated to <=255 bytes while
	// preserving the extension.
	base := strings.Repeat("a", 400)
	in := base + ".pdf"
	got := sanitizeUploadFilename(in)
	if len(got) > 255 {
		t.Fatalf("length %d exceeds 255", len(got))
	}
	if !strings.HasSuffix(got, ".pdf") {
		t.Fatalf("extension not preserved: %q", got)
	}
}

func TestIsDeniedContentType(t *testing.T) {
	deny := []string{"application/x-msdownload", "text/html"}

	cases := []struct {
		ct   string
		want bool
	}{
		{"application/pdf", false},
		{"application/x-msdownload", true},
		{"Application/X-MSDownload", true},
		{"application/x-msdownload; charset=utf-8", true},
		{"text/html", true},
		{"text/plain", false},
		{"", false},
	}

	for _, c := range cases {
		got := isDeniedContentType(c.ct, deny)
		if got != c.want {
			t.Errorf("isDeniedContentType(%q) = %v, want %v", c.ct, got, c.want)
		}
	}
}

func TestIsDeniedContentType_EmptyList(t *testing.T) {
	if isDeniedContentType("text/html", nil) {
		t.Error("empty denylist should allow everything")
	}
	if isDeniedContentType("text/html", []string{}) {
		t.Error("empty denylist should allow everything")
	}
}

func TestContentDispositionFor(t *testing.T) {
	cases := []struct {
		name        string
		filename    string
		contentType string
		preview     bool
		wantPrefix  string
	}{
		{"default is attachment", "report.pdf", "application/pdf", false, "attachment;"},
		{"preview PDF is inline", "report.pdf", "application/pdf", true, "inline;"},
		{"preview text is inline", "notes.txt", "text/plain", true, "inline;"},
		{"preview docx stays attachment", "a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", true, "attachment;"},
		{"preview html forced to attachment", "x.html", "text/html", true, "attachment;"},
		{"preview svg forced to attachment", "x.svg", "image/svg+xml", true, "attachment;"},
		{"preview js forced to attachment", "x.js", "application/javascript", true, "attachment;"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := contentDispositionFor(c.filename, c.contentType, c.preview)
			if !strings.HasPrefix(got, c.wantPrefix) {
				t.Errorf("contentDispositionFor(%q, %q, %v) = %q, want prefix %q",
					c.filename, c.contentType, c.preview, got, c.wantPrefix)
			}
			if !strings.Contains(got, "filename*=UTF-8''") {
				t.Errorf("expected RFC 5987 filename*, got %q", got)
			}
		})
	}
}

func TestContentDispositionFor_NonASCIIEncodedBothWays(t *testing.T) {
	got := contentDispositionFor("отчёт.pdf", "application/pdf", true)
	// ASCII fallback should substitute underscores for each non-ASCII rune.
	if !strings.Contains(got, `filename="_____.pdf"`) {
		t.Errorf("ASCII fallback wrong: %q", got)
	}
	// RFC 5987 variant should percent-encode the original UTF-8 bytes.
	if !strings.Contains(got, "filename*=UTF-8''") {
		t.Errorf("missing RFC 5987 filename*: %q", got)
	}
}

func TestCanonicalContentType(t *testing.T) {
	cases := map[string]string{
		"application/pdf":                  "application/pdf",
		"Application/PDF":                  "application/pdf",
		" application/pdf ; charset=utf-8": "application/pdf",
		"":                                 "",
	}
	for in, want := range cases {
		got := canonicalContentType(in)
		if got != want {
			t.Errorf("canonicalContentType(%q) = %q, want %q", in, got, want)
		}
	}
}
