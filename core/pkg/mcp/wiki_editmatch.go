package mcp

import (
	"fmt"
	"strings"
)

// Why an exact-match edit missed.
//
// edit_wiki_document requires old_text to match byte for byte, and that is
// deliberate: fuzzy matching, line numbers and regexes all fail the same way,
// by succeeding against the wrong text on a page somebody else may be editing
// at that moment. The rule stays.
//
// What was wrong was the refusal. "That exact text is not on the page" is true
// and useless — it does not say whether the agent is on the wrong page, has the
// right text with the wrong indentation, or invented the snippet. So the agent
// re-reads the page and tries again, and the operator watches it burn calls
// converging on a single tab character.
//
// Naming the near miss turns that loop into one corrected retry. It is only a
// diagnostic: it never relaxes what the edit will accept.

// diagnoseNoMatch returns a sentence explaining the likeliest reason old_text
// did not match, or "" when nothing useful can be said.
//
// The leading space is included so callers can concatenate it straight after
// their own sentence without building the spacing themselves.
func diagnoseNoMatch(body, oldText string) string {
	if body == "" {
		return " The page is empty."
	}

	// Each difference is tested on its own and then together. The combined
	// case has to be checked too: a snippet retyped from memory usually gets
	// both the indentation and the capitalisation slightly wrong, and testing
	// only one at a time sent exactly that snippet — the commonest one — to
	// the useless "you are on the wrong page" answer.
	spacing := strings.Contains(collapseWhitespace(body), collapseWhitespace(oldText))
	casing := strings.Contains(strings.ToLower(body), strings.ToLower(oldText))
	both := strings.Contains(
		strings.ToLower(collapseWhitespace(body)),
		strings.ToLower(collapseWhitespace(oldText)),
	)

	switch {
	case spacing:
		return " The text is there but the whitespace differs — indentation, a tab where you" +
			" sent spaces, or a line broken in a different place."
	case casing:
		return " The text is there but the capitalisation differs."
	case both:
		return " The text is there but both the whitespace and the capitalisation differ."
	}

	if line := firstContentLine(oldText); line != "" && strings.Contains(body, line) {
		return fmt.Sprintf(" Its first line (%q) is on the page, so the snippet starts in the"+
			" right place and diverges after it.", clipRunes(line, 60))
	}

	return " No part of it is on the page — you may be editing the wrong one."
}

// firstContentLine is the first non-blank line of a snippet, trimmed.
//
// Trimmed because it is used as a weaker, indentation-insensitive probe; the
// exact-match rule is enforced elsewhere and is not affected by this.
func firstContentLine(s string) string {
	for _, line := range strings.Split(s, "\n") {
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
