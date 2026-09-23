package mcp

import (
	"strings"
	"testing"
	"unicode/utf8"
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

	encoded, err := encodeResult(got)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if len(encoded) > MaxResponseBytes {
		t.Fatalf("fitted page is %d bytes, over the %d budget", len(encoded), MaxResponseBytes)
	}
}

// A document longer than the budget is cut at a line break and reports how many
// bytes it showed — the offset a continued read resumes from. The prefix is a
// real prefix of the input (the truncation notice is composed by the caller, so
// a continued read can slice cleanly at the reported offset), never over the cap
// and never split across a rune.
func TestTruncateBody(t *testing.T) {
	short := "# Notes\n\nnothing much here"
	if body, truncated, n := truncateBody(short); truncated || body != short || n != len(short) {
		t.Fatalf("short body was altered: truncated=%v n=%d", truncated, n)
	}

	long := strings.Repeat("a line of engagement notes\n", 4000)
	body, truncated, n := truncateBody(long)
	if !truncated {
		t.Fatal("oversized body was not truncated")
	}
	if n != len(body) {
		t.Fatalf("reported %d bytes shown but returned %d", n, len(body))
	}
	if body != long[:n] {
		t.Fatal("the shown text is not a prefix of the input, so a continued read would not line up")
	}
	if len(body) > maxWikiBodyBytes {
		t.Fatalf("truncated body is %d bytes, over the %d cap", len(body), maxWikiBodyBytes)
	}

	// A multibyte rune straddling the cap must not be split — a continued read
	// resuming at the reported offset would otherwise start mid-character.
	wide := strings.Repeat("€", 20000) // 3 bytes each, 60000 bytes total
	wb, wtrunc, wn := truncateBody(wide)
	if !wtrunc {
		t.Fatal("oversized multibyte body was not truncated")
	}
	if !utf8.ValidString(wb) {
		t.Fatal("truncation split a rune")
	}
	if wn != len(wb) || wb != wide[:wn] {
		t.Fatalf("multibyte prefix does not line up: n=%d len=%d", wn, len(wb))
	}
}

// Regression: the budget must be measured with the encoder that actually
// serializes the response.
//
// It was not, once. fit measured compact JSON while the dispatcher sent
// indented, so a page trimmed to "just under 60KB" went out at roughly 80KB —
// caught only by running a real 948-page wiki through it. Asserting the two
// agree keeps a future encoding change from silently reopening the gap.
func TestFit_MeasuresWhatTheDispatcherSends(t *testing.T) {
	items := make([]string, 400)
	for i := range items {
		items[i] = strings.Repeat("z", 400)
	}

	got, err := fit(page[string]{Items: items})
	if err != nil {
		t.Fatalf("fit: %v", err)
	}

	// Exactly what dispatch.go writes to the wire.
	onTheWire, err := encodeResult(got)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if len(onTheWire) > MaxResponseBytes {
		t.Fatalf("the response the dispatcher would send is %d bytes, over the %d budget "+
			"fit trimmed to — the two encoders have drifted apart",
			len(onTheWire), MaxResponseBytes)
	}
}
