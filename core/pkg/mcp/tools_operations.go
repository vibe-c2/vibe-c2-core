package mcp

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.uber.org/zap"
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

	views := make([]operationView, 0, len(ops)+1)
	for i := range ops {
		op := &ops[i]
		if !agent.AllowsOperation(op.OperationID) {
			continue
		}
		views = append(views, toOperationView(op, cappedRoleFor(auth, op)))
	}

	// The Public operation is synthetic: nobody is a member, so it never comes
	// back from a membership query and an agent had no way to learn it exists.
	// It was reachable the whole time — every authenticated caller is an
	// implicit operator there — which is the worst combination: usable, and
	// undiscoverable except by being handed the id.
	//
	// Listed whatever the key's operation scope is. Public is not one of the
	// owner's operations — it is a shared space every authenticated user
	// already has — so narrowing a key to an engagement says nothing about it.
	// AllowsOperation encodes that; the call stays for the same reason the
	// role cap stays, as the one place that decides reachability.
	if agent.AllowsOperation(models.PublicOperationID) {
		public := models.SynthesizePublicOperation()
		view := toOperationView(&public, cappedRoleFor(auth, &public))
		view.Description = "Shared across every operation. Anyone authenticated can read and write here."
		views = append(views, view)
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

	// Each count is a one-row fetch: the connections carry TotalCount, so this
	// is one query per kind rather than a full listing.
	//
	// One row, not zero. `first: 0` is rejected by pagination.ParseArgs as
	// "must be positive", and an earlier version swallowed that error and
	// reported the count as 0 — so every count in this summary was silently
	// zero, which an agent would read as "this operation is empty". A failed
	// count must never be indistinguishable from a real one.
	const probe = 1

	count := func(kind string, fn func() (int, error)) int {
		n, err := fn()
		if err != nil {
			s.deps.Logger.Warn("mcp: operation summary count failed",
				zap.String("kind", kind), zap.Error(err))
			summary.Notes = append(summary.Notes,
				fmt.Sprintf("Could not count %s — treat that number as unknown, not zero.", kind))
			return 0
		}
		return n
	}

	first := probe
	summary.Hosts = count("hosts", func() (int, error) {
		conn, err := s.deps.Hosts.Hosts(ctx, idStr, nil, nil, nil, &first, nil, nil, nil)
		if err != nil {
			return 0, err
		}
		return conn.TotalCount, nil
	})
	summary.Credentials = count("credentials", func() (int, error) {
		conn, err := s.deps.Credentials.Credentials(ctx, idStr, nil, nil, nil, nil, nil, nil, nil, &first, nil, nil, nil)
		if err != nil {
			return 0, err
		}
		return conn.TotalCount, nil
	})
	summary.Hashes = count("hashes", func() (int, error) {
		conn, err := s.deps.Hashes.Hashes(ctx, idStr, nil, nil, nil, nil, &first, nil, nil, nil)
		if err != nil {
			return 0, err
		}
		return conn.TotalCount, nil
	})
	summary.OpenTasks = count("open tasks", func() (int, error) {
		done := models.TaskStageDone
		conn, err := s.deps.Tasks.Tasks(ctx, idStr, nil, []models.TaskStage{done}, nil, nil, nil, nil, nil, &first, nil, nil, nil)
		if err != nil {
			return 0, err
		}
		return conn.TotalCount, nil
	})
	summary.WikiPages = count("wiki pages", func() (int, error) {
		tree, err := s.deps.WikiDocs.WikiDocumentTree(ctx, idStr)
		if err != nil {
			return 0, err
		}
		return len(tree), nil
	})

	return toolResult{
		Payload:     summary,
		OperationID: &opID,
		Summary:     fmt.Sprintf("summarized operation %s", op.Name),
	}, nil
}
