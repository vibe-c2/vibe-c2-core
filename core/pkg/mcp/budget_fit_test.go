package mcp

import (
	"strings"
	"testing"
)

// A page just over budget should lose the rows that do not fit, not half.
func TestFit_TrimsToTheLargestPageThatFits(t *testing.T) {
	row := strings.Repeat("x", 1000)
	items := make([]string, 70) // ~70 KB encoded, budget is 60 KB
	for i := range items {
		items[i] = row
	}
	result, err := fit(page[string]{Items: items})
	if err != nil {
		t.Fatal(err)
	}
	if result.Returned >= len(items) {
		t.Fatal("nothing was trimmed")
	}
	encoded, _ := encodeResult(result)
	if len(encoded) > MaxResponseBytes {
		t.Fatalf("result is %d bytes, over budget", len(encoded))
	}
	// One more row would not have fitted: this is the largest page, not the
	// first power-of-two fraction that happened to fit.
	oneMore := result
	oneMore.Items = items[:result.Returned+1]
	oneMore.Returned = result.Returned + 1
	if bigger, _ := encodeResult(oneMore); len(bigger) <= MaxResponseBytes {
		t.Fatalf("returned %d rows but %d would still fit", result.Returned, result.Returned+1)
	}
	if len(result.Notes) != 1 || !strings.Contains(result.Notes[0], "Truncated") {
		t.Fatalf("truncation not reported: %v", result.Notes)
	}
}
