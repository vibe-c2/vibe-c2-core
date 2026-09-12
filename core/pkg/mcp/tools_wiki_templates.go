package mcp

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

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

func handleListWikiTemplates(ctx context.Context, s *Server, args listWikiTemplatesArgs) (toolResult, error) {
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleViewer)
	if err != nil {
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
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleOperator)
	if err != nil {
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
		Summary:     fmt.Sprintf("created %s from template %s", doc.Title, template.Title),
	}, nil
}

func handleSetWikiTemplate(ctx context.Context, s *Server, args setWikiTemplateArgs) (toolResult, error) {
	doc, err := s.loadWikiDocument(ctx, args.DocumentID, models.OperationRoleOperator)
	if err != nil {
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
		Summary:     fmt.Sprintf("%s %s", doc.Title, verb),
	}, nil
}
