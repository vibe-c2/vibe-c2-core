package repository

import (
	"strings"
	"testing"
)

func TestExtractSnippet(t *testing.T) {
	// A long Markdown body so we hit the windowing path.
	longBody := strings.Repeat("lorem ipsum dolor sit amet. ", 20) +
		"The quick brown fox jumps over the lazy dog. " +
		strings.Repeat("consectetur adipiscing elit. ", 20)

	cases := []struct {
		name            string
		content         string
		query           string
		wantContains    string // snippet must contain this substring
		wantRangesCount int
	}{
		{
			name:            "empty content returns empty",
			content:         "",
			query:           "anything",
			wantContains:    "",
			wantRangesCount: 0,
		},
		{
			name:            "no match returns leading excerpt",
			content:         "just some unrelated text here",
			query:           "zzzyxq",
			wantContains:    "just some unrelated",
			wantRangesCount: 0,
		},
		{
			name:            "match at start of body",
			content:         "Hello world, this is the doc",
			query:           "Hello",
			wantContains:    "Hello world",
			wantRangesCount: 1,
		},
		{
			name:            "case insensitive match",
			content:         "Hello world",
			query:           "HELLO",
			wantContains:    "Hello world",
			wantRangesCount: 1,
		},
		{
			name:            "match in middle windows context around it",
			content:         longBody,
			query:           "fox",
			wantContains:    "fox",
			wantRangesCount: 1,
		},
		{
			name:            "multi-token query finds both",
			content:         "The quick brown fox jumps over the lazy dog",
			query:           "quick lazy",
			wantContains:    "quick",
			wantRangesCount: 2,
		},
		{
			name:            "whitespace-only query is no-op",
			content:         "Hello world",
			query:           "   ",
			wantContains:    "Hello world",
			wantRangesCount: 0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			snippet, ranges := extractSnippet(tc.content, tc.query)
			if tc.wantContains != "" && !strings.Contains(strings.ToLower(snippet), strings.ToLower(tc.wantContains)) {
				t.Fatalf("snippet %q missing expected substring %q", snippet, tc.wantContains)
			}
			if len(ranges) != tc.wantRangesCount {
				t.Fatalf("range count = %d, want %d (snippet=%q ranges=%v)", len(ranges), tc.wantRangesCount, snippet, ranges)
			}
			// Ranges must be within snippet bounds and non-overlapping-or-adjacent.
			snipRunes := []rune(snippet)
			for _, r := range ranges {
				if r[0] < 0 || r[1] > len(snipRunes) || r[0] >= r[1] {
					t.Fatalf("range %v invalid for snippet %q (len=%d)", r, snippet, len(snipRunes))
				}
			}
		})
	}
}

// TestExtractSnippet_RuneSafeEmoji proves we never split a multi-byte UTF-8
// character — a regression would render mojibake in the UI for any title
// containing emoji (the wiki supports them).
func TestExtractSnippet_RuneSafeEmoji(t *testing.T) {
	// Content where the match is preceded by emoji, so byte-slicing would
	// corrupt the UTF-8 boundary around 🦊.
	content := strings.Repeat("🦊 ", 40) + "needle " + strings.Repeat("🦊 ", 40)
	snippet, ranges := extractSnippet(content, "needle")

	if !strings.Contains(snippet, "needle") {
		t.Fatalf("snippet missing the matched token: %q", snippet)
	}
	if !strings.Contains(snippet, "🦊") {
		t.Fatalf("snippet lost surrounding emoji context: %q", snippet)
	}
	if len(ranges) != 1 {
		t.Fatalf("expected 1 highlight range, got %d", len(ranges))
	}

	// The range must land on "needle" in the snippet, rune-addressed.
	snipRunes := []rune(snippet)
	matched := string(snipRunes[ranges[0][0]:ranges[0][1]])
	if strings.ToLower(matched) != "needle" {
		t.Fatalf("range %v does not wrap 'needle', got %q", ranges[0], matched)
	}
}

func TestRuneIndex(t *testing.T) {
	cases := []struct {
		hay, needle string
		want        int
	}{
		{"hello world", "world", 6},
		{"héllo wörld", "wörld", 6},
		{"abc", "abcd", -1},
		{"", "x", -1},
		{"x", "", 0},
		{"🦊🦊🦊needle🦊", "needle", 3},
	}
	for _, tc := range cases {
		got := runeIndex([]rune(tc.hay), []rune(tc.needle))
		if got != tc.want {
			t.Fatalf("runeIndex(%q, %q) = %d, want %d", tc.hay, tc.needle, got, tc.want)
		}
	}
}
