package mcp

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
	"go.uber.org/zap"
)

type searchWikiArgs struct {
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation to search. Defaults to whatever the operator currently has open."`
	Search      string `json:"search,omitempty"       jsonschema:"Free-text match against title and body."`
	Limit       int    `json:"limit,omitempty"        jsonschema:"Maximum pages to return (default 25, maximum 50)."`
	Cursor      string `json:"cursor,omitempty"       jsonschema:"Continue a previous page using its nextCursor."`
}

type listWikiTreeArgs struct {
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation whose page tree to list. Defaults to whatever the operator currently has open."`
}

type listWikiTemplatesArgs struct {
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation whose templates to list. Defaults to whatever the operator currently has open."`
}

type createFromTemplateArgs struct {
	IdempotencyKey
	TemplateID  string `json:"template_id"            jsonschema:"The template to instantiate, from list_wiki_templates."`
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation to create the page in. Defaults to whatever the operator currently has open. A template from one operation can be instantiated into another."`
	Title       string `json:"title,omitempty"        jsonschema:"Title for the new page. Defaults to the template's own title."`
	ParentID    string `json:"parent_id,omitempty"    jsonschema:"Create as a child of this page."`
	visualIdentity
}

type setWikiTemplateArgs struct {
	IdempotencyKey
	DocumentID string `json:"document_id"  jsonschema:"The page to mark or unmark."`
	IsTemplate bool   `json:"is_template"  jsonschema:"True to make this page a reusable template, false to turn it back into an ordinary page."`
}

type getWikiDocumentArgs struct {
	DocumentID string `json:"document_id" jsonschema:"The page's id, from search_wiki or list_wiki_tree."`
}

type createWikiDocumentArgs struct {
	IdempotencyKey
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation to create the page in. Defaults to whatever the operator currently has open."`
	Title       string `json:"title"                  jsonschema:"Page title."`
	Content     string `json:"content,omitempty"      jsonschema:"Page body as Markdown."`
	ParentID    string `json:"parent_id,omitempty"    jsonschema:"Create as a child of this page."`
	visualIdentity
}

type appendWikiSectionArgs struct {
	IdempotencyKey
	DocumentID string `json:"document_id"     jsonschema:"The page to add to."`
	Content    string `json:"content"         jsonschema:"Markdown to add at the end of the page. Existing content is never touched."`
}

type updateWikiDocumentArgs struct {
	IdempotencyKey
	DocumentID string `json:"document_id"       jsonschema:"The page to rewrite."`
	Content    string `json:"content"           jsonschema:"The new body as Markdown. This REPLACES the page, so read it first and send the whole thing back."`
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

func registerWikiTools(s *Server) {
	register(s, &mcp.Tool{
		Name:        "search_wiki",
		Description: "Search the operation's wiki pages by title and body.",
	}, readTool, handleSearchWiki)

	register(s, &mcp.Tool{
		Name: "list_wiki_tree",
		Description: "The operation's page tree, titles and parents only. Cheaper than " +
			"searching when you want to see how the engagement notes are organized.",
	}, readTool, handleListWikiTree)

	register(s, &mcp.Tool{
		Name: "list_wiki_templates",
		Description: "Reusable page templates you can start from — the operation's own, plus the " +
			"shared ones in the Public wiki, marked `shared`. Check here before writing a page " +
			"from scratch: a template carries the structure the operator expects, and starting " +
			"from one keeps your pages consistent with theirs.",
	}, readTool, handleListWikiTemplates)

	register(s, &mcp.Tool{
		Name: "create_wiki_document_from_template",
		Description: "Create a page from a template, copying its structure and content. " +
			"Prefer this over create_wiki_document whenever a template fits the job.",
	}, writeTool, handleCreateFromTemplate)

	register(s, &mcp.Tool{
		Name: "set_wiki_template",
		Description: "Mark a page as a reusable template, or turn it back into an ordinary " +
			"page. Templates are a shared convention the operator's whole team works from, so " +
			"propose this rather than deciding it yourself.",
	}, writeTool, handleSetWikiTemplate)

	register(s, &mcp.Tool{
		Name:        "get_wiki_document",
		Description: "One wiki page's full Markdown body.",
	}, readTool, handleGetWikiDocument)

	register(s, &mcp.Tool{
		Name: "create_wiki_document",
		Description: "Create a wiki page with Markdown content. Prefer this over rewriting an " +
			"existing page when you are adding something new.",
	}, writeTool, handleCreateWikiDocument)

	register(s, &mcp.Tool{
		Name: "append_wiki_section",
		Description: "Add Markdown to the end of a wiki page without touching what is already " +
			"there. Prefer this over update_wiki_document: it is safe while the operator is " +
			"editing the same page, and they will see your text appear as you write it.",
	}, writeTool, handleAppendWikiSection)

	register(s, &mcp.Tool{
		Name: "edit_wiki_document",
		Description: "Change part of a page by replacing an exact snippet, the way you would " +
			"edit a source file. Send only the text that changes, not the whole page. This is " +
			"the tool for almost every edit — reach for update_wiki_document only when you are " +
			"deliberately rewriting a page end to end.",
	}, writeTool, handleEditWikiDocument)

	register(s, &mcp.Tool{
		Name: "update_wiki_document",
		Description: "Replace a wiki page's whole body. Read the page first and send the " +
			"complete document back — this replaces rather than merges, so anything you omit " +
			"is removed. If the operator is editing the page right now, prefer " +
			"append_wiki_section so you do not overwrite what they are typing.",
	}, writeTool, handleUpdateWikiDocument)
}

func handleSearchWiki(ctx context.Context, s *Server, args searchWikiArgs) (toolResult, error) {
	opID, err := s.resolveOperation(ctx, args.OperationID)
	if err != nil {
		return toolResult{}, err
	}
	if _, err := s.authorizeOperation(ctx, opID, models.OperationRoleViewer); err != nil {
		return toolResult{}, err
	}

	limit := clampPageSize(args.Limit)
	conn, err := s.deps.WikiDocs.WikiDocuments(ctx, opID.String(), nil, optionalString(args.Search),
		nil, &limit, optionalString(args.Cursor), nil, nil)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to search wiki: %w", err)
	}

	views := make([]wikiDocView, 0, len(conn.Edges))
	for _, edge := range conn.Edges {
		views = append(views, toWikiDocView(edge.Node))
	}

	result, err := newPage(views, endCursor(conn.PageInfo), totalNote(conn.TotalCount, len(views))...)
	if err != nil {
		return toolResult{}, err
	}
	return toolResult{
		Payload:     result,
		OperationID: &opID,
		Summary:     fmt.Sprintf("searched wiki (%d shown of %d)", len(views), conn.TotalCount),
	}, nil
}

func handleListWikiTree(ctx context.Context, s *Server, args listWikiTreeArgs) (toolResult, error) {
	opID, err := s.resolveOperation(ctx, args.OperationID)
	if err != nil {
		return toolResult{}, err
	}
	if _, err := s.authorizeOperation(ctx, opID, models.OperationRoleViewer); err != nil {
		return toolResult{}, err
	}

	tree, err := s.deps.WikiDocs.WikiDocumentTree(ctx, opID.String())
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to read wiki tree: %w", err)
	}

	views := make([]wikiDocView, 0, len(tree))
	for _, doc := range tree {
		view := toWikiDocView(doc)
		view.Depth = len(doc.PathIDs)
		views = append(views, view)
	}

	result, err := newPage(views, "")
	if err != nil {
		return toolResult{}, err
	}
	return toolResult{
		Payload:     result,
		OperationID: &opID,
		Summary:     fmt.Sprintf("listed %d wiki pages", len(views)),
	}, nil
}

func handleListWikiTemplates(ctx context.Context, s *Server, args listWikiTemplatesArgs) (toolResult, error) {
	opID, err := s.resolveOperation(ctx, args.OperationID)
	if err != nil {
		return toolResult{}, err
	}
	if _, err := s.authorizeOperation(ctx, opID, models.OperationRoleViewer); err != nil {
		return toolResult{}, err
	}

	views, notes, err := s.collectTemplates(ctx, opID)
	if err != nil {
		return toolResult{}, err
	}

	result, err := newPage(views, "", notes...)
	if err != nil {
		return toolResult{}, err
	}
	return toolResult{
		Payload:     result,
		OperationID: &opID,
		Summary:     fmt.Sprintf("listed %d wiki templates", len(views)),
	}, nil
}

// collectTemplates gathers the templates this key can actually start a page
// from: the operation's own, plus the shared ones in the Public wiki.
//
// Public is where house templates live — it is readable by every
// authenticated caller and shared across every operation — but it is a
// separate operation, so a single-operation listing hid it completely. That
// left the tool saying "this operation has no templates" to an operator
// looking straight at a list of them, and it was inconsistent with
// create_wiki_document_from_template, which has always accepted a template
// from another operation.
func (s *Server) collectTemplates(ctx context.Context, opID uuid.UUID) ([]wikiTemplateView, []string, error) {
	templates, err := s.deps.WikiDocs.WikiTemplates(ctx, opID.String())
	if err != nil {
		return nil, nil, fmt.Errorf("failed to list templates: %w", err)
	}

	views := make([]wikiTemplateView, 0, len(templates))
	for _, doc := range templates {
		views = append(views, wikiTemplateView{wikiDocView: toWikiDocView(doc)})
	}

	var notes []string
	shared, sharedNote := s.publicTemplates(ctx, opID)
	views = append(views, shared...)
	if sharedNote != "" {
		notes = append(notes, sharedNote)
	}

	if len(views) == 0 {
		// Otherwise an agent reads an empty list as "templates are broken"
		// rather than "there are none to start from", and asks about it.
		notes = append(notes, "No templates are available to you. Write the page directly.")
	}
	return views, notes, nil
}

// publicTemplateScope decides whether a listing for opID should also reach
// into the Public wiki. Split out from the fetch so the decision — the part
// that was wrong — is testable on its own.
//
// The only reason not to is that the caller already listed Public itself;
// reaching again would show every shared template twice. An operation scope
// is not a reason: Public is not one of the owner's operations, and
// AgentInfo.AllowsOperation never narrows it away.
func publicTemplateScope(opID uuid.UUID) bool {
	return !models.IsPublicOperation(opID)
}

// publicTemplates returns the shared templates, or nothing plus an
// explanation when this key cannot reach the Public wiki.
//
// Every agent key can read Public — that is the point of it — so the refusal
// path should never fire. It is kept, and says so out loud rather than
// skipping silently, because an agent that sees fewer templates than the
// operator describes should know why instead of concluding they are gone.
func (s *Server) publicTemplates(ctx context.Context, opID uuid.UUID) ([]wikiTemplateView, string) {
	if !publicTemplateScope(opID) {
		return nil, ""
	}

	if _, err := s.authorizeOperation(ctx, models.PublicOperationID, models.OperationRoleViewer); err != nil {
		return nil, "Shared templates in the Public wiki are not readable by this key, " +
			"so they are not listed."
	}

	docs, err := s.deps.WikiDocs.WikiTemplates(ctx, models.PublicOperationID.String())
	if err != nil {
		return nil, "Shared templates in the Public wiki could not be read, so they are not listed."
	}

	views := make([]wikiTemplateView, 0, len(docs))
	for _, doc := range docs {
		views = append(views, wikiTemplateView{wikiDocView: toWikiDocView(doc), Shared: true})
	}
	return views, ""
}

func handleCreateFromTemplate(ctx context.Context, s *Server, args createFromTemplateArgs) (toolResult, error) {
	opID, err := s.resolveOperation(ctx, args.OperationID)
	if err != nil {
		return toolResult{}, err
	}
	if _, err := s.authorizeOperation(ctx, opID, models.OperationRoleOperator); err != nil {
		return toolResult{}, err
	}
	if err := args.validate(); err != nil {
		return toolResult{}, err
	}

	// The template may live in a different operation, so it gets its own
	// check. The resolver authorizes both sides too; doing it here as well
	// means the agent's scope list and role ceiling apply to the source, not
	// just the destination — a template is content, and reading one the key
	// has no business reading would leak it into the new page.
	template, err := s.deps.WikiDocs.WikiDocument(ctx, args.TemplateID)
	if err != nil {
		return toolResult{}, fmt.Errorf("template not found")
	}
	if _, err := s.authorizeOperation(ctx, template.OperationID, models.OperationRoleViewer); err != nil {
		return toolResult{}, err
	}
	if !template.IsTemplate {
		return toolResult{}, refuse(
			"%q is an ordinary page, not a template. Use list_wiki_templates to see what is "+
				"available, or create_wiki_document to write a page directly.", template.Title)
	}

	emoji, icon, color := args.apply()
	doc, err := s.deps.WikiDocs.InstantiateTemplate(ctx, args.TemplateID, opID.String(),
		optionalString(args.ParentID), optionalString(args.Title), emoji, icon, color)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to create the page from the template: %w", err)
	}

	return toolResult{
		Payload:     toWikiDocView(doc),
		OperationID: &opID,
		SubjectID:   doc.DocumentID,
		SubjectKind: models.SubjectKindWikiDocument,
		SubjectName: doc.Title,
		Summary:     fmt.Sprintf("created %s from template %s", doc.Title, template.Title),
	}, nil
}

func handleSetWikiTemplate(ctx context.Context, s *Server, args setWikiTemplateArgs) (toolResult, error) {
	doc, err := s.deps.WikiDocs.WikiDocument(ctx, args.DocumentID)
	if err != nil {
		return toolResult{}, fmt.Errorf("wiki page not found")
	}
	if _, err := s.authorizeOperation(ctx, doc.OperationID, models.OperationRoleOperator); err != nil {
		return toolResult{}, err
	}

	updated, err := s.deps.WikiDocs.SetWikiDocumentTemplate(ctx, args.DocumentID, args.IsTemplate)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to change the template flag: %w", err)
	}

	verb := "unmarked as a template"
	if args.IsTemplate {
		verb = "marked as a template"
	}
	return toolResult{
		Payload:     toWikiDocView(updated),
		OperationID: &doc.OperationID,
		SubjectID:   doc.DocumentID,
		SubjectKind: models.SubjectKindWikiDocument,
		SubjectName: doc.Title,
		Summary:     fmt.Sprintf("%s %s", doc.Title, verb),
	}, nil
}

func handleGetWikiDocument(ctx context.Context, s *Server, args getWikiDocumentArgs) (toolResult, error) {
	doc, err := s.deps.WikiDocs.WikiDocument(ctx, args.DocumentID)
	if err != nil {
		return toolResult{}, fmt.Errorf("wiki page not found")
	}
	if _, err := s.authorizeOperation(ctx, doc.OperationID, models.OperationRoleViewer); err != nil {
		return toolResult{}, err
	}

	body, truncated := truncateBody(s.documentMarkdown(ctx, doc))
	view := wikiDocDetailView{
		wikiDocView: toWikiDocView(doc),
		Content:     body,
		UpdatedAt:   formatTime(doc.UpdateAt),
		Truncated:   truncated,
	}

	return toolResult{
		Payload:     view,
		OperationID: &doc.OperationID,
		Summary:     fmt.Sprintf("read wiki page %s", doc.Title),
	}, nil
}

func handleCreateWikiDocument(ctx context.Context, s *Server, args createWikiDocumentArgs) (toolResult, error) {
	opID, err := s.resolveOperation(ctx, args.OperationID)
	if err != nil {
		return toolResult{}, err
	}
	if _, err := s.authorizeOperation(ctx, opID, models.OperationRoleOperator); err != nil {
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
		SubjectID:   doc.DocumentID,
		SubjectKind: models.SubjectKindWikiDocument,
		SubjectName: doc.Title,
		Summary:     fmt.Sprintf("created wiki page %s", doc.Title),
	}, nil
}

func handleAppendWikiSection(ctx context.Context, s *Server, args appendWikiSectionArgs) (toolResult, error) {
	doc, err := s.deps.WikiDocs.WikiDocument(ctx, args.DocumentID)
	if err != nil {
		return toolResult{}, fmt.Errorf("wiki page not found")
	}
	if _, err := s.authorizeOperation(ctx, doc.OperationID, models.OperationRoleOperator); err != nil {
		return toolResult{}, err
	}

	watchers, err := s.writeBody(ctx, doc, args.Content, wiki.ApplyAppend)
	if err != nil {
		return toolResult{}, err
	}

	return toolResult{
		Payload:     appendResult(doc, watchers),
		OperationID: &doc.OperationID,
		SubjectID:   doc.DocumentID,
		SubjectKind: models.SubjectKindWikiDocument,
		SubjectName: doc.Title,
		Summary:     fmt.Sprintf("added a section to %s", doc.Title),
	}, nil
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
	doc, err := s.deps.WikiDocs.WikiDocument(ctx, args.DocumentID)
	if err != nil {
		return toolResult{}, fmt.Errorf("wiki page not found")
	}
	if _, err := s.authorizeOperation(ctx, doc.OperationID, models.OperationRoleOperator); err != nil {
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
			"that exact text is not on %q. Read it with get_wiki_document and copy the snippet "+
				"from what it returns — whitespace and list markers have to match exactly.",
			doc.Title)
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
		wikiDocView
		Replacements int    `json:"replacements"`
		Watchers     int    `json:"watchers"`
		Note         string `json:"note,omitempty"`
	}{
		wikiDocView:  toWikiDocView(doc),
		Replacements: replacements,
		Watchers:     watchers,
	}
	if watchers > 0 {
		payload.Note = "The operator has this page open and saw your edit appear."
	}

	return toolResult{
		Payload:     payload,
		OperationID: &doc.OperationID,
		SubjectID:   doc.DocumentID,
		SubjectKind: models.SubjectKindWikiDocument,
		SubjectName: doc.Title,
		Summary:     fmt.Sprintf("edited wiki page %s", doc.Title),
	}, nil
}

func handleUpdateWikiDocument(ctx context.Context, s *Server, args updateWikiDocumentArgs) (toolResult, error) {
	doc, err := s.deps.WikiDocs.WikiDocument(ctx, args.DocumentID)
	if err != nil {
		return toolResult{}, fmt.Errorf("wiki page not found")
	}
	if _, err := s.authorizeOperation(ctx, doc.OperationID, models.OperationRoleOperator); err != nil {
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
		Payload:     appendResult(doc, watchers),
		OperationID: &doc.OperationID,
		SubjectID:   doc.DocumentID,
		SubjectKind: models.SubjectKindWikiDocument,
		SubjectName: doc.Title,
		Summary:     fmt.Sprintf("rewrote wiki page %s", doc.Title),
	}, nil
}

// appendResult tells the agent whether anyone actually watched the edit land.
// It matters: an edit somebody saw appear needs no announcement, and one that
// happened to an empty room might be worth mentioning to the operator later.
func appendResult(doc *models.WikiDocument, watchers int) any {
	view := struct {
		wikiDocView
		Watchers int    `json:"watchers"`
		Note     string `json:"note,omitempty"`
	}{wikiDocView: toWikiDocView(doc), Watchers: watchers}

	if watchers > 0 {
		view.Note = "The operator has this page open and saw your edit appear."
	}
	return view
}

// documentMarkdown renders a document's body as Markdown.
//
// It deliberately does NOT return WikiDocument.Content. That field is a
// plain-text search projection written by the sidecar — headings, lists and
// links are flattened and inline marks come out as pseudo-tags like <code>.
// Handing it to an agent as "the Markdown body" was wrong twice over: the
// agent reasons over degraded text, and update_wiki_document asks it to read
// a page and send the whole thing back, so a read-modify-write through these
// tools would have written those pseudo-tags in as literal text and destroyed
// every heading and list on the page.
//
// content_state is the authoritative body, so it is converted back through
// the same sidecar that wrote it. Falls back to the projection only for
// legacy rows that have no CRDT state at all, where degraded text still beats
// nothing.
func (s *Server) documentMarkdown(ctx context.Context, doc *models.WikiDocument) string {
	if len(doc.ContentState) == 0 || s.deps.Hocuspocus == nil {
		return doc.Content
	}
	markdown, err := s.deps.Hocuspocus.YjsToMarkdown(ctx, doc.ContentState)
	if err != nil {
		s.deps.Logger.Warn("mcp: failed to render wiki body as markdown, falling back to the search projection",
			zap.String("document_id", doc.DocumentID.String()), zap.Error(err))
		return doc.Content
	}
	return markdown
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
	if s.deps.Hocuspocus == nil {
		return 0, fmt.Errorf("wiki writing is unavailable: the collaboration service is not configured")
	}

	result, err := s.deps.Hocuspocus.ApplyMarkdown(ctx, doc.DocumentID.String(), body, mode)
	if err != nil {
		s.deps.Logger.Warn("mcp: failed to apply wiki edit",
			zap.String("document_id", doc.DocumentID.String()),
			zap.String("mode", string(mode)), zap.Error(err))
		return 0, fmt.Errorf("failed to save the page: %w", err)
	}

	return result.Watchers, nil
}
