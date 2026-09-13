package mcp

import (
	"strings"
)

// Reading part of a page instead of all of it.
//
// get_wiki_document always returned the whole body. On a large recon page that
// is thousands of tokens spent to look at one table, and it happened on every
// pass: an agent that wants to change three rows reads the page, edits, reads
// it again to check, and pays full price each time.
//
// The obvious fix — a byte range — is the wrong shape for a model. It cannot
// know which offset it wants without having already read the page, so ranges
// turn one expensive call into several cheap ones plus a guess. Headings are
// the unit an agent actually reasons in ("the Hosts section"), so that is the
// unit offered: an outline to see how a page is organized, and a section fetch
// to pull one part of it.
//
// This is a reader, never a writer. A section that comes back slightly wrong
// costs the agent a confusing paragraph; it cannot damage a page, because
// every write still goes through the exact-match path in
// edit_wiki_document. That is what makes the simplifications below acceptable.

// outlineEntry is one heading and the size of everything under it.
type outlineEntry struct {
	Heading string `json:"heading"`
	Level   int    `json:"level"`
	// Bytes covers the heading and its whole subtree — the same text a
	// `section` fetch of this heading would return — so the number answers
	// the question the agent is actually asking: is it worth fetching?
	//
	// It follows that nested sections are counted inside their parent and the
	// figures do not sum to the page size. That is the tree being a tree.
	Bytes int `json:"bytes"`
}

// headingSpan is one parsed heading, with where its subtree starts and ends.
type headingSpan struct {
	title string
	level int
	start int // byte offset of the heading line
	end   int // byte offset just past the subtree
}

// hasHeadings reports whether an outline of this page would have any entries.
func hasHeadings(markdown string) bool {
	return len(parseHeadings(markdown)) > 0
}

// parseHeadings finds every ATX heading outside a fenced code block.
//
// Setext headings (underlined with === or ---) are not recognised. The editor
// does not produce them — the serializer emits ATX for every heading level —
// so supporting them would be code that never runs on real pages.
//
// Container directives (`:::checklist`, `:::warning`) are deliberately NOT
// tracked as nesting. A heading inside one would be treated as a section
// boundary and could slice a container in half. That is tolerable precisely
// because this path only reads: the worst case is an odd-looking fragment,
// and if the agent then uses that fragment as `old_text` it either matches
// exactly or the edit is refused. Neither outcome damages the page.
func parseHeadings(markdown string) []headingSpan {
	lines := strings.Split(markdown, "\n")

	var spans []headingSpan
	offset := 0
	fence := ""

	for _, line := range lines {
		start := offset
		offset += len(line) + 1 // the \n Split consumed

		if fence != "" {
			if strings.HasPrefix(strings.TrimLeft(line, " "), fence) {
				fence = ""
			}
			continue
		}
		if open := fenceOpener(line); open != "" {
			fence = open
			continue
		}
		if level, title := headingLevel(line); level > 0 {
			spans = append(spans, headingSpan{title: title, level: level, start: start})
		}
	}

	// A section runs until the next heading at the same level or shallower;
	// anything deeper is nested inside it.
	for i := range spans {
		spans[i].end = len(markdown)
		for j := i + 1; j < len(spans); j++ {
			if spans[j].level <= spans[i].level {
				spans[i].end = spans[j].start
				break
			}
		}
	}
	return spans
}

// fenceOpener reports the delimiter opening a fenced code block, or "".
func fenceOpener(line string) string {
	trimmed := strings.TrimLeft(line, " ")
	if len(line)-len(trimmed) > 3 {
		return "" // four spaces in is an indented code block, not a fence
	}
	for _, marker := range []string{"```", "~~~"} {
		if strings.HasPrefix(trimmed, marker) {
			return marker
		}
	}
	return ""
}

// headingLevel reports a line's ATX heading level and title, or 0 and "".
func headingLevel(line string) (int, string) {
	trimmed := strings.TrimLeft(line, " ")
	if len(line)-len(trimmed) > 3 {
		return 0, ""
	}

	level := 0
	for level < len(trimmed) && trimmed[level] == '#' {
		level++
	}
	if level == 0 || level > 6 {
		return 0, ""
	}

	rest := trimmed[level:]
	// `#foo` is a tag, not a heading — CommonMark requires the space.
	if rest != "" && !strings.HasPrefix(rest, " ") && !strings.HasPrefix(rest, "\t") {
		return 0, ""
	}
	return level, trimHeadingText(rest)
}

// trimHeadingText strips the optional closing sequence from a heading.
//
// `## Recon ##` and `## Recon` are the same heading. `## C#` is not: a closing
// sequence has to be preceded by whitespace, which is what keeps a title
// legitimately ending in # intact.
func trimHeadingText(rest string) string {
	title := strings.TrimSpace(rest)
	end := len(title)
	for end > 0 && title[end-1] == '#' {
		end--
	}
	if end < len(title) && end > 0 && (title[end-1] == ' ' || title[end-1] == '\t') {
		title = strings.TrimSpace(title[:end])
	}
	return title
}

// buildOutline renders a page's heading structure.
func buildOutline(markdown string) []outlineEntry {
	spans := parseHeadings(markdown)
	entries := make([]outlineEntry, 0, len(spans))
	for _, span := range spans {
		entries = append(entries, outlineEntry{
			Heading: span.title,
			Level:   span.level,
			Bytes:   span.end - span.start,
		})
	}
	return entries
}

// preambleBytes is the size of whatever sits above the first heading.
//
// Reported separately because an outline that omits it silently loses text:
// a page whose content is all intro and no headings would otherwise look
// empty.
func preambleBytes(markdown string) int {
	spans := parseHeadings(markdown)
	if len(spans) == 0 {
		return len(markdown)
	}
	return spans[0].start
}

// sliceSection returns one heading and everything nested under it.
//
// The second result is how many headings carried that title. More than one is
// not an error — duplicate headings are ordinary on a long page — so the first
// is returned and the count lets the caller say which one it picked.
func sliceSection(markdown, heading string) (string, int) {
	want := normalizeHeading(heading)
	if want == "" {
		return "", 0
	}

	matches := 0
	found := ""
	for _, span := range parseHeadings(markdown) {
		if normalizeHeading(span.title) != want {
			continue
		}
		matches++
		if matches == 1 {
			found = strings.TrimRight(markdown[span.start:span.end], "\n")
		}
	}
	return found, matches
}

// normalizeHeading makes heading lookup forgiving in the ways that do not
// change which section is meant: case, surrounding space, and a leading `##`
// the agent copied along with the text.
func normalizeHeading(heading string) string {
	h := strings.TrimSpace(heading)
	h = strings.TrimLeft(h, "#")
	return strings.ToLower(strings.TrimSpace(h))
}

// headingList is the "did you mean" line for a section that was not found.
// Naming the available headings turns a dead end into the agent's next call.
func headingList(markdown string) string {
	spans := parseHeadings(markdown)
	if len(spans) == 0 {
		return ""
	}
	titles := make([]string, 0, len(spans))
	for _, span := range spans {
		// Plain quotes rather than %q: real headings carry backticks and
		// apostrophes, and escaping them makes the suggestion harder to copy
		// back into the `section` argument.
		titles = append(titles, "\""+span.title+"\"")
	}
	return strings.Join(titles, ", ")
}
