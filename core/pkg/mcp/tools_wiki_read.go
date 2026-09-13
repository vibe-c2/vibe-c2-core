package mcp

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.uber.org/zap"
)

type searchWikiArgs struct {
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation id; omit for the operator's current one."`
	Search      string `json:"search,omitempty"       jsonschema:"Free-text match against title and body."`
	Limit       int    `json:"limit,omitempty"        jsonschema:"Page size, max 50."`
	Cursor      string `json:"cursor,omitempty"       jsonschema:"nextCursor from the previous page."`
}

type listWikiTreeArgs struct {
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation id; omit for the operator's current one."`
	ParentID    string `json:"parent_id,omitempty"    jsonschema:"Only this page's subtree."`
	Depth       int    `json:"depth,omitempty"        jsonschema:"Levels to include below the root or parent_id; default 2, -1 for all."`
	Limit       int    `json:"limit,omitempty"        jsonschema:"Page size, max 250."`
	Cursor      string `json:"cursor,omitempty"       jsonschema:"nextCursor from the previous page."`
}

type getWikiDocumentArgs struct {
	DocumentID string `json:"document_id" jsonschema:"Page id."`
	Outline    bool   `json:"outline,omitempty" jsonschema:"Return headings and section sizes instead of text."`
	Section    string `json:"section,omitempty" jsonschema:"Return only this heading and what nests under it, as the outline names it."`
	Full       bool   `json:"full,omitempty"    jsonschema:"Return the whole body even when the page is large. Pages over 8 KB otherwise return their outline."`
}

func registerWikiTools(s *Server) {
	register(s, &mcp.Tool{
		Name: "search_wiki",
		Description: "Search wiki pages by title and body. Each hit carries a snippet of the " +
			"matching text, usually enough to pick the page without opening it.",
	}, readTool, handleSearchWiki)

	register(s, &mcp.Tool{
		Name: "list_wiki_tree",
		Description: "The page tree, depth-first: titles, parents, icons and child counts. Two " +
			"levels by default; pass parent_id to descend or depth:-1 for everything.",
	}, readTool, handleListWikiTree)

	register(s, &mcp.Tool{
		Name: "list_wiki_templates",
		Description: "Page templates to start from: the operation's own plus the shared ones " +
			"in the Public wiki (marked shared). Check before writing a page from scratch.",
	}, readTool, handleListWikiTemplates)

	register(s, &mcp.Tool{
		Name: "set_wiki_template",
		Description: "Mark a page as a reusable template, or unmark it. Templates are a team " +
			"convention: propose this rather than deciding alone.",
	}, writeTool, handleSetWikiTemplate)

	register(s, &mcp.Tool{
		Name: "get_wiki_document",
		Description: "One wiki page as Markdown. Small pages return their body; pages over 8 KB " +
			"return an outline instead, so pass section:\"<heading>\" for the part you need " +
			"or full:true for everything.",
	}, readTool, handleGetWikiDocument)

	register(s, &mcp.Tool{
		Name: "create_wiki_document",
		Description: "Create a wiki page, from Markdown content or from a template " +
			"(template_id).",
	}, writeTool, handleCreateWikiDocument)

	register(s, &mcp.Tool{
		Name: "add_wiki_section",
		Description: "Add Markdown to the end (or start) of one or more pages without touching " +
			"what is there. Safe while the operator is editing the page.",
	}, writeTool, handleAddWikiSection)

	register(s, &mcp.Tool{
		Name: "edit_wiki_document",
		Description: "Replace an exact snippet on a page, like editing a source file. The tool " +
			"for almost every edit; a non-matching snippet is refused with what differs.",
	}, writeTool, handleEditWikiDocument)

	register(s, &mcp.Tool{
		Name: "update_wiki_document",
		Description: "Replace a page's whole body. Only for a deliberate end-to-end rewrite: " +
			"read the page first, because anything omitted is deleted.",
	}, writeTool, handleUpdateWikiDocument)
}

func handleSearchWiki(ctx context.Context, s *Server, args searchWikiArgs) (toolResult, error) {
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleViewer)
	if err != nil {
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
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleViewer)
	if err != nil {
		return toolResult{}, err
	}

	offset, err := decodeTreeCursor(args.Cursor)
	if err != nil {
		return toolResult{}, err
	}
	// JSON cannot tell an omitted depth from 0, so 0 means the default and a
	// negative value means every level.
	depth := args.Depth
	switch {
	case depth == 0:
		depth = treeDefaultDepth
	case depth < 0:
		depth = 0
	}

	docs, err := s.wikiSummaries(ctx, opID, false)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to read wiki tree: %w", err)
	}

	var root *uuid.UUID
	if args.ParentID != "" {
		id, err := parseUUIDArg(args.ParentID, "parent_id")
		if err != nil {
			return toolResult{}, err
		}
		found := false
		for _, d := range docs {
			if d.DocumentID == id {
				found = true
				break
			}
		}
		if !found {
			return toolResult{}, refuse("parent_id %s is not a page in this operation.", args.ParentID)
		}
		root = &id
	}

	rows, beyondDepth := flattenTree(docs, root, depth)
	result, err := treePage(rows, offset, clampTreePageSize(args.Limit))
	if err != nil {
		return toolResult{}, err
	}
	if beyondDepth > 0 {
		result.Notes = append(result.Notes, fmt.Sprintf(
			"%d page(s) sit deeper than depth %d and are not shown. Pass parent_id to descend, "+
				"or depth:-1 for everything.", beyondDepth, depth))
	}

	return toolResult{
		Payload:     result,
		OperationID: &opID,
		Summary:     fmt.Sprintf("listed %d of %d wiki pages", result.Returned, len(rows)),
	}, nil
}

// wikiSummaries lists an operation's active pages without their bodies.
// Through the projection when the repository is wired, through the resolver
// otherwise (tests), and authorization has already happened in the caller.
func (s *Server) wikiSummaries(ctx context.Context, opID uuid.UUID, templatesOnly bool) ([]models.WikiDocument, error) {
	if s.deps.WikiDocRepo != nil {
		return s.deps.WikiDocRepo.FindSummariesByOperationID(ctx, opID, templatesOnly)
	}
	var (
		docs []*models.WikiDocument
		err  error
	)
	if templatesOnly {
		docs, err = s.deps.WikiDocs.WikiTemplates(ctx, opID.String())
	} else {
		docs, err = s.deps.WikiDocs.WikiDocumentTree(ctx, opID.String())
	}
	if err != nil {
		return nil, err
	}
	out := make([]models.WikiDocument, 0, len(docs))
	for _, d := range docs {
		out = append(out, *d)
	}
	return out, nil
}

func handleGetWikiDocument(ctx context.Context, s *Server, args getWikiDocumentArgs) (toolResult, error) {
	doc, err := s.loadWikiDocument(ctx, args.DocumentID, models.OperationRoleViewer)
	if err != nil {
		return toolResult{}, err
	}

	markdown := s.documentMarkdown(ctx, doc)

	if args.Outline {
		return outlineResult(doc, markdown), nil
	}
	if args.Section != "" {
		return sectionResult(doc, markdown, args.Section)
	}
	if outlineByDefault(args, markdown) {
		result := outlineResult(doc, markdown)
		result.Payload = withNote(result.Payload.(wikiOutlineView), fmt.Sprintf(
			"Outline returned instead of the body because this page is %d bytes. "+
				"Fetch one part with section:\"<heading>\", or the whole page with full:true.",
			len(markdown)))
		return result, nil
	}

	body, truncated := truncateBody(markdown)
	view := wikiDocDetailView{
		wikiDocView: toWikiDocView(doc),
		Content:     body,
		UpdatedAt:   formatTime(doc.UpdateAt),
		Truncated:   truncated,
	}
	// A big page that reached here has no headings (or full:true was passed),
	// so the section path cannot help; say so only when it could.
	if !args.Full && len(markdown) > outlineHintBytes {
		view.Notes = append(view.Notes,
			"This page has no headings, so it cannot be read in sections.")
	}

	return toolResult{
		Payload:     view,
		OperationID: &doc.OperationID,
		Summary:     fmt.Sprintf("read wiki page %s", doc.Title),
	}, nil
}

// outlineHintBytes is where a default read switches from body to outline.
// Set around the point a page stops being something you would read whole.
const outlineHintBytes = 8 * 1024

// outlineByDefault decides whether a plain read is answered with the outline.
//
// A large page with headings is, unless the caller insisted on the body.
// Sending 40 KB and then suggesting the cheaper read afterwards charged the
// agent for the advice; this way the default read of a big page costs a few
// hundred bytes and the agent chooses what to fetch next. A page without
// headings has no sections to offer, so it is sent whole.
func outlineByDefault(args getWikiDocumentArgs, markdown string) bool {
	if args.Full || args.Outline || args.Section != "" {
		return false
	}
	return len(markdown) > outlineHintBytes && hasHeadings(markdown)
}

// withNote prepends a note so it is the first thing the agent reads.
func withNote(view wikiOutlineView, note string) wikiOutlineView {
	view.Notes = append([]string{note}, view.Notes...)
	return view
}

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
			"Section sizes include nested sections.")
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
		"One section, not the whole page: change it with edit_wiki_document, never update_wiki_document.")
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
//
// Rendered text is cached per document against the state's persistence stamp
// (wiki_markdown_cache.go), so repeated reads of one page cost one sidecar
// round trip rather than one per read.
func (s *Server) documentMarkdown(ctx context.Context, doc *models.WikiDocument) string {
	if len(doc.ContentState) == 0 || s.deps.Hocuspocus == nil {
		return doc.Content
	}
	if markdown, hit := s.cachedMarkdown(ctx, doc); hit {
		return markdown
	}
	markdown, err := s.deps.Hocuspocus.YjsToMarkdown(ctx, doc.ContentState)
	if err != nil {
		s.deps.Logger.Warn("mcp: failed to render wiki body as markdown, falling back to the search projection",
			zap.String("document_id", doc.DocumentID.String()), zap.Error(err))
		return doc.Content
	}
	s.rememberMarkdown(ctx, doc, markdown)
	return markdown
}
