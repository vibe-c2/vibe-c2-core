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
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation id; omit for the operator's current one."`
	Title       string `json:"title,omitempty"        jsonschema:"Page title. Required unless template_id is given."`
	Content     string `json:"content,omitempty"      jsonschema:"Markdown body, up to 1 MB in one call. Ignored with template_id."`
	ParentID    string `json:"parent_id,omitempty"    jsonschema:"Parent page id."`
	TemplateID  string `json:"template_id,omitempty"  jsonschema:"Copy this template's structure and content, from list_wiki_templates."`
	visualIdentity
}

// sectionWriteArgs is add_wiki_section's input: the same content, one or
// many targets, and which end it lands on.
type sectionWriteArgs struct {
	IdempotencyKey
	DocumentID  string   `json:"document_id,omitempty"  jsonschema:"Page id."`
	DocumentIDs []string `json:"document_ids,omitempty" jsonschema:"Several page ids to add the same content to in one call."`
	Content     string   `json:"content"                jsonschema:"Markdown to add, whole, up to 1 MB. Existing content is untouched."`
	Position    string   `json:"position,omitempty"     jsonschema:"end (default) or start."`
}

type updateWikiDocumentArgs struct {
	IdempotencyKey
	DocumentID string `json:"document_id"       jsonschema:"Page id."`
	Content    string `json:"content"           jsonschema:"The complete new body as Markdown, up to 1 MB in one call. Anything omitted is deleted."`
	Title      string `json:"title,omitempty"   jsonschema:"New title."`
	visualIdentity
}

type editWikiDocumentArgs struct {
	IdempotencyKey
	DocumentID string `json:"document_id"          jsonschema:"Page id."`
	OldText    string `json:"old_text"             jsonschema:"Exact text to replace, copied verbatim; must be unique on the page."`
	NewText    string `json:"new_text"             jsonschema:"Replacement; empty deletes the match."`
	ReplaceAll bool   `json:"replace_all,omitempty" jsonschema:"Replace every occurrence."`
}

func handleCreateWikiDocument(ctx context.Context, s *Server, args createWikiDocumentArgs) (toolResult, error) {
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}
	if args.TemplateID != "" {
		return s.createFromTemplate(ctx, opID, args)
	}
	if args.Title == "" {
		return toolResult{}, refuse("title is required unless template_id is given.")
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

	var written wiki.ApplyMarkdownResult
	if args.Content != "" {
		var err error
		if written, err = s.writeBody(ctx, doc, args.Content, wiki.ApplyReplace); err != nil {
			return toolResult{}, err
		}
	}

	return toolResult{
		Payload:     newWikiWriteResult(toWikiDocView(doc), written.Watchers, written.AttachmentAudit),
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

// handleAddWikiSection adds to either end of one or more pages. One tool
// with a position rather than an append and a prepend tool: the two were
// identical but for the insertion point, and every tool definition is paid
// for on every turn.
func handleAddWikiSection(ctx context.Context, s *Server, args sectionWriteArgs) (toolResult, error) {
	switch strings.ToLower(strings.TrimSpace(args.Position)) {
	case "", "end":
		return s.writeSection(ctx, args, wiki.ApplyAppend)
	case "start":
		return s.writeSection(ctx, args, wiki.ApplyPrepend)
	}
	return toolResult{}, refuse("position must be end or start, not %q.", args.Position)
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
			Payload:     newWikiWriteResult(wikiDocView{ID: results[0].ID, Title: results[0].Title}, results[0].Watchers, results[0].audit),
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

	written, err := s.writeBody(ctx, doc, content, mode)
	if err != nil {
		result.Error = err.Error()
		return result, nil, err
	}

	result.OK = true
	result.Watchers = written.Watchers
	result.audit = written.AttachmentAudit
	return result, &doc.OperationID, nil
}

// handleEditWikiDocument replaces an exact snippet.
//
// The reason this exists is cost. update_wiki_document takes the whole body,
// so fixing one line in a 10 KB page means an agent serializes 10 KB into a
// tool call — every time, for every edit. That is slow, expensive, and it puts
// the entire page at risk of a transcription slip on each pass.
//
// The match and the replacement happen in the sidecar, on the live document,
// in one transaction: no rendering of the persisted state here, no whole body
// sent back, and nothing a collaborator typed meanwhile is lost. The
// uniqueness rule is the same one a code-editing tool uses, and for the same
// reason: an ambiguous match is far more likely to be the agent misreading
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
				"use add_wiki_section instead.")
	}
	if args.OldText == args.NewText {
		return toolResult{}, refuse("old_text and new_text are identical, so this edit would do nothing.")
	}
	if s.deps.Hocuspocus == nil {
		return toolResult{}, fmt.Errorf("wiki writing is unavailable: the collaboration service is not configured")
	}

	result, err := s.deps.Hocuspocus.EditMarkdown(ctx, doc.DocumentID.String(), args.OldText, args.NewText, args.ReplaceAll)
	var noMatch *wiki.EditNoMatchError
	var ambiguous *wiki.EditAmbiguousError
	switch {
	case errors.As(err, &noMatch):
		return toolResult{}, refuse(
			"that exact text is not on %q. %s Read it with get_wiki_document and copy the "+
				"snippet from what it returns — whitespace and list markers have to match "+
				"exactly.",
			doc.Title, noMatch.Diagnosis)
	case errors.As(err, &ambiguous):
		return toolResult{}, refuse(
			"that text appears %d times on %q, so it is ambiguous. Include more of the "+
				"surrounding lines to pin down which one you mean, or pass replace_all to "+
				"change every occurrence.", ambiguous.Matches, doc.Title)
	case errors.Is(err, wiki.ErrMarkdownTooLarge):
		return toolResult{}, refuse(
			"that edit would grow the page past its limit (about 1 MB). Attach the content " +
				"with attach_text_to_wiki_document instead.")
	case err != nil:
		s.deps.Logger.Warn("mcp: failed to apply wiki edit",
			zap.String("document_id", doc.DocumentID.String()), zap.Error(err))
		return toolResult{}, fmt.Errorf("failed to save the page: %w", err)
	}
	s.forgetMarkdown(ctx, doc.DocumentID.String())

	payload := struct {
		wikiWriteResultView
		Replacements int `json:"replacements"`
	}{
		wikiWriteResultView: newWikiWriteResult(toWikiDocView(doc), result.Watchers, result.AttachmentAudit),
		Replacements:        result.Replacements,
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

	written, err := s.writeBody(ctx, doc, args.Content, wiki.ApplyReplace)
	if err != nil {
		return toolResult{}, err
	}

	return toolResult{
		Payload:     newWikiWriteResult(toWikiDocView(doc), written.Watchers, written.AttachmentAudit),
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
func (s *Server) writeBody(ctx context.Context, doc *models.WikiDocument, body string, mode wiki.ApplyMode) (wiki.ApplyMarkdownResult, error) {
	// Size is checked before anything else: it is true whatever the rest of
	// the deployment looks like, and it is the more useful thing to say.
	//
	// Checked here as well as in the sidecar so the refusal names the limit
	// and a way forward. An agent that meets an opaque error starts splitting
	// its content into chunks, which is slower, leaves the page half-written
	// when one chunk fails, and was never necessary — see the note on the
	// tool descriptions.
	if len(body) > wiki.MaxMarkdownBytes {
		return wiki.ApplyMarkdownResult{}, refuse(
			"that body is %d bytes and the limit for one page is %d (about 1 MB). "+
				"Do not split it across several edits — attach it instead with "+
				"attach_text_to_wiki_document, which takes the whole thing in one call, "+
				"and link to it from the page.",
			len(body), wiki.MaxMarkdownBytes)
	}

	if s.deps.Hocuspocus == nil {
		return wiki.ApplyMarkdownResult{}, fmt.Errorf("wiki writing is unavailable: the collaboration service is not configured")
	}

	result, err := s.deps.Hocuspocus.ApplyMarkdown(ctx, doc.DocumentID.String(), body, mode)
	if errors.Is(err, wiki.ErrMarkdownTooLarge) {
		// Belt and braces: the check above should have caught this, and will
		// not if the sidecar's limit is lowered without this one following.
		return wiki.ApplyMarkdownResult{}, refuse(
			"that body is too large for one page. Attach it instead with " +
				"attach_text_to_wiki_document, rather than splitting it across several edits.")
	}
	if err != nil {
		s.deps.Logger.Warn("mcp: failed to apply wiki edit",
			zap.String("document_id", doc.DocumentID.String()),
			zap.String("mode", string(mode)), zap.Error(err))
		return wiki.ApplyMarkdownResult{}, fmt.Errorf("failed to save the page: %w", err)
	}

	// The body changed, so the cached rendering is wrong even though the
	// persistence stamp will not move until the sidecar's next debounce.
	s.forgetMarkdown(ctx, doc.DocumentID.String())
	return result, nil
}
