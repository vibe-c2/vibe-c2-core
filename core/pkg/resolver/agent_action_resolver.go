package resolver

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// IAgentActionResolver reads the MCP audit trail.
//
// Read-only by design. An audit trail its own writer can edit is not an audit
// trail, so there is no mutation surface here and none should be added.
type IAgentActionResolver interface {
	MyAgentActions(ctx context.Context, agentKeyID *string, operationID *string, writesOnly *bool,
		outcomes []model.AgentActionOutcome, first *int, after *string, last *int, before *string) (*model.AgentActionConnection, error)
	MyAgentActivitySummary(ctx context.Context) ([]*model.AgentActivitySummary, error)

	// Field resolvers
	ID(ctx context.Context, obj *models.AgentAction) (string, error)
	OperationIDField(ctx context.Context, obj *models.AgentAction) (*string, error)
	Operation(ctx context.Context, obj *models.AgentAction) (*models.Operation, error)
	AgentKeyIDField(ctx context.Context, obj *models.AgentAction) (string, error)
	Outcome(ctx context.Context, obj *models.AgentAction) (model.AgentActionOutcome, error)
	Error(ctx context.Context, obj *models.AgentAction) (*string, error)
	DurationMs(ctx context.Context, obj *models.AgentAction) (int, error)
	OccurredAt(ctx context.Context, obj *models.AgentAction) (string, error)
}

type agentActionResolver struct {
	repo     repository.IAgentActionRepository
	opsRepo  repository.IOperationRepository
	userRepo repository.IUserRepository
}

func NewAgentActionResolver(
	repo repository.IAgentActionRepository,
	opsRepo repository.IOperationRepository,
	userRepo repository.IUserRepository,
) IAgentActionResolver {
	return &agentActionResolver{repo: repo, opsRepo: opsRepo, userRepo: userRepo}
}

func (r *agentActionResolver) MyAgentActions(
	ctx context.Context, agentKeyID *string, operationID *string, writesOnly *bool,
	outcomes []model.AgentActionOutcome, first *int, after *string, last *int, before *string,
) (*model.AgentActionConnection, error) {
	// The owner comes from the token, never from an argument. There is
	// deliberately no way to ask for somebody else's trail.
	uid, err := callerUserID(ctx)
	if err != nil {
		return nil, err
	}

	args, err := pagination.ParseArgs(first, after, last, before)
	if err != nil {
		return nil, err
	}

	filter := repository.AgentActionFilter{OwnerUserID: uid}

	if agentKeyID != nil && *agentKeyID != "" {
		keyID, err := uuid.Parse(*agentKeyID)
		if err != nil {
			return nil, fmt.Errorf("invalid agent key ID")
		}
		filter.AgentKeyID = &keyID
	}
	if operationID != nil && *operationID != "" {
		opID, err := uuid.Parse(*operationID)
		if err != nil {
			return nil, fmt.Errorf("invalid operation ID")
		}
		// No membership check: these are the caller's own actions. If they
		// have since lost access to the operation, what their agent did there
		// while they had it is still theirs to review.
		filter.OperationID = &opID
	}
	if writesOnly != nil {
		filter.WritesOnly = *writesOnly
	}
	for _, o := range outcomes {
		filter.Outcomes = append(filter.Outcomes, toModelOutcome(o))
	}

	total, err := r.repo.Count(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to count agent activity: %w", err)
	}

	// One extra row is how hasNextPage is answered without a second query.
	actions, err := r.repo.QueryWithCursor(ctx, filter, args.Cursor, args.Limit+1, args.Forward)
	if err != nil {
		return nil, fmt.Errorf("failed to read agent activity: %w", err)
	}

	hasMore := int64(len(actions)) > args.Limit
	if hasMore {
		actions = actions[:args.Limit]
	}

	edges := make([]*model.AgentActionEdge, len(actions))
	for i := range actions {
		edges[i] = &model.AgentActionEdge{
			Node:   &actions[i],
			Cursor: repository.AgentActionCursor(&actions[i]),
		}
	}

	pageInfo := pagination.PageInfo{
		HasNextPage:     args.Forward && hasMore,
		HasPreviousPage: (!args.Forward && hasMore) || (args.Forward && args.Cursor != nil),
	}
	if len(edges) > 0 {
		pageInfo.StartCursor = &edges[0].Cursor
		pageInfo.EndCursor = &edges[len(edges)-1].Cursor
	}

	return &model.AgentActionConnection{
		Edges:      edges,
		PageInfo:   &pageInfo,
		TotalCount: int(total),
	}, nil
}

func (r *agentActionResolver) MyAgentActivitySummary(ctx context.Context) ([]*model.AgentActivitySummary, error) {
	uid, err := callerUserID(ctx)
	if err != nil {
		return nil, err
	}

	summaries, err := r.repo.DistinctAgents(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to read agent summary: %w", err)
	}

	out := make([]*model.AgentActivitySummary, 0, len(summaries))
	for _, sum := range summaries {
		out = append(out, &model.AgentActivitySummary{
			AgentKeyID: sum.AgentKeyID.String(),
			AgentName:  sum.AgentName,
			Actions:    sum.Actions,
			Operations: sum.Operations,
			LastSeen:   sum.LastSeen.UTC().Format(time.RFC3339),
		})
	}
	return out, nil
}

// --- Field resolvers ---

func (r *agentActionResolver) ID(_ context.Context, obj *models.AgentAction) (string, error) {
	return obj.ActionID.String(), nil
}

func (r *agentActionResolver) OperationIDField(_ context.Context, obj *models.AgentAction) (*string, error) {
	if obj.OperationID == nil {
		return nil, nil
	}
	s := obj.OperationID.String()
	return &s, nil
}

func (r *agentActionResolver) AgentKeyIDField(_ context.Context, obj *models.AgentAction) (string, error) {
	return obj.AgentKeyID.String(), nil
}

// Operation resolves the engagement a call acted in, so a feed spanning many
// of them can name each row. Best-effort: an operation deleted since the call
// leaves the action intact but unlabelled, because the action still happened.
func (r *agentActionResolver) Operation(ctx context.Context, obj *models.AgentAction) (*models.Operation, error) {
	if obj.OperationID == nil {
		return nil, nil
	}
	op, err := gqlctx.LoadOperation(ctx, r.opsRepo, *obj.OperationID)
	if err != nil {
		return nil, nil
	}
	return &op, nil
}

func (r *agentActionResolver) Outcome(_ context.Context, obj *models.AgentAction) (model.AgentActionOutcome, error) {
	switch obj.Outcome {
	case models.AgentActionRefused:
		return model.AgentActionOutcomeRefused, nil
	case models.AgentActionError:
		return model.AgentActionOutcomeError, nil
	default:
		return model.AgentActionOutcomeOk, nil
	}
}

func (r *agentActionResolver) Error(_ context.Context, obj *models.AgentAction) (*string, error) {
	if obj.Error == "" {
		return nil, nil
	}
	return &obj.Error, nil
}

func (r *agentActionResolver) DurationMs(_ context.Context, obj *models.AgentAction) (int, error) {
	return int(obj.DurationMs), nil
}

func (r *agentActionResolver) OccurredAt(_ context.Context, obj *models.AgentAction) (string, error) {
	return obj.OccurredAt.UTC().Format(time.RFC3339), nil
}

func toModelOutcome(o model.AgentActionOutcome) models.AgentActionOutcome {
	switch o {
	case model.AgentActionOutcomeRefused:
		return models.AgentActionRefused
	case model.AgentActionOutcomeError:
		return models.AgentActionError
	default:
		return models.AgentActionOK
	}
}
