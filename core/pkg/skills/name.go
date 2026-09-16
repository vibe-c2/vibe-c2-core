// Package skills holds the rules a community skill name obeys, and the errors
// publishing one can fail with.
//
// A leaf package because four callers need the same answer: the REST handler
// an operator uploads through, the agent endpoint, the GraphQL resolver, and
// the download path that looks a name up. A helper living in any one of them
// would be copied into the others and then drift, and a name that normalizes
// differently in two places is a name two people can both claim.
package skills

import (
	"fmt"
	"strings"
	"unicode"
)

const (
	// MinNameLength stops single characters, which are impossible to search
	// for and trivial to squat.
	MinNameLength = 2
	// MaxNameLength keeps a name inside a filename, a URL path segment and a
	// UI card without wrapping.
	MaxNameLength = 64

	// MaxDescriptionLength is what fits a listing row. Longer belongs in the
	// bundle's own documentation, which is what the reader is downloading.
	MaxDescriptionLength = 280
	// MaxNotesLength is the one-line "what changed" shown in the update
	// prompt. A paragraph there is not read.
	MaxNotesLength = 280
)

// reservedPrefix keeps community skills from impersonating the generated one.
// Prefix rather than an exact match: "vibe-c2-recon" reads to an operator as
// something the developers publish and support, and that impression is the
// thing worth protecting, not the exact string.
const reservedPrefix = "vibe-c2"

// NormalizeName lowercases, trims, and collapses a proposed name into the
// canonical slug, then checks it against the rules.
//
// Normalizing rather than rejecting near-misses is deliberate: somebody typing
// "Recon Sweep" means the same skill as "recon-sweep", and refusing them
// teaches nothing. What is refused is a name that cannot be made to fit, or
// one that would pass for a built-in.
func NormalizeName(raw string) (string, error) {
	var b strings.Builder
	lastDash := true // leading dashes are dropped
	for _, r := range strings.TrimSpace(strings.ToLower(raw)) {
		switch {
		case r >= 'a' && r <= 'z', unicode.IsDigit(r):
			b.WriteRune(r)
			lastDash = false
		case r == '-' || r == '_' || r == ' ' || r == '.':
			// One separator, whatever was typed, and never doubled.
			if !lastDash {
				b.WriteRune('-')
				lastDash = true
			}
		default:
			// Anything else is dropped rather than mapped: transliterating
			// would invent names their author would not recognize.
		}
	}
	name := strings.TrimRight(b.String(), "-")

	if len(name) < MinNameLength {
		return "", fmt.Errorf("%q is not a usable skill name: it needs at least %d letters or digits", raw, MinNameLength)
	}
	if len(name) > MaxNameLength {
		return "", fmt.Errorf("%q is too long: a skill name is at most %d characters", raw, MaxNameLength)
	}
	if IsReserved(name) {
		return "", fmt.Errorf("%q is reserved: names starting with %q belong to the built-in skill", name, reservedPrefix)
	}
	return name, nil
}

// IsReserved reports whether a normalized name is one nobody may claim.
func IsReserved(name string) bool {
	return name == reservedPrefix || strings.HasPrefix(name, reservedPrefix+"-")
}

// TrimText normalizes a description or a release note: collapses whitespace so
// a pasted multi-line blob does not break a listing row, and caps the length.
// Over-long input is cut rather than refused, because losing an upload over a
// long description helps nobody.
func TrimText(raw string, max int) string {
	text := strings.Join(strings.Fields(raw), " ")
	if len(text) <= max {
		return text
	}
	// Cut on a rune boundary so the result is still valid UTF-8.
	cut := max
	for cut > 0 && !isBoundary(text, cut) {
		cut--
	}
	return strings.TrimSpace(text[:cut]) + "…"
}

func isBoundary(s string, i int) bool {
	if i >= len(s) {
		return true
	}
	return s[i]&0xC0 != 0x80
}
