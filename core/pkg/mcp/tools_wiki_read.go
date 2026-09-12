package mcp

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
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

type getWikiDocumentArgs struct {
	DocumentID string `json:"document_id" jsonschema:"The page's id, from search_wiki or list_wiki_tree."`
	Outline    bool   `json:"outline,omitempty" jsonschema:"Return the page's heading outline and the size of each section instead of its text. Cheap way to see how a large page is organized before deciding what to read."`
	Section    string `json:"section,omitempty" jsonschema:"Return only this heading and everything nested under it. Give the heading text as the outline reports it, without the leading #. Ignored when outline is set."`
}

func registerWikiTools(s *Server) {
	register(s, &mcp.Tool{
		Name: "search_wiki",
		Description: "Search the operation's wiki pages by title and body. Each hit carries a " +
			"snippet of the matching text, so you can usually tell which page you want " +
			"without opening any of them.",
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
		Name: "get_wiki_document",
		Description: "One wiki page as Markdown. By default the whole body; pass outline:true " +
			"for just its headings and their sizes, or section:\"<heading>\" for one part of " +
			"it. On a large page, outline then section is far cheaper than reading it whole.",
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
			"editing the same page, and they will see your text appear as you write it. " +
			"Pass document_ids to add the same content to several pages in one call.",
	}, writeTool, handleAppendWikiSection)

	register(s, &mcp.Tool{
		Name: "prepend_wiki_section",
		Description: "Add Markdown to the START of a wiki page without touching what is already " +
			"there — a status banner, a summary above existing notes. Same safety as " +
			"append_wiki_section, and the reason not to reach for update_wiki_document just " +
			"to put a line at the top. Pass document_ids for several pages in one call.",
	}, writeTool, handlePrependWikiSection)

	register(s, &mcp.Tool{
		Name: "edit_wiki_document",
		Description: "Change part of a page by replacing an exact snippet, the way you would " +
			"edit a source file. Send only the text that changes, not the whole page. This is " +
			"the tool for almost every edit — reach for update_wiki_document only when you are " +
			"deliberately rewriting a page end to end. If the snippet does not match, the " +
			"refusal says how it differs.",
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

	views := make([]wikiSearchHitView, 0, len(conn.Edges))
	for _, edge := range conn.Edges {
		views = append(views, wikiSearchHitView{
			wikiDocView: toWikiDocView(edge.Node),
			// From the already-loaded search projection, so this costs no
			// extra I/O — see wiki_snippet.go.
			Snippet: buildSnippet(edge.Node.Content, args.Search),
		})
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

func handleGetWikiDocument(ctx context.Context, s *Server, args getWikiDocumentArgs) (toolResult, error) {
	doc, err := s.deps.WikiDocs.WikiDocument(ctx, args.DocumentID)
	if err != nil {
		return toolResult{}, fmt.Errorf("wiki page not found")
	}
	if _, err := s.authorizeOperation(ctx, doc.OperationID, models.OperationRoleViewer); err != nil {
		return toolResult{}, err
	}

	markdown := s.documentMarkdown(ctx, doc)

	if args.Outline {
		return outlineResult(doc, markdown), nil
	}
	if args.Section != "" {
		return sectionResult(doc, markdown, args.Section)
	}

	body, truncated := truncateBody(markdown)
	view := wikiDocDetailView{
		wikiDocView: toWikiDocView(doc),
		Content:     body,
		UpdatedAt:   formatTime(doc.UpdateAt),
		Truncated:   truncated,
	}
	// Point at the cheaper read rather than waiting to be asked. A page big
	// enough to notice is a page the agent will read repeatedly, and it has
	// no way to know the option exists unless a full read says so.
	if len(markdown) > outlineHintBytes {
		view.Notes = append(view.Notes, fmt.Sprintf(
			"This page is %d bytes. To read part of it, call get_wiki_document again with "+
				"outline:true for its headings, then section:\"<heading>\" for the part you need.",
			len(markdown)))
	}

	return toolResult{
		Payload:     view,
		OperationID: &doc.OperationID,
		Summary:     fmt.Sprintf("read wiki page %s", doc.Title),
	}, nil
}

// outlineHintBytes is where a full read starts advertising the cheaper one.
// Set around the point a page stops being something you would read whole.
const outlineHintBytes = 8 * 1024

func outlineResult(doc *models.WikiDocument, markdown string) toolResult {
	view := wikiOutlineView{
		wikiDocView: toWikiDocView(doc),
		UpdatedAt:   formatTime(doc.UpdateAt),
		Bytes:       len(markdown),
		Outline:     buildOutline(markdown),
	}

	switch {
	case len(view.Outline) == 0:
		// Otherwise an empty outline reads as an empty page, and the agent
		// concludes there is nothing there when the text simply has no
		// headings to hang an outline on.
		view.Notes = append(view.Notes,
			"This page has no headings, so there is nothing to outline and no section to "+
				"fetch. Read it without outline to get the text.")
	default:
		if pre := preambleBytes(markdown); pre > 0 {
			view.Notes = append(view.Notes, fmt.Sprintf(
				"%d bytes sit above the first heading and are in no section.", pre))
		}
		view.Notes = append(view.Notes,
			"Section sizes include everything nested underneath, so they do not sum to the "+
				"page size. Fetch one with section:\"<heading>\".")
	}

	return toolResult{
		Payload:     view,
		OperationID: &doc.OperationID,
		Summary:     fmt.Sprintf("read the outline of %s", doc.Title),
	}
}

func sectionResult(doc *models.WikiDocument, markdown, heading string) (toolResult, error) {
	text, matches := sliceSection(markdown, heading)
	if matches == 0 {
		if available := headingList(markdown); available != "" {
			return toolResult{}, refuse(
				"%q has no heading %q. Its headings are: %s.", doc.Title, heading, available)
		}
		return toolResult{}, refuse(
			"%q has no headings at all, so there is no section to fetch. Read it without "+
				"the section argument.", doc.Title)
	}

	body, truncated := truncateBody(text)
	view := wikiDocDetailView{
		wikiDocView: toWikiDocView(doc),
		Content:     body,
		UpdatedAt:   formatTime(doc.UpdateAt),
		Truncated:   truncated,
		Section:     heading,
	}
	// The dangerous misreading of a section fetch is treating it as the page.
	// Saying so on every one is cheap; the mistake deletes a page.
	view.Notes = append(view.Notes,
		"This is one section, not the whole page. Change it with edit_wiki_document — "+
			"passing this to update_wiki_document would delete everything else.")
	if matches > 1 {
		view.Notes = append(view.Notes, fmt.Sprintf(
			"%d sections share this heading; this is the first.", matches))
	}

	return toolResult{
		Payload:     view,
		OperationID: &doc.OperationID,
		Summary:     fmt.Sprintf("read section %q of %s", heading, doc.Title),
	}, nil
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
