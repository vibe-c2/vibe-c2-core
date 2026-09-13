package mcp

import (
	"strings"
	"testing"
)

// A big page with headings answers a default read with its outline; the body
// is only sent on request. Sending 40 KB and then suggesting the cheaper read
// charged the agent for the advice.
func TestOutlineByDefault(t *testing.T) {
	big := "# Top\n\n" + strings.Repeat("words words words\n", 600) + "\n## Second\n\nmore\n"
	if len(big) <= outlineHintBytes {
		t.Fatalf("fixture is only %d bytes", len(big))
	}
	small := "# Top\n\nshort\n"
	bigNoHeadings := strings.Repeat("words words words\n", 600)

	cases := []struct {
		name string
		args getWikiDocumentArgs
		md   string
		want bool
	}{
		{"large page with headings", getWikiDocumentArgs{}, big, true},
		{"large page, full requested", getWikiDocumentArgs{Full: true}, big, false},
		{"large page, section requested", getWikiDocumentArgs{Section: "Second"}, big, false},
		{"large page, outline requested", getWikiDocumentArgs{Outline: true}, big, false},
		{"small page", getWikiDocumentArgs{}, small, false},
		{"large page without headings", getWikiDocumentArgs{}, bigNoHeadings, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := outlineByDefault(tc.args, tc.md); got != tc.want {
				t.Fatalf("outlineByDefault = %v, want %v", got, tc.want)
			}
		})
	}
}
