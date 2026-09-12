package resolver

import (
	"context"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// Page excerpts.
//
// A hover preview wants the first sentence or two of a page, the way an
// encyclopedia's link preview does. Shipping the whole body for that is the
// wrong trade: the projection is bounded at a megabyte, a page can be cited
// from dozens of chips, and the preview shows a few hundred characters of it.
// So the cut happens here, on the projection that is already loaded, and the
// wire carries only what is shown.
//
// The source is WikiDocument.Content, the sidecar's plain-text projection of
// the body with blocks joined by newlines. It is not the rendered Markdown,
// which is fine for a glance and would cost a sidecar round trip per preview.
// The projection carries inline marks as pseudo-tags (<bold>, <italic>,
// <code>, <link href=…>); they are stripped here rather than shown, since a
// preview is prose, not markup.

const (
	// defaultExcerptRunes is about two lines of prose in a preview card.
	defaultExcerptRunes = 280
	// maxExcerptRunes bounds what a caller may ask for. Past this the field
	// is being used as a body fetch, which `content` already is.
	maxExcerptRunes = 1000
	// ellipsis marks a cut so the reader knows there is more.
	ellipsis = "…"
)

// pseudoTag matches the sidecar's inline-mark markers. Anchored on a letter
// after the bracket so a stray "<" in prose ("a < b") is left alone.
var pseudoTag = regexp.MustCompile(`</?[A-Za-z][^<>]*>`)

// WikiDocumentExcerpt returns the opening of the body, cut to maxLength
// characters on a word boundary. No I/O: it works on the loaded projection.
func (r *wikiDocumentResolver) WikiDocumentExcerpt(_ context.Context, obj *models.WikiDocument, maxLength *int) (string, error) {
	limit := defaultExcerptRunes
	if maxLength != nil && *maxLength > 0 {
		limit = min(*maxLength, maxExcerptRunes)
	}
	return excerptOf(obj.Content, obj.Title, limit), nil
}

// excerptOf strips pseudo-tags, collapses whitespace and clips text to at
// most maxRunes runes, preferring to end on a word boundary. A clipped result
// ends with an ellipsis, which counts toward the limit so the output never
// exceeds it.
//
// A body that opens by restating the page title (the usual top heading) has
// that opening dropped: the preview already shows the title, and the budget
// is better spent on the first real sentence.
func excerptOf(text, title string, maxRunes int) string {
	flat := strings.Join(strings.Fields(pseudoTag.ReplaceAllString(text, "")), " ")
	flat = trimLeadingTitle(flat, title)
	if flat == "" || maxRunes <= 0 {
		return ""
	}
	if utf8.RuneCountInString(flat) <= maxRunes {
		return flat
	}

	// Leave room for the ellipsis inside the budget.
	budget := maxRunes - utf8.RuneCountInString(ellipsis)
	if budget <= 0 {
		return ellipsis
	}

	// Find the byte offset of the budget-th rune.
	cut := 0
	for range budget {
		_, size := utf8.DecodeRuneInString(flat[cut:])
		cut += size
	}

	// Back up to the last space so a word is not split, unless the cut
	// already sits on a boundary, or backing up would throw away most of the
	// budget (one very long token), where a hard cut beats a one-word excerpt.
	head := flat[:cut]
	next, _ := utf8.DecodeRuneInString(flat[cut:])
	if !unicode.IsSpace(next) {
		if idx := strings.LastIndexFunc(head, unicode.IsSpace); idx > budget/2 {
			head = head[:idx]
		}
	}
	head = strings.TrimRightFunc(head, func(r rune) bool {
		return unicode.IsSpace(r) || unicode.IsPunct(r)
	})
	return head + ellipsis
}

// trimLeadingTitle drops the title from the start of flat when it is the
// whole first "block" there, i.e. followed by a space or the end of text.
func trimLeadingTitle(flat, title string) string {
	title = strings.Join(strings.Fields(title), " ")
	if title == "" || len(flat) < len(title) {
		return flat
	}
	if !strings.EqualFold(flat[:len(title)], title) {
		return flat
	}
	rest := flat[len(title):]
	if rest != "" && !strings.HasPrefix(rest, " ") {
		return flat
	}
	return strings.TrimLeft(rest, " ")
}
