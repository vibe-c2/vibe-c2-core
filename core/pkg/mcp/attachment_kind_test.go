package mcp

import (
	"strings"
	"testing"
)

// Content type is the weaker signal: IngestFile prefers what the client
// declared and only sniffs when it is empty, so real attachments in this
// platform arrive as application/octet-stream. Several .vsdx diagrams already
// do. The extension has to win for the kinds it names unambiguously.
func TestAttachmentKind(t *testing.T) {
	cases := []struct {
		name        string
		filename    string
		contentType string
		want        attachmentKindName
	}{
		{"plain text", "ldap_dump.txt", "text/plain", attachmentText},
		{"csv", "adidnsdump.csv", "text/csv", attachmentCSV},
		{"markdown", "notes.md", "text/markdown", attachmentMarkdown},
		{"json", "hosts.json", "application/json", attachmentJSON},
		{"docx", "scope.docx", docxContentType, attachmentOffice},
		{"xlsx", "accounts.xlsx", xlsxContentType, attachmentOffice},
		{"png", "console.png", "image/png", attachmentImage},

		{
			// The case this platform actually produces.
			name: "docx declared as octet-stream", filename: "scope.docx",
			contentType: "application/octet-stream", want: attachmentOffice,
		},
		{
			name: "image declared as octet-stream", filename: "diagram.png",
			contentType: "application/octet-stream", want: attachmentImage,
		},
		{
			name: "csv with no content type", filename: "export.csv",
			contentType: "", want: attachmentCSV,
		},
		{
			// No extension to fall back on, so the type has to carry it.
			name: "no extension, honest content type", filename: "krb5cc_545620144",
			contentType: "text/plain", want: attachmentText,
		},
		{
			name: "no extension, no type", filename: "krb5cc_545620144",
			contentType: "application/octet-stream", want: attachmentUnsupported,
		},

		{"pdf is not readable", "report-3.pdf", "application/pdf", attachmentUnsupported},
		{"visio is not readable", "schema.vsdx", "application/octet-stream", attachmentUnsupported},
		{
			// Scriptable, not a raster — the file controller excludes it from
			// inline rendering for the same reason.
			name: "svg is not an image here", filename: "logo.svg",
			contentType: "image/svg+xml", want: attachmentUnsupported,
		},
		{
			name: "content type with parameters", filename: "notes",
			contentType: "text/plain; charset=utf-8", want: attachmentText,
		},
		{
			name: "uppercase extension", filename: "SCOPE.DOCX",
			contentType: "", want: attachmentOffice,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := attachmentKind(tc.filename, tc.contentType); got != tc.want {
				t.Fatalf("attachmentKind(%q, %q) = %q, want %q",
					tc.filename, tc.contentType, got, tc.want)
			}
		})
	}
}

func TestExtensionOf(t *testing.T) {
	cases := map[string]string{
		"scope.docx":       "docx",
		"archive.tar.gz":   "gz",
		"krb5cc_545620144": "",
		"trailing.":        "",
		".bashrc":          "bashrc",
		"":                 "",
	}
	for in, want := range cases {
		if got := extensionOf(in); got != want {
			t.Errorf("extensionOf(%q) = %q, want %q", in, got, want)
		}
	}
}

// Truncation must not split a rune. Cutting mid-character would put a
// replacement glyph at the end of every truncated file, and these attachments
// are routinely non-ASCII — half the ones in this deployment have Cyrillic
// filenames and contents.
func TestTruncateUTF8(t *testing.T) {
	t.Run("leaves short strings alone", func(t *testing.T) {
		if got := truncateUTF8("short", 100); got != "short" {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("never splits a rune", func(t *testing.T) {
		s := strings.Repeat("Схема", 100) // 2 bytes per rune
		for limit := 1; limit <= 40; limit++ {
			got := truncateUTF8(s, limit)
			if len(got) > limit {
				t.Fatalf("limit %d: got %d bytes", limit, len(got))
			}
			if !isValidUTF8(got) {
				t.Fatalf("limit %d produced invalid UTF-8: %q", limit, got)
			}
		}
	})
}

func isValidUTF8(s string) bool {
	for _, r := range s {
		if r == '�' {
			return false
		}
	}
	return true
}
