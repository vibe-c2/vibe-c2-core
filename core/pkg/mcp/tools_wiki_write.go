package mcp

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
	"go.uber.org/zap"
)

type createWikiDocumentArgs struct {
	IdempotencyKey
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation to create the page in. Defaults to whatever the operator currently has open."`
	Title       string `json:"title"                  jsonschema:"Page title."`
	Content     string `json:"content,omitempty"      jsonschema:"Page body as Markdown. Send it whole — the limit is 1 MB, so there is no reason to split it."`
	ParentID    string `json:"parent_id,omitempty"    jsonschema:"Create as a child of this page."`
	visualIdentity
}

// sectionWriteArgs is shared by append_wiki_section and prepend_wiki_section:
// the same content, the same targets, only the end it lands on differs.
type sectionWriteArgs struct {
	IdempotencyKey
	DocumentID  string   `json:"document_id,omitempty"  jsonschema:"The page to add to."`
	DocumentIDs []string `json:"document_ids,omitempty" jsonschema:"Several pages to add the SAME content to, in one call. Use this instead of repeating the call per page — the content travels once rather than once per page."`
	Content     string   `json:"content"                jsonschema:"Markdown to add. Existing content is never touched. Send it whole — the limit is 1 MB, so there is no reason to split it across calls."`
}

type updateWikiDocumentArgs struct {
	IdempotencyKey
	DocumentID string `json:"document_id"       jsonschema:"The page to rewrite."`
	Content    string `json:"content"           jsonschema:"The new body as Markdown. This REPLACES the page, so read it first and send the whole thing back. The limit is 1 MB — send it in one call, never in chunks."`
	Title      string `json:"title,omitempty"   jsonschema:"Optionally rename the page at the same time."`
	visualIdentity
}

type editWikiDocumentArgs struct {
	IdempotencyKey
	DocumentID string `json:"document_id"          jsonschema:"The page to edit, from search_wiki."`
	OldText    string `json:"old_text"             jsonschema:"The exact text to replace, copied from get_wiki_document. Whitespace matters. Include enough surrounding lines to make it unique."`
	NewText    string `json:"new_text"             jsonschema:"What to put there instead. An empty string deletes the matched text."`
	ReplaceAll bool   `json:"replace_all,omitempty" jsonschema:"Replace every occurrence instead of refusing when old_text appears more than once."`
}

func handleCreateWikiDocument(ctx context.Context, s *Server, args createWikiDocumentArgs) (toolResult, error) {
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}

	// Create through the resolver so nesting depth, title limits, the ancestor
	// path and the domain event are all handled the same way they are for a
	// human. Content is applied afterwards, because it needs the CRDT seeding
	// the resolver does not do — see writeBody.
	if err := args.validate(); err != nil {
		return toolResult{}, err
	}
	emoji, icon, color := args.applyWithAdaptiveDefault()

	doc, err := s.deps.WikiDocs.CreateWikiDocument(ctx, opID.String(), model.CreateWikiDocumentInput{
		Title:            args.Title,
		ParentDocumentID: optionalString(args.ParentID),
		Emoji:            emoji,
		Icon:             icon,
		Color:            color,
	})
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to create wiki page: %w", err)
	}

	if args.Content != "" {
		if _, err := s.writeBody(ctx, doc, args.Content, wiki.ApplyReplace); err != nil {
			return toolResult{}, err
		}
	}

	return toolResult{
		Payload:     toWikiDocView(doc),
		OperationID: &opID,
		Summary:     fmt.Sprintf("created wiki page %s", doc.Title),
	}, nil
}

// maxSectionTargets bounds one multi-page write.
//
// Each target is a separate sidecar transaction, so this is a wall-clock and
// blast-radius limit rather than a payload one. Twenty-five is well above the
// real cases (stamping a notice across a handful of host pages) and far below
// "rewrite the whole wiki by accident".
const maxSectionTargets = 25

// targets resolves the one-or-many document argument into a deduplicated list.
//
// Both forms are accepted and merged rather than treated as mutually
// exclusive. An agent that sends both means the union of them, and refusing
// that would be pedantry that costs a round trip to correct.
func (a sectionWriteArgs) targets() ([]string, error) {
	seen := make(map[string]bool, len(a.DocumentIDs)+1)
	var ids []string
	for _, id := range append([]string{a.DocumentID}, a.DocumentIDs...) {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}

	if len(ids) == 0 {
		return nil, refuse("give document_id for one page, or document_ids for several.")
	}
	if len(ids) > maxSectionTargets {
		return nil, refuse(
			"that is %d pages in one call and the limit is %d. Split it into batches — "+
				"the limit is about how much one call should be able to change at once, "+
				"not about the size of the content.", len(ids), maxSectionTargets)
	}
	return ids, nil
}

func handleAppendWikiSection(ctx context.Context, s *Server, args sectionWriteArgs) (toolResult, error) {
	return s.writeSection(ctx, args, wiki.ApplyAppend)
}

func handlePrependWikiSection(ctx context.Context, s *Server, args sectionWriteArgs) (toolResult, error) {
	return s.writeSection(ctx, args, wiki.ApplyPrepend)
}

// writeSection adds the same content to one or more pages.
//
// Partial success is reported, not hidden. Each page is a separate
// transaction, so a permission refusal on the third of five does not undo the
// first two and pretending otherwise would be a lie the agent then repeats to
// the operator. The result names every page and what happened to it; the call
// only fails outright when nothing at all was written.
func (s *Server) writeSection(ctx context.Context, args sectionWriteArgs, mode wiki.ApplyMode) (toolResult, error) {
	ids, err := args.targets()
	if err != nil {
		return toolResult{}, err
	}
	if args.Content == "" {
		return toolResult{}, refuse("content is required: it is the Markdown to add.")
	}

	verb := "appended to"
	if mode == wiki.ApplyPrepend {
		verb = "prepended to"
	}

	var (
		results  []sectionTargetResult
		opID     *uuid.UUID
		applied  int
		failures []error
	)

	for _, id := range ids {
		result, docOpID, err := s.writeSectionOne(ctx, id, args.Content, mode)
		results = append(results, result)
		if err != nil {
			failures = append(failures, err)
			continue
		}
		applied++
		if opID == nil {
			opID = docOpID
		}
	}

	// Nothing landed: this is a failed call, not a report of failures.
	if applied == 0 {
		// One target returns its error unwrapped, so a refusal stays typed as
		// a refusal. The distinction is the difference between the operator
		// reading "your key cannot do that" and "the platform is broken".
		if len(ids) == 1 {
			return toolResult{}, failures[0]
		}
		return toolResult{}, fmt.Errorf("none of the %d pages could be written: %w",
			len(ids), errors.Join(failures...))
	}

	// One target keeps the original single-page shape. Agents and the skill
	// have been reading `watchers` off the top level since this tool existed,
	// and changing that for every caller to serve the batch case would be a
	// gratuitous break.
	if len(ids) == 1 {
		return toolResult{
			Payload:     newWikiWriteResult(wikiDocView{ID: results[0].ID, Title: results[0].Title}, results[0].Watchers),
			OperationID: opID,
			Summary:     fmt.Sprintf("%s %s", verb, results[0].Title),
		}, nil
	}

	payload := sectionWriteResultView{
		Applied: applied,
		Failed:  len(ids) - applied,
		Results: results,
	}
	if payload.Failed > 0 {
		payload.Notes = append(payload.Notes,
			"Some pages were not written. The ones marked ok were, and re-sending to those "+
				"would add the content twice — retry only the failures.")
	}

	return toolResult{
		Payload:     payload,
		OperationID: opID,
		Summary:     fmt.Sprintf("%s %d of %d pages", verb, applied, len(ids)),
	}, nil
}

// writeSectionOne applies the edit to a single page, reporting the outcome
// rather than aborting the batch.
func (s *Server) writeSectionOne(ctx context.Context, id, content string, mode wiki.ApplyMode) (sectionTargetResult, *uuid.UUID, error) {
	result := sectionTargetResult{ID: id}

	doc, err := s.deps.WikiDocs.WikiDocument(ctx, id)
	if err != nil {
		err = fmt.Errorf("wiki page %s not found", id)
		result.Error = err.Error()
		return result, nil, err
	}
	result.Title = doc.Title

	if _, err := s.authorizeOperation(ctx, doc.OperationID, models.OperationRoleOperator); err != nil {
		result.Error = err.Error()
		return result, nil, err
	}

	watchers, err := s.writeBody(ctx, doc, content, mode)
	if err != nil {
		result.Error = err.Error()
		return result, nil, err
	}

	result.OK = true
	result.Watchers = watchers
	return result, &doc.OperationID, nil
}

// handleEditWikiDocument replaces an exact snippet.
//
// The reason this exists is cost. update_wiki_document takes the whole body,
// so fixing one line in a 10 KB page means an agent serializes 10 KB into a
// tool call — every time, for every edit. That is slow, expensive, and it puts
// the entire page at risk of a transcription slip on each pass.
//
// The uniqueness rule is the same one a code-editing tool uses, and for the
// same reason: an ambiguous match is far more likely to be the agent misreading
// the page than a genuine intent to change all of them, so it is refused with
// the count rather than guessed at.
func handleEditWikiDocument(ctx context.Context, s *Server, args editWikiDocumentArgs) (toolResult, error) {
	doc, err := s.loadWikiDocument(ctx, args.DocumentID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}

	if args.OldText == "" {
		return toolResult{}, refuse(
			"old_text is required: it is the snippet to replace. To add to the end of a page " +
				"use append_wiki_section instead.")
	}
	if args.OldText == args.NewText {
		return toolResult{}, refuse("old_text and new_text are identical, so this edit would do nothing.")
	}

	body := s.documentMarkdown(ctx, doc)
	matches := strings.Count(body, args.OldText)

	switch {
	case matches == 0:
		return toolResult{}, refuse(
			"that exact text is not on %q.%s Read it with get_wiki_document and copy the "+
				"snippet from what it returns — whitespace and list markers have to match "+
				"exactly.",
			doc.Title, diagnoseNoMatch(body, args.OldText))
	case matches > 1 && !args.ReplaceAll:
		return toolResult{}, refuse(
			"that text appears %d times on %q, so it is ambiguous. Include more of the "+
				"surrounding lines to pin down which one you mean, or pass replace_all to "+
				"change every occurrence.", matches, doc.Title)
	}

	replacements := 1
	if args.ReplaceAll {
		replacements = matches
	}
	updated := strings.Replace(body, args.OldText, args.NewText, replacements)

	watchers, err := s.writeBody(ctx, doc, updated, wiki.ApplyReplace)
	if err != nil {
		return toolResult{}, err
	}

	payload := struct {
		wikiWriteResultView
		Replacements int `json:"replacements"`
	}{
		wikiWriteResultView: newWikiWriteResult(toWikiDocView(doc), watchers),
		Replacements:        replacements,
	}

	return toolResult{
		Payload:     payload,
		OperationID: &doc.OperationID,
		Summary:     fmt.Sprintf("edited wiki page %s", doc.Title),
	}, nil
}

func handleUpdateWikiDocument(ctx context.Context, s *Server, args updateWikiDocumentArgs) (toolResult, error) {
	doc, err := s.loadWikiDocument(ctx, args.DocumentID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}

	if err := args.validate(); err != nil {
		return toolResult{}, err
	}
	emoji, icon, color := args.apply()

	// Title and the visual identity go through the resolver; only the body
	// needs the collaboration path.
	if (args.Title != "" && args.Title != doc.Title) || emoji != nil || icon != nil || color != nil {
		input := model.UpdateWikiDocumentInput{Emoji: emoji, Icon: icon, Color: color}
		if args.Title != "" && args.Title != doc.Title {
			input.Title = &args.Title
		}
		if _, err := s.deps.WikiDocs.UpdateWikiDocument(ctx, args.DocumentID, input); err != nil {
			return toolResult{}, fmt.Errorf("failed to update the wiki page: %w", err)
		}
	}

	watchers, err := s.writeBody(ctx, doc, args.Content, wiki.ApplyReplace)
	if err != nil {
		return toolResult{}, err
	}

	return toolResult{
		Payload:     newWikiWriteResult(toWikiDocView(doc), watchers),
		OperationID: &doc.OperationID,
		Summary:     fmt.Sprintf("rewrote wiki page %s", doc.Title),
	}, nil
}

// writeBody applies a Markdown edit to a document through the collaboration
// sidecar, and reports how many people were watching.
//
// Not a Mongo write. The sidecar's persistence layer treats content_state as
// the authoritative body and a connected editor holds it in memory, so
// overwriting the row would be erased on that client's next debounce — or
// land mid-keystroke, and the reader would watch their document change under
// the cursor. Going through the sidecar makes this an ordinary Y.js
// transaction: it merges, it broadcasts to everyone connected, and it
// persists through the same store any human edit does.
//
// This is what lets an agent write to the page the operator is looking at,
// which is the entire point of working alongside one. The previous
// implementation refused that case, which meant the more engaged the operator
// was with a page, the less the agent could help with it.
func (s *Server) writeBody(ctx context.Context, doc *models.WikiDocument, body string, mode wiki.ApplyMode) (int, error) {
	// Size is checked before anything else: it is true whatever the rest of
	// the deployment looks like, and it is the more useful thing to say.
	//
	// Checked here as well as in the sidecar so the refusal names the limit
	// and a way forward. An agent that meets an opaque error starts splitting
	// its content into chunks, which is slower, leaves the page half-written
	// when one chunk fails, and was never necessary — see the note on the
	// tool descriptions.
	if len(body) > wiki.MaxMarkdownBytes {
		return 0, refuse(
			"that body is %d bytes and the limit for one page is %d (about 1 MB). "+
				"Do not split it across several edits — attach it instead with "+
				"attach_text_to_wiki_document, which takes the whole thing in one call, "+
				"and link to it from the page.",
			len(body), wiki.MaxMarkdownBytes)
	}

	if s.deps.Hocuspocus == nil {
		return 0, fmt.Errorf("wiki writing is unavailable: the collaboration service is not configured")
	}

	result, err := s.deps.Hocuspocus.ApplyMarkdown(ctx, doc.DocumentID.String(), body, mode)
	if errors.Is(err, wiki.ErrMarkdownTooLarge) {
		// Belt and braces: the check above should have caught this, and will
		// not if the sidecar's limit is lowered without this one following.
		return 0, refuse(
			"that body is too large for one page. Attach it instead with " +
				"attach_text_to_wiki_document, rather than splitting it across several edits.")
	}
	if err != nil {
		s.deps.Logger.Warn("mcp: failed to apply wiki edit",
			zap.String("document_id", doc.DocumentID.String()),
			zap.String("mode", string(mode)), zap.Error(err))
		return 0, fmt.Errorf("failed to save the page: %w", err)
	}

	return result.Watchers, nil
}
