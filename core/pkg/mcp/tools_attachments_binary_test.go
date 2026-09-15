package mcp

import (
	"bytes"
	"testing"
)

// The payload decoder accepts what an agent's tooling produces: plain base64,
// a data: URL, wrapped lines, URL-safe alphabet, missing padding.
func TestDecodeBase64Payload(t *testing.T) {
	want := []byte("\x89PNG\r\n\x1a\nhello")
	tests := []struct {
		name string
		in   string
	}{
		{"standard", "iVBORw0KGgpoZWxsbw=="},
		{"no padding", "iVBORw0KGgpoZWxsbw"},
		{"data url", "data:image/png;base64,iVBORw0KGgpoZWxsbw=="},
		{"wrapped lines", "iVBORw0K\nGgpoZWxs\nbw==\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := decodeBase64Payload(tt.in)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !bytes.Equal(got, want) {
				t.Fatalf("got %q, want %q", got, want)
			}
		})
	}

	for _, bad := range []string{"", "   ", "data:image/png;base64,", "not*base64!"} {
		if _, err := decodeBase64Payload(bad); err == nil {
			t.Errorf("%q: expected an error", bad)
		}
	}
}

// The image line carries the size hint the parser turns into width/height,
// and survives brackets in the filename.
func TestInlineImageMarkdown(t *testing.T) {
	got := inlineImageMarkdown("login[1].png", "/api/v1/wiki/images/id-1", 1280, 720)
	want := `![login\[1\].png](/api/v1/wiki/images/id-1 " =1280x720")`
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
	if got := inlineImageMarkdown("a.png", "/u", 0, 0); got != "![a.png](/u)" {
		t.Fatalf("no-size form got %q", got)
	}
}
