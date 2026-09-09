package mcp

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

type listOperationsArgs struct{}

type getOperationSummaryArgs struct {
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation to summarize. Defaults to whatever the operator currently has open."`
}

type operationSummary struct {
	Operation   operationView `json:"operation"`
	Hosts       int           `json:"hosts"`
	Credentials int           `json:"credentials"`
	Hashes      int           `json:"hashes"`
	OpenTasks   int           `json:"openTasks"`
	WikiPages   int           `json:"wikiPages"`
	Notes       []string      `json:"notes,omitempty"`
}

func registerOperationTools(s *Server) {
	register(s, &mcp.Tool{
		Name: "list_operations",
		Description: "List the operations this agent key can act in. Start here when you " +
			"do not know which operation to work on, or when a tool asks for an operation_id.",
	}, readTool, handleListOperations)

	register(s, &mcp.Tool{
		Name: "get_operation_summary",
		Description: "Counts of hosts, credentials, hashes, open tasks and wiki pages for one " +
			"operation. A cheap way to orient before deciding what to look at in detail.",
	}, readTool, handleGetOperationSummary)
}

// handleListOperations returns the intersection the key can actually reach:
// the owner's memberships, filtered by the key's scope list. Listing anything
// broader would invite the agent to spend calls on operations it will be
// refused from.
func handleListOperations(ctx context.Context, s *Server, _ listOperationsArgs) (toolResult, error) {
	auth := gqlctx.AuthFromContext(ctx)
	agent, err := agentFromContext(ctx)
	if err != nil {
		return toolResult{}, err
	}

	ownerID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return toolResult{}, fmt.Errorf("invalid caller id")
	}

	ops, err := s.deps.OperationRepo.FindByMemberID(ctx, ownerID)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to list operations: %w", err)
	}

	views := make([]operationView, 0, len(ops))
	for i := range ops {
		op := &ops[i]
		if !agent.AllowsOperation(op.OperationID) {
			continue
		}
		views = append(views, toOperationView(op, cappedRoleFor(auth, op)))
	}

	notes := []string{}
	if len(agent.OperationScopes) > 0 {
		notes = append(notes, "This key is scoped to specific operations; others the operator belongs to are not listed.")
	}

	result, err := newPage(views, "", notes...)
	if err != nil {
		return toolResult{}, err
	}
	return toolResult{
		Payload: result,
		Summary: fmt.Sprintf("listed %d operations", len(views)),
	}, nil
}

// cappedRoleFor reports the role the AGENT has, not the owner's — the agent
// needs to know what it can do, and telling it "admin" when its key is capped
// to viewer would have it plan work that will be refused.
func cappedRoleFor(auth gqlctx.AuthInfo, op *models.Operation) string {
	if auth.Agent == nil {
		return ""
	}
	if models.IsPublicOperation(op.OperationID) {
		return string(models.CapRole(models.OperationRoleOperator, auth.Agent.MaxRole))
	}
	for _, m := range op.Members {
		if m.UserID.String() == auth.UserID {
			return string(models.CapRole(m.Role, auth.Agent.MaxRole))
		}
	}
	return ""
}

func handleGetOperationSummary(ctx context.Context, s *Server, args getOperationSummaryArgs) (toolResult, error) {
	opID, err := s.resolveOperation(ctx, args.OperationID)
	if err != nil {
		return toolResult{}, err
	}
	op, err := s.authorizeOperation(ctx, opID, models.OperationRoleViewer)
	if err != nil {
		return toolResult{}, err
	}

	auth := gqlctx.AuthFromContext(ctx)
	summary := operationSummary{Operation: toOperationView(&op, cappedRoleFor(auth, &op))}
	idStr := opID.String()

	// Each count is a first-page fetch with the cheapest possible size; the
	// connections carry TotalCount, so this is one query per kind rather than
	// a full listing.
	zero := 0
	if conn, err := s.deps.Hosts.Hosts(ctx, idStr, nil, nil, nil, &zero, nil, nil, nil); err == nil {
		summary.Hosts = conn.TotalCount
	}
	if conn, err := s.deps.Credentials.Credentials(ctx, idStr, nil, nil, nil, nil, nil, nil, nil, &zero, nil, nil, nil); err == nil {
		summary.Credentials = conn.TotalCount
	}
	if conn, err := s.deps.Hashes.Hashes(ctx, idStr, nil, nil, nil, nil, &zero, nil, nil, nil); err == nil {
		summary.Hashes = conn.TotalCount
	}
	done := models.TaskStageDone
	if conn, err := s.deps.Tasks.Tasks(ctx, idStr, nil, []models.TaskStage{done}, nil, nil, nil, nil, nil, &zero, nil, nil, nil); err == nil {
		summary.OpenTasks = conn.TotalCount
	}
	if tree, err := s.deps.WikiDocs.WikiDocumentTree(ctx, idStr); err == nil {
		summary.WikiPages = len(tree)
	}

	return toolResult{
		Payload:     summary,
		OperationID: &opID,
		Summary:     fmt.Sprintf("summarized operation %s", op.Name),
	}, nil
}
