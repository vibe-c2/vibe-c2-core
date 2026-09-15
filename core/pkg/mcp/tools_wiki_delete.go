package mcp

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

type deleteWikiDocumentArgs struct {
	IdempotencyKey
	DocumentID   string `json:"document_id"             jsonschema:"Page id."`
	WithChildren bool   `json:"with_children,omitempty" jsonschema:"Also move every page under it to the trash. Without this a page with children is refused."`
}

// deleteWikiDocumentView is what the agent gets back: the page that went to
// the trash and how many pages went with it, so it can tell the operator
// exactly what is recoverable there.
type deleteWikiDocumentView struct {
	wikiDocView
	// Descendants is the number of pages below this one that were trashed
	// with it. Zero for a leaf.
	Descendants int `json:"descendants"`
}

// handleDeleteWikiDocument moves a page to the trash.
//
// This is the same soft delete the operator gets from the page menu: the
// page and everything under it go to the trash with a pre-delete backup,
// and an admin can restore or purge them there. That safety net is what
// makes it acceptable to hand the action to an agent at all.
//
// Two guards on top of the resolver's own checks. A page with children is
// refused unless the agent says with_children, because the cascade is the
// easy thing to miss: "delete the stale host page" should not take a subnet
// with it. A template is refused outright; it is a team convention, and
// removing one is the same kind of decision as making one.
func handleDeleteWikiDocument(ctx context.Context, s *Server, args deleteWikiDocumentArgs) (toolResult, error) {
	doc, err := s.loadWikiDocument(ctx, args.DocumentID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}
	if doc.DeletedAt != nil {
		return toolResult{}, refuse("%q is already in the trash.", doc.Title)
	}
	if doc.IsTemplate {
		return toolResult{}, refuse("%q is a template; deleting one is a team decision. Propose it as a task instead.", doc.Title)
	}

	descendants, err := s.countWikiDescendants(ctx, doc)
	if err != nil {
		return toolResult{}, err
	}
	if descendants > 0 && !args.WithChildren {
		return toolResult{}, refuse(
			"%q has %d page(s) under it that would go to the trash with it. Pass with_children:true to confirm, or move their content first.",
			doc.Title, descendants)
	}

	if _, err := s.deps.WikiDocs.DeleteWikiDocument(ctx, args.DocumentID); err != nil {
		return toolResult{}, fmt.Errorf("failed to delete wiki page: %w", err)
	}

	summary := fmt.Sprintf("moved %s to the trash", doc.Title)
	if descendants > 0 {
		summary = fmt.Sprintf("moved %s and %d page(s) under it to the trash", doc.Title, descendants)
	}
	return toolResult{
		Payload:     deleteWikiDocumentView{wikiDocView: toWikiDocView(doc), Descendants: descendants},
		OperationID: &doc.OperationID,
		Summary:     summary + "; an admin can restore it from there",
	}, nil
}

// countWikiDescendants counts the active pages below doc, at any depth.
//
// Read from the operation's tree rather than a dedicated repository call: the
// MCP layer only sees the resolver, and the tree is one query it already
// makes for list_wiki_tree.
func (s *Server) countWikiDescendants(ctx context.Context, doc *models.WikiDocument) (int, error) {
	tree, err := s.deps.WikiDocs.WikiDocumentTree(ctx, doc.OperationID.String())
	if err != nil {
		return 0, fmt.Errorf("failed to read wiki tree: %w", err)
	}
	return countDescendantsIn(tree, doc.DocumentID), nil
}

// countDescendantsIn counts the pages in docs whose ancestor path contains id.
func countDescendantsIn(docs []*models.WikiDocument, id uuid.UUID) int {
	n := 0
	for _, d := range docs {
		for _, ancestor := range d.PathIDs {
			if ancestor == id {
				n++
				break
			}
		}
	}
	return n
}
