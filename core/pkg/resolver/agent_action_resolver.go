package resolver

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/authorization"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// maxAgentActionLimit bounds a page. The feed is chatty by nature — an agent
// can produce hundreds of rows a minute — so the cap is what stops a careless
// client asking for all of it.
const maxAgentActionLimit = 200

// IAgentActionResolver reads the MCP audit trail.
//
// Read-only by design. An audit trail its own writer can edit is not an audit
// trail, so there is no mutation surface here and none should be added.
type IAgentActionResolver interface {
	AgentActions(ctx context.Context, operationID string, agentKeyID *string, writesOnly *bool,
		outcomes []model.AgentActionOutcome, before *string, limit *int) ([]*models.AgentAction, error)
	AgentActivitySummary(ctx context.Context, operationID string) ([]*model.AgentActivitySummary, error)

	// Field resolvers
	ID(ctx context.Context, obj *models.AgentAction) (string, error)
	OperationIDField(ctx context.Context, obj *models.AgentAction) (*string, error)
	AgentKeyIDField(ctx context.Context, obj *models.AgentAction) (string, error)
	Owner(ctx context.Context, obj *models.AgentAction) (*models.User, error)
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

// authorize gates on the OPERATION, not on key ownership. Anyone who can see
// the work an agent did can see that the agent did it — hiding one operator's
// agent from their teammates would undermine the point of recording it.
func (r *agentActionResolver) authorize(ctx context.Context, operationID string) (uuid.UUID, error) {
	opID, err := uuid.Parse(operationID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid operation ID")
	}
	op, err := r.opsRepo.FindByID(ctx, opID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("operation not found")
	}
	if err := authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleViewer); err != nil {
		return uuid.Nil, err
	}
	return opID, nil
}

func (r *agentActionResolver) AgentActions(
	ctx context.Context, operationID string, agentKeyID *string, writesOnly *bool,
	outcomes []model.AgentActionOutcome, before *string, limit *int,
) ([]*models.AgentAction, error) {
	opID, err := r.authorize(ctx, operationID)
	if err != nil {
		return nil, err
	}

	filter := repository.AgentActionFilter{OperationID: opID}

	if agentKeyID != nil && *agentKeyID != "" {
		keyID, err := uuid.Parse(*agentKeyID)
		if err != nil {
			return nil, fmt.Errorf("invalid agent key ID")
		}
		filter.AgentKeyID = &keyID
	}
	if writesOnly != nil {
		filter.WritesOnly = *writesOnly
	}
	for _, o := range outcomes {
		filter.Outcomes = append(filter.Outcomes, toModelOutcome(o))
	}
	if before != nil && *before != "" {
		t, err := time.Parse(time.RFC3339, *before)
		if err != nil {
			return nil, fmt.Errorf("before must be an RFC3339 timestamp")
		}
		filter.Before = &t
	}

	size := int64(50)
	if limit != nil && *limit > 0 {
		size = int64(*limit)
	}
	if size > maxAgentActionLimit {
		size = maxAgentActionLimit
	}

	actions, err := r.repo.Query(ctx, filter, size)
	if err != nil {
		return nil, fmt.Errorf("failed to read agent activity: %w", err)
	}

	out := make([]*models.AgentAction, 0, len(actions))
	for i := range actions {
		out = append(out, &actions[i])
	}
	return out, nil
}

func (r *agentActionResolver) AgentActivitySummary(ctx context.Context, operationID string) ([]*model.AgentActivitySummary, error) {
	opID, err := r.authorize(ctx, operationID)
	if err != nil {
		return nil, err
	}

	summaries, err := r.repo.DistinctAgents(ctx, opID)
	if err != nil {
		return nil, fmt.Errorf("failed to read agent summary: %w", err)
	}

	out := make([]*model.AgentActivitySummary, 0, len(summaries))
	for _, s := range summaries {
		out = append(out, &model.AgentActivitySummary{
			AgentKeyID: s.AgentKeyID.String(),
			AgentName:  s.AgentName,
			Actions:    s.Actions,
			LastSeen:   s.LastSeen.UTC().Format(time.RFC3339),
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

// Owner resolves the human the agent was acting for. Best-effort: a deleted
// account leaves the row intact but unattributed rather than failing the read.
func (r *agentActionResolver) Owner(ctx context.Context, obj *models.AgentAction) (*models.User, error) {
	if obj.OwnerUserID == uuid.Nil {
		return nil, nil
	}
	user, err := r.userRepo.FindByID(ctx, obj.OwnerUserID)
	if err != nil {
		return nil, nil
	}
	return &user, nil
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
