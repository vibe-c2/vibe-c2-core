package mcp

import (
	"context"
	"fmt"
	"sort"
	"sync"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

type listOperationsArgs struct{}

type getOperationSummaryArgs struct {
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation id; omit for the operator's current one."`
}

type operationSummary struct {
	Operation operationView `json:"operation"`
	operationCounts
	Notes []string `json:"notes,omitempty"`
}

// operationCounts is the shape of an operation in numbers. Shared by
// get_operation_summary and get_user_focus, so orienting is one call.
type operationCounts struct {
	Hosts       int `json:"hosts"`
	Credentials int `json:"credentials"`
	Hashes      int `json:"hashes"`
	OpenTasks   int `json:"openTasks"`
	WikiPages   int `json:"wikiPages"`
}

func registerOperationTools(s *Server) {
	register(s, &mcp.Tool{
		Name:        "list_operations",
		Description: "The operations this key can act in, with your capped role in each.",
	}, readTool, handleListOperations)

	register(s, &mcp.Tool{
		Name:        "get_operation_summary",
		Description: "Counts of hosts, credentials, hashes, open tasks and wiki pages.",
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

// countOperation gathers the five counts concurrently.
//
// Each count is a one-row fetch: the connections carry TotalCount, so this
// is one query per kind rather than a full listing, and the five run at once
// rather than back to back. Wiki pages are a count query when the repository
// is wired, not a tree load.
//
// One row, not zero. `first: 0` is rejected by pagination.ParseArgs as "must
// be positive", and an earlier version swallowed that error and reported the
// count as 0 — so every count in this summary was silently zero, which an
// agent would read as "this operation is empty". A failed count must never
// be indistinguishable from a real one, so each failure is named in a note.
func (s *Server) countOperation(ctx context.Context, opID uuid.UUID) (operationCounts, []string) {
	idStr := opID.String()
	first := 1

	type counter struct {
		kind string
		dest *int
		fn   func() (int, error)
	}
	var counts operationCounts
	counters := []counter{
		{"hosts", &counts.Hosts, func() (int, error) {
			conn, err := s.deps.Hosts.Hosts(ctx, idStr, nil, nil, nil, &first, nil, nil, nil)
			if err != nil {
				return 0, err
			}
			return conn.TotalCount, nil
		}},
		{"credentials", &counts.Credentials, func() (int, error) {
			conn, err := s.deps.Credentials.Credentials(ctx, idStr, nil, nil, nil, nil, nil, nil, nil, &first, nil, nil, nil)
			if err != nil {
				return 0, err
			}
			return conn.TotalCount, nil
		}},
		{"hashes", &counts.Hashes, func() (int, error) {
			conn, err := s.deps.Hashes.Hashes(ctx, idStr, nil, nil, nil, nil, &first, nil, nil, nil)
			if err != nil {
				return 0, err
			}
			return conn.TotalCount, nil
		}},
		{"open tasks", &counts.OpenTasks, func() (int, error) {
			done := models.TaskStageDone
			conn, err := s.deps.Tasks.Tasks(ctx, idStr, nil, []models.TaskStage{done}, nil, nil, nil, nil, nil, &first, nil, nil, nil)
			if err != nil {
				return 0, err
			}
			return conn.TotalCount, nil
		}},
		{"wiki pages", &counts.WikiPages, func() (int, error) {
			if s.deps.WikiDocRepo != nil {
				n, err := s.deps.WikiDocRepo.CountByOperationID(ctx, opID, repository.WikiDocumentFilter{})
				return int(n), err
			}
			tree, err := s.deps.WikiDocs.WikiDocumentTree(ctx, idStr)
			if err != nil {
				return 0, err
			}
			return len(tree), nil
		}},
	}

	var (
		mu    sync.Mutex
		notes []string
		wg    sync.WaitGroup
	)
	for _, c := range counters {
		wg.Add(1)
		go func(c counter) {
			defer wg.Done()
			n, err := c.fn()
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				s.deps.Logger.Warn("mcp: operation summary count failed",
					zap.String("kind", c.kind), zap.Error(err))
				notes = append(notes,
					fmt.Sprintf("Could not count %s — treat that number as unknown, not zero.", c.kind))
				return
			}
			*c.dest = n
		}(c)
	}
	wg.Wait()
	sort.Strings(notes)
	return counts, notes
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
	summary.operationCounts, summary.Notes = s.countOperation(ctx, opID)

	return toolResult{
		Payload:     summary,
		OperationID: &opID,
		Summary:     fmt.Sprintf("summarized operation %s", op.Name),
	}, nil
}
