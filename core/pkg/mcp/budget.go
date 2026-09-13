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

// encodeResult is the single encoder for every tool response.
//
// It has to be the same one fit measures with. It previously was not — fit
// measured compact JSON while the dispatcher sent indented — so a fitted page
// went out about a third larger than the budget it had just been trimmed to.
// Sharing one function is what stops that drifting apart again.
//
// Compact rather than indented: whitespace is pure token cost to a model, and
// nothing reads these by eye.
func encodeResult(v any) ([]byte, error) {
	return json.Marshal(v)
}

// fit trims a page until its encoded form is within MaxResponseBytes, and says
// what it dropped.
//
// Halving finds a size that fits in O(log n) encodes; a binary search between
// the last failing and first passing sizes then recovers the rows the halving
// threw away — a page one row over budget used to lose half its rows.
func fit[T any](p page[T]) (page[T], error) {
	original := len(p.Items)
	fits := func(n int) (bool, error) {
		trial := p
		trial.Items = p.Items[:n]
		encoded, err := encodeResult(trial)
		if err != nil {
			return false, fmt.Errorf("failed to encode result: %w", err)
		}
		return len(encoded) <= MaxResponseBytes, nil
	}

	ok, err := fits(original)
	if err != nil {
		return p, err
	}
	if !ok {
		lo, hi := 0, original // lo fits (empty always does), hi does not
		for n := original / 2; n > 0; n /= 2 {
			ok, err := fits(n)
			if err != nil {
				return p, err
			}
			if ok {
				lo = n
				break
			}
			hi = n
		}
		for hi-lo > 1 {
			mid := (lo + hi) / 2
			ok, err := fits(mid)
			if err != nil {
				return p, err
			}
			if ok {
				lo = mid
			} else {
				hi = mid
			}
		}
		p.Items = p.Items[:lo]
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
