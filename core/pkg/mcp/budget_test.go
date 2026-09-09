package mcp

import (
	"strings"
	"testing"
)

func TestClampPageSize(t *testing.T) {
	cases := []struct {
		name      string
		requested int
		want      int
	}{
		{"unset falls back to the default", 0, DefaultPageSize},
		{"negative falls back to the default", -5, DefaultPageSize},
		{"in range is honoured", 10, 10},
		{"at the ceiling is honoured", MaxPageSize, MaxPageSize},
		{"above the ceiling is clamped", 5000, MaxPageSize},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := clampPageSize(tc.requested); got != tc.want {
				t.Fatalf("clampPageSize(%d) = %d, want %d", tc.requested, got, tc.want)
			}
		})
	}
}

// A page that fits must come back untouched — the budget is a guard rail, not
// a tax on ordinary results.
func TestFit_LeavesSmallPagesAlone(t *testing.T) {
	items := []string{"alpha", "beta", "gamma"}

	got, err := fit(page[string]{Items: items})
	if err != nil {
		t.Fatalf("fit: %v", err)
	}
	if len(got.Items) != len(items) {
		t.Fatalf("dropped items from a page that fits: %d of %d", len(got.Items), len(items))
	}
	if len(got.Notes) != 0 {
		t.Fatalf("added a truncation note to a page that fits: %v", got.Notes)
	}
	if got.Returned != len(items) {
		t.Fatalf("Returned = %d, want %d", got.Returned, len(items))
	}
}

// An oversized page must be cut AND must say so. Silent truncation is the
// failure mode worth guarding: the model reasons confidently over a partial
// picture with no signal that it should narrow the filter.
func TestFit_TruncatesAndSaysSo(t *testing.T) {
	// 200 rows of ~1KB each, comfortably past MaxResponseBytes.
	items := make([]string, 200)
	for i := range items {
		items[i] = strings.Repeat("x", 1024)
	}

	got, err := fit(page[string]{Items: items})
	if err != nil {
		t.Fatalf("fit: %v", err)
	}

	if len(got.Items) >= len(items) {
		t.Fatalf("oversized page was not truncated: %d items", len(got.Items))
	}
	if len(got.Items) == 0 {
		t.Fatal("truncated the page to nothing; some results should survive")
	}
	if got.Returned != len(got.Items) {
		t.Fatalf("Returned = %d but %d items present", got.Returned, len(got.Items))
	}
	if len(got.Notes) == 0 || !strings.Contains(got.Notes[0], "Truncated") {
		t.Fatalf("truncated silently; notes = %v", got.Notes)
	}
}

// The whole point of the cap is a bounded payload, so assert the actual size.
func TestFit_RespectsTheByteBudget(t *testing.T) {
	items := make([]string, 500)
	for i := range items {
		items[i] = strings.Repeat("y", 512)
	}

	got, err := fit(page[string]{Items: items})
	if err != nil {
		t.Fatalf("fit: %v", err)
	}

	encoded, err := marshalPage(got)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if len(encoded) > MaxResponseBytes {
		t.Fatalf("fitted page is %d bytes, over the %d budget", len(encoded), MaxResponseBytes)
	}
}

// A document longer than the budget is cut, flagged, and cut at a line break
// so the agent reads whole paragraphs rather than a severed sentence.
func TestTruncateBody(t *testing.T) {
	short := "# Notes\n\nnothing much here"
	if body, truncated := truncateBody(short); truncated || body != short {
		t.Fatalf("short body was altered: truncated=%v", truncated)
	}

	long := strings.Repeat("a line of engagement notes\n", 4000)
	body, truncated := truncateBody(long)
	if !truncated {
		t.Fatal("oversized body was not truncated")
	}
	if !strings.Contains(body, "truncated") {
		t.Fatalf("truncated body does not say so: %q", body[len(body)-80:])
	}
	if len(body) > maxWikiBodyBytes+128 {
		t.Fatalf("truncated body is %d bytes, over the %d limit", len(body), maxWikiBodyBytes)
	}
}
