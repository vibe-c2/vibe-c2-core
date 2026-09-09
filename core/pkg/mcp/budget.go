package mcp

import (
	"encoding/json"
	"fmt"
)

// Response budget.
//
// Findings and topology payloads in a real engagement are large enough to end
// a conversation on the first tool call. Every list tool therefore caps its
// page, and every response is measured before it is returned.
//
// When something is cut the agent is told so explicitly. A silently truncated
// result is worse than a large one: the model reasons confidently over a
// partial picture and has no way to know it should narrow the filter.
const (
	// DefaultPageSize is what a list tool returns when the caller does not
	// ask for a size.
	DefaultPageSize = 25
	// MaxPageSize is the ceiling regardless of what the caller asks for.
	MaxPageSize = 50
	// MaxResponseBytes bounds the encoded payload of a single tool result.
	MaxResponseBytes = 60 * 1024
)

// clampPageSize normalizes a caller-supplied limit.
func clampPageSize(requested int) int {
	if requested <= 0 {
		return DefaultPageSize
	}
	if requested > MaxPageSize {
		return MaxPageSize
	}
	return requested
}

// page is the envelope every list tool returns. Notes is where truncation and
// other "you are not seeing everything" facts are surfaced, in prose, because
// that is what the model actually reads.
type page[T any] struct {
	Items      []T      `json:"items"`
	Returned   int      `json:"returned"`
	NextCursor string   `json:"nextCursor,omitempty"`
	Notes      []string `json:"notes,omitempty"`
}

// fit trims a page until its encoded form is within MaxResponseBytes, and says
// what it dropped. Halving rather than trimming one at a time keeps this
// O(log n) encodes on a pathological row rather than O(n).
func fit[T any](p page[T]) (page[T], error) {
	original := len(p.Items)

	for {
		encoded, err := json.Marshal(p)
		if err != nil {
			return p, fmt.Errorf("failed to encode result: %w", err)
		}
		if len(encoded) <= MaxResponseBytes || len(p.Items) == 0 {
			break
		}
		p.Items = p.Items[:len(p.Items)/2]
	}

	if len(p.Items) < original {
		p.Notes = append(p.Notes, fmt.Sprintf(
			"Truncated to fit the response budget: %d of %d results shown. Narrow the filter or page with the cursor.",
			len(p.Items), original))
	}
	p.Returned = len(p.Items)
	return p, nil
}

// newPage builds and fits a page in one step.
func newPage[T any](items []T, nextCursor string, notes ...string) (page[T], error) {
	return fit(page[T]{Items: items, NextCursor: nextCursor, Notes: notes})
}

// marshalPage encodes a page the same way fit measures it. Exists so tests can
// assert the actual on-the-wire size rather than approximating it.
func marshalPage[T any](p page[T]) ([]byte, error) {
	return json.Marshal(p)
}
