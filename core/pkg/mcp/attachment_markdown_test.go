package mcp

import "testing"

// The line handed to an agent must be exactly what the Hocuspocus parser
// lifts into an attachment card: label, space, byte count, canonical path.
func TestAttachmentCardMarkdown(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		size     int64
		want     string
	}{
		{"plain", "recon.txt", 2048, "[recon.txt 2048](/api/v1/wiki/files/id-1)"},
		{"zero bytes stays explicit", "empty.log", 0, "[empty.log 0](/api/v1/wiki/files/id-1)"},
		{"brackets escaped", "a[1].txt", 7, `[a\[1\].txt 7](/api/v1/wiki/files/id-1)`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := attachmentCardMarkdown("id-1", tt.filename, tt.size); got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}
