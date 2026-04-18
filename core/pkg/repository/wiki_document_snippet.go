package repository

import (
	"strings"
	"unicode"
)

// snippetContextRunes is how many characters of context to include before and
// after the first match. Tuned for a 2-3 line excerpt in a palette result.
const snippetContextRunes = 80

// snippetFallbackRunes is the length of the fallback snippet when no match
// exists in content (title-only hits from $text and all prefix hits).
const snippetFallbackRunes = 160

// extractSnippet returns a short excerpt of content around the first query-token
// match, along with rune-offset match ranges the frontend uses for <mark>
// highlighting. All operations are rune-safe so UTF-8 content (emoji, CJK,
// etc.) is not corrupted.
//
// If content is empty or no token matches, we return a leading excerpt and
// empty ranges. The caller decides whether to display "no preview" instead.
func extractSnippet(content, query string) (string, [][2]int) {
	if content == "" {
		return "", nil
	}

	contentRunes := []rune(content)
	tokens := searchTokens(query)

	if len(tokens) == 0 {
		return runeSliceCollapsed(contentRunes, 0, snippetFallbackRunes), nil
	}

	// Lowercase the content once for case-insensitive matching.
	lowerContent := strings.ToLower(string(contentRunes))
	lowerRunes := []rune(lowerContent)

	// Find the earliest match across all tokens. Each token match gives us a
	// (runeStart, runeLen) pair.
	earliestStart := -1
	for _, tok := range tokens {
		if idx := runeIndex(lowerRunes, []rune(tok)); idx >= 0 {
			if earliestStart == -1 || idx < earliestStart {
				earliestStart = idx
			}
		}
	}

	if earliestStart == -1 {
		// No token matched in content — fall back to leading excerpt, no ranges.
		return runeSliceCollapsed(contentRunes, 0, snippetFallbackRunes), nil
	}

	// Window around the first match, clamped to content bounds.
	windowStart := earliestStart - snippetContextRunes
	if windowStart < 0 {
		windowStart = 0
	}
	windowEnd := earliestStart + snippetContextRunes
	if windowEnd > len(contentRunes) {
		windowEnd = len(contentRunes)
	}

	snippetRunes := contentRunes[windowStart:windowEnd]
	lowerWindow := lowerRunes[windowStart:windowEnd]

	// Collect every token match within the window for highlighting.
	var ranges [][2]int
	for _, tok := range tokens {
		tokRunes := []rune(tok)
		if len(tokRunes) == 0 {
			continue
		}
		searchFrom := 0
		for {
			idx := runeIndex(lowerWindow[searchFrom:], tokRunes)
			if idx < 0 {
				break
			}
			absStart := searchFrom + idx
			absEnd := absStart + len(tokRunes)
			ranges = append(ranges, [2]int{absStart, absEnd})
			searchFrom = absEnd
		}
	}

	snippet := collapseWhitespace(string(snippetRunes))
	// If collapse changed length, ranges no longer align — re-derive by
	// re-scanning the collapsed snippet. This keeps ranges trustworthy even
	// when Markdown contained stacked blank lines.
	if len(snippet) != len([]rune(snippet)) || len(snippet) != len(snippetRunes) {
		ranges = findRangesInSnippet(snippet, tokens)
	}

	// Add ellipses so the user sees the excerpt is truncated. These shift rune
	// offsets by 1 on the left; adjust ranges accordingly.
	hasLeftEllipsis := windowStart > 0
	hasRightEllipsis := windowEnd < len(contentRunes)

	var b strings.Builder
	if hasLeftEllipsis {
		b.WriteString("…")
	}
	b.WriteString(snippet)
	if hasRightEllipsis {
		b.WriteString("…")
	}
	result := b.String()

	if hasLeftEllipsis {
		for i := range ranges {
			ranges[i][0]++
			ranges[i][1]++
		}
	}

	return result, ranges
}

// searchTokens splits a raw query into whitespace-separated, lowercased tokens.
// Empty tokens are dropped. Mirrors what MongoDB $text (language "none")
// effectively does.
func searchTokens(query string) []string {
	fields := strings.Fields(strings.ToLower(query))
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		if f != "" {
			out = append(out, f)
		}
	}
	return out
}

// runeIndex returns the rune-offset (not byte-offset) of needle in haystack,
// or -1 if absent. Both inputs must be lowercase for case-insensitive match.
func runeIndex(haystack, needle []rune) int {
	if len(needle) == 0 {
		return 0
	}
	if len(needle) > len(haystack) {
		return -1
	}
	for i := 0; i <= len(haystack)-len(needle); i++ {
		match := true
		for j := 0; j < len(needle); j++ {
			if haystack[i+j] != needle[j] {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}

// runeSliceCollapsed returns a whitespace-collapsed rune slice from start to
// start+n (or end of runes). Safe for UTF-8 boundaries.
func runeSliceCollapsed(runes []rune, start, n int) string {
	if start >= len(runes) {
		return ""
	}
	end := start + n
	if end > len(runes) {
		end = len(runes)
	}
	s := collapseWhitespace(string(runes[start:end]))
	if end < len(runes) {
		s += "…"
	}
	return s
}

// collapseWhitespace reduces runs of whitespace to a single space. Markdown
// content often has stacked newlines that look terrible in a single-line
// snippet cell.
func collapseWhitespace(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	lastSpace := false
	for _, r := range s {
		if unicode.IsSpace(r) {
			if !lastSpace {
				b.WriteByte(' ')
				lastSpace = true
			}
			continue
		}
		b.WriteRune(r)
		lastSpace = false
	}
	return strings.TrimSpace(b.String())
}

// findRangesInSnippet re-scans the (already-collapsed) snippet for each token,
// used when whitespace collapse invalidated rune offsets from the source.
func findRangesInSnippet(snippet string, tokens []string) [][2]int {
	lower := []rune(strings.ToLower(snippet))
	var ranges [][2]int
	for _, tok := range tokens {
		needle := []rune(tok)
		if len(needle) == 0 {
			continue
		}
		searchFrom := 0
		for {
			idx := runeIndex(lower[searchFrom:], needle)
			if idx < 0 {
				break
			}
			absStart := searchFrom + idx
			absEnd := absStart + len(needle)
			ranges = append(ranges, [2]int{absStart, absEnd})
			searchFrom = absEnd
		}
	}
	return ranges
}
