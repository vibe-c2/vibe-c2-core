package mcp

import (
	"context"
	"fmt"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
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
}

type createWikiDocumentArgs struct {
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation to create the page in. Defaults to whatever the operator currently has open."`
	Title       string `json:"title"                  jsonschema:"Page title."`
	Content     string `json:"content,omitempty"      jsonschema:"Page body as Markdown."`
	ParentID    string `json:"parent_id,omitempty"    jsonschema:"Create as a child of this page."`
}

type updateWikiDocumentArgs struct {
	DocumentID string `json:"document_id"       jsonschema:"The page to rewrite."`
	Content    string `json:"content"           jsonschema:"The new body as Markdown. This REPLACES the page, so read it first and send the whole thing back."`
	Title      string `json:"title,omitempty"   jsonschema:"Optionally rename the page at the same time."`
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
		Name:        "get_wiki_document",
		Description: "One wiki page's full Markdown body.",
	}, readTool, handleGetWikiDocument)

	register(s, &mcp.Tool{
		Name: "create_wiki_document",
		Description: "Create a wiki page with Markdown content. Prefer this over rewriting an " +
			"existing page when you are adding something new.",
	}, writeTool, handleCreateWikiDocument)

	register(s, &mcp.Tool{
		Name: "update_wiki_document",
		Description: "Replace a wiki page's body. Read the page first and send back the whole " +
			"document — this overwrites rather than merges. Refused while somebody has the " +
			"page open in the editor.",
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

func handleGetWikiDocument(ctx context.Context, s *Server, args getWikiDocumentArgs) (toolResult, error) {
	doc, err := s.deps.WikiDocs.WikiDocument(ctx, args.DocumentID)
	if err != nil {
		return toolResult{}, fmt.Errorf("wiki page not found")
	}
	if _, err := s.authorizeOperation(ctx, doc.OperationID, models.OperationRoleViewer); err != nil {
		return toolResult{}, err
	}

	body, truncated := truncateBody(doc.Content)
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
	doc, err := s.deps.WikiDocs.CreateWikiDocument(ctx, opID.String(), model.CreateWikiDocumentInput{
		Title:            args.Title,
		ParentDocumentID: optionalString(args.ParentID),
	})
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to create wiki page: %w", err)
	}

	if args.Content != "" {
		if err := s.writeBody(ctx, doc, args.Content); err != nil {
			return toolResult{}, err
		}
	}

	return toolResult{
		Payload:     toWikiDocView(doc),
		OperationID: &opID,
		Summary:     fmt.Sprintf("created wiki page %s", doc.Title),
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

	// Refuse while anyone has the page open.
	//
	// A live editor holds the authoritative Y.Doc in memory. Replacing
	// content_state underneath it does not merge — the next keystroke stores
	// that client's state and this write is gone, or worse, the reader watches
	// their document mutate mid-sentence. There is no safe overwrite here, so
	// the tool refuses rather than racing.
	if editors := s.deps.Presence.GetPresence(doc.DocumentID); len(editors) > 0 {
		names := make([]string, 0, len(editors))
		for _, e := range editors {
			names = append(names, e.Username)
		}
		return toolResult{}, fmt.Errorf(
			"%s has %q open in the editor right now; try again once they are done, or create a child page instead",
			names[0], doc.Title)
	}

	if args.Title != "" && args.Title != doc.Title {
		if _, err := s.deps.WikiDocs.UpdateWikiDocument(ctx, args.DocumentID, model.UpdateWikiDocumentInput{
			Title: &args.Title,
		}); err != nil {
			return toolResult{}, fmt.Errorf("failed to rename wiki page: %w", err)
		}
	}

	if err := s.writeBody(ctx, doc, args.Content); err != nil {
		return toolResult{}, err
	}

	return toolResult{
		Payload:     toWikiDocView(doc),
		OperationID: &doc.OperationID,
		Summary:     fmt.Sprintf("rewrote wiki page %s", doc.Title),
	}, nil
}

// writeBody persists a Markdown body as both the searchable text and the Y.js
// CRDT state.
//
// Writing only Content would be silently destructive: the Hocuspocus
// persistence layer seeds an editor from content_state and returns null when
// it is absent, so a page written that way opens EMPTY and the first
// keystroke stores that empty document over the agent's work. Converting
// through the sidecar first is what the Outline importer does, for exactly
// this reason.
func (s *Server) writeBody(ctx context.Context, doc *models.WikiDocument, body string) error {
	if s.deps.Hocuspocus == nil {
		return fmt.Errorf("wiki writing is unavailable: the collaboration service is not configured")
	}

	contentState, err := s.deps.Hocuspocus.MarkdownToYjs(ctx, body)
	if err != nil {
		s.deps.Logger.Warn("mcp: markdown-to-yjs conversion failed",
			zap.String("document_id", doc.DocumentID.String()), zap.Error(err))
		return fmt.Errorf("failed to convert the Markdown for storage: %w", err)
	}

	now := time.Now().UTC()
	if err := s.deps.WikiDocumentRepo.Update(ctx, doc, map[string]interface{}{
		"content":          body,
		"content_state":    contentState,
		"content_state_at": now,
		"last_updated_at":  now,
	}); err != nil {
		return fmt.Errorf("failed to save the page: %w", err)
	}

	doc.Content = body
	return nil
}
