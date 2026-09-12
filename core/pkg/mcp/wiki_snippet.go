package mcp

import (
	"strings"
	"unicode/utf8"
)

// Match context for wiki search results.
//
// search_wiki used to return titles and metadata only. An agent looking for
// where a host was written up got five plausible titles back and had to fetch
// each page in full to find out which one actually mentioned it — four whole
// pages read and discarded, every time. The snippet answers that question in
// about two hundred bytes.
//
// The source is WikiDocument.Content, the sidecar's plain-text projection,
// NOT the rendered Markdown. Two reasons, and the first is the important one:
//
//   - It is already in the document that was just loaded, so a snippet costs
//     no I/O at all. Rendering Markdown means a sidecar round trip per hit,
//     which would make search dramatically more expensive than the reads it
//     is meant to save.
//   - It is the text the search actually matched against, so the snippet
//     shows why the page came back rather than a nearby approximation.
//
// The projection is degraded — headings flattened, inline marks as pseudo-tags
// — which is exactly why documentMarkdown refuses to use it as a page body.
// For showing a few words around a match that does not matter, and the agent
// is told in the field name that this is a snippet rather than content.

const (
	// snippetRadius is how much context to keep either side of the match.
	// Enough for the sentence around it; short enough that fifty hits stay
	// inside the response budget.
	snippetRadius = 90
	// snippetMax bounds a snippet when there is no match to centre on.
	snippetMax = 2 * snippetRadius
)

// buildSnippet returns the text around the first occurrence of `search` in
// `body`, collapsed to a single line.
//
// An empty result means there is nothing useful to show — the page matched on
// its title, or has no body. The field is omitempty, so the row simply has no
// snippet rather than an empty one that looks like a bug.
func buildSnippet(body, search string) string {
	flat := collapseWhitespace(body)
	if flat == "" {
		return ""
	}

	search = strings.TrimSpace(search)
	if search == "" {
		return clipRunes(flat, snippetMax)
	}

	idx := strings.Index(strings.ToLower(flat), strings.ToLower(search))
	if idx < 0 {
		// Matched on the title, or on a word the projection spells
		// differently. The opening of the page is still the most useful
		// thing to show.
		return clipRunes(flat, snippetMax)
	}

	start := idx - snippetRadius
	if start < 0 {
		start = 0
	}
	end := idx + len(search) + snippetRadius
	if end > len(flat) {
		end = len(flat)
	}

	// Land on rune boundaries — a snippet cut mid-character is invalid UTF-8
	// and the JSON encoder would replace it, which on Cyrillic notes turns
	// the first and last letters into noise.
	for start > 0 && !utf8.RuneStart(flat[start]) {
		start--
	}
	for end < len(flat) && !utf8.RuneStart(flat[end]) {
		end++
	}

	snippet := flat[start:end]
	if start > 0 {
		snippet = "…" + snippet
	}
	if end < len(flat) {
		snippet += "…"
	}
	return snippet
}

// collapseWhitespace folds every run of whitespace into one space.
//
// The projection carries the page's line structure, and a snippet spanning a
// table or a list would otherwise arrive as a column of fragments that reads
// as nonsense.
func collapseWhitespace(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// clipRunes truncates to at most n bytes on a rune boundary, adding an
// ellipsis when it cut.
func clipRunes(s string, n int) string {
	if len(s) <= n {
		return s
	}
	end := n
	for end > 0 && !utf8.RuneStart(s[end]) {
		end--
	}
	return s[:end] + "…"
}
