package resolver

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/authorization"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// maxAgentKeyNameLen bounds the operator-supplied label. It is rendered on the
// Timeline and in the activity rail, so an unbounded string would let one user
// disfigure a shared surface.
const maxAgentKeyNameLen = 80

// IAgentKeyResolver defines the business logic for the AgentKey GraphQL type.
type IAgentKeyResolver interface {
	// Queries
	MyAgentKeys(ctx context.Context) ([]*models.AgentKey, error)

	// Mutations
	CreateAgentKey(ctx context.Context, input model.CreateAgentKeyInput) (*model.AgentKeyWithSecret, error)
	RegenerateAgentKey(ctx context.Context, id string) (*model.AgentKeyWithSecret, error)
	UpdateAgentKey(ctx context.Context, id string, input model.UpdateAgentKeyInput) (*models.AgentKey, error)
	SetAgentKeyEnabled(ctx context.Context, id string, enabled bool) (*models.AgentKey, error)
	DeleteAgentKey(ctx context.Context, id string) (bool, error)

	// Field resolvers
	ID(ctx context.Context, obj *models.AgentKey) (string, error)
	OperationScopes(ctx context.Context, obj *models.AgentKey) ([]*models.Operation, error)
	LastUsedAt(ctx context.Context, obj *models.AgentKey) (*string, error)
	CreatedAt(ctx context.Context, obj *models.AgentKey) (string, error)
	UpdatedAt(ctx context.Context, obj *models.AgentKey) (string, error)
}

type agentKeyResolver struct {
	repo    repository.IAgentKeyRepository
	opsRepo repository.IOperationRepository
}

// NewAgentKeyResolver wires the repos. opsRepo is needed at two points: to
// validate scopes at write time, and to hydrate them for display.
func NewAgentKeyResolver(repo repository.IAgentKeyRepository, opsRepo repository.IOperationRepository) IAgentKeyResolver {
	return &agentKeyResolver{repo: repo, opsRepo: opsRepo}
}

func (r *agentKeyResolver) MyAgentKeys(ctx context.Context) ([]*models.AgentKey, error) {
	uid, err := callerUserID(ctx)
	if err != nil {
		return nil, err
	}
	keys, err := r.repo.ListByUserID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to list agent keys: %w", err)
	}
	out := make([]*models.AgentKey, 0, len(keys))
	for i := range keys {
		out = append(out, &keys[i])
	}
	return out, nil
}

func (r *agentKeyResolver) CreateAgentKey(ctx context.Context, input model.CreateAgentKeyInput) (*model.AgentKeyWithSecret, error) {
	uid, err := callerUserID(ctx)
	if err != nil {
		return nil, err
	}

	name, err := validateAgentKeyName(input.Name)
	if err != nil {
		return nil, err
	}
	if !models.IsValidAgentMaxRole(input.MaxRole) {
		return nil, fmt.Errorf("maxRole must be VIEWER or OPERATOR")
	}
	scopes, err := r.validateScopes(ctx, input.OperationScopes)
	if err != nil {
		return nil, err
	}

	raw, keyID, secretHash, err := auth.GenerateKey(auth.AgentKeyPrefix)
	if err != nil {
		return nil, fmt.Errorf("failed to generate agent key: %w", err)
	}

	key := &models.AgentKey{
		AgentKeyID:      uuid.New(),
		KeyID:           keyID,
		UserID:          uid,
		Name:            name,
		SecretHash:      secretHash,
		Enabled:         true,
		OperationScopes: scopes,
		MaxRole:         input.MaxRole,
		AllowWrites:     input.AllowWrites,
		Version:         1,
	}
	if err := r.repo.Create(ctx, key); err != nil {
		return nil, fmt.Errorf("failed to create agent key: %w", err)
	}

	// Re-fetch so qmgo's _id and timestamps are populated on what we return.
	created, err := r.repo.FindByAgentKeyID(ctx, uid, key.AgentKeyID)
	if err != nil {
		return nil, fmt.Errorf("failed to load created agent key: %w", err)
	}

	return &model.AgentKeyWithSecret{AgentKey: &created, Token: raw}, nil
}

func (r *agentKeyResolver) RegenerateAgentKey(ctx context.Context, id string) (*model.AgentKeyWithSecret, error) {
	uid, keyUID, err := r.callerAndKeyID(ctx, id)
	if err != nil {
		return nil, err
	}

	existing, err := r.repo.FindByAgentKeyID(ctx, uid, keyUID)
	if err != nil {
		return nil, fmt.Errorf("agent key not found")
	}

	raw, keyID, secretHash, err := auth.GenerateKey(auth.AgentKeyPrefix)
	if err != nil {
		return nil, fmt.Errorf("failed to generate agent key: %w", err)
	}

	if err := r.repo.UpdateSecret(ctx, uid, keyUID, keyID, secretHash, existing.Version+1); err != nil {
		return nil, fmt.Errorf("failed to rotate agent key: %w", err)
	}

	updated, err := r.repo.FindByAgentKeyID(ctx, uid, keyUID)
	if err != nil {
		return nil, fmt.Errorf("failed to load rotated agent key: %w", err)
	}

	return &model.AgentKeyWithSecret{AgentKey: &updated, Token: raw}, nil
}

// UpdateAgentKey changes scope in place. Only the provided fields move; note
// that passing an empty operationScopes list is meaningful — it widens the key
// back to "every operation the owner belongs to" — whereas omitting the field
// leaves the current list alone.
func (r *agentKeyResolver) UpdateAgentKey(ctx context.Context, id string, input model.UpdateAgentKeyInput) (*models.AgentKey, error) {
	uid, keyUID, err := r.callerAndKeyID(ctx, id)
	if err != nil {
		return nil, err
	}

	set := bson.M{}

	if input.Name != nil {
		name, err := validateAgentKeyName(*input.Name)
		if err != nil {
			return nil, err
		}
		set["name"] = name
	}
	if input.MaxRole != nil {
		if !models.IsValidAgentMaxRole(*input.MaxRole) {
			return nil, fmt.Errorf("maxRole must be VIEWER or OPERATOR")
		}
		set["max_role"] = *input.MaxRole
	}
	if input.AllowWrites != nil {
		set["allow_writes"] = *input.AllowWrites
	}
	if input.OperationScopes != nil {
		scopes, err := r.validateScopes(ctx, input.OperationScopes)
		if err != nil {
			return nil, err
		}
		set["operation_scopes"] = scopes
	}

	if err := r.repo.UpdateSettings(ctx, uid, keyUID, set); err != nil {
		return nil, fmt.Errorf("failed to update agent key: %w", err)
	}

	updated, err := r.repo.FindByAgentKeyID(ctx, uid, keyUID)
	if err != nil {
		return nil, fmt.Errorf("agent key not found")
	}
	return &updated, nil
}

func (r *agentKeyResolver) SetAgentKeyEnabled(ctx context.Context, id string, enabled bool) (*models.AgentKey, error) {
	uid, keyUID, err := r.callerAndKeyID(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := r.repo.SetEnabled(ctx, uid, keyUID, enabled); err != nil {
		return nil, fmt.Errorf("failed to update agent key: %w", err)
	}
	updated, err := r.repo.FindByAgentKeyID(ctx, uid, keyUID)
	if err != nil {
		return nil, fmt.Errorf("agent key not found")
	}
	return &updated, nil
}

func (r *agentKeyResolver) DeleteAgentKey(ctx context.Context, id string) (bool, error) {
	uid, keyUID, err := r.callerAndKeyID(ctx, id)
	if err != nil {
		return false, err
	}
	if err := r.repo.Delete(ctx, uid, keyUID); err != nil {
		return false, fmt.Errorf("failed to delete agent key: %w", err)
	}
	return true, nil
}

// --- Helpers ---

func (r *agentKeyResolver) callerAndKeyID(ctx context.Context, id string) (uuid.UUID, uuid.UUID, error) {
	uid, err := callerUserID(ctx)
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	keyUID, err := uuid.Parse(id)
	if err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("invalid agent key id")
	}
	return uid, keyUID, nil
}

func validateAgentKeyName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" {
		return "", fmt.Errorf("name is required")
	}
	if len([]rune(name)) > maxAgentKeyNameLen {
		return "", fmt.Errorf("name must be at most %d characters", maxAgentKeyNameLen)
	}
	return name, nil
}

// validateScopes parses the requested operation ids and refuses any the caller
// is not currently a member of. Scoping is a narrowing filter, so an
// unreachable entry could never grant anything — but it would silently produce
// a key that does less than the operator believes, so it is rejected here
// rather than discovered at first use.
func (r *agentKeyResolver) validateScopes(ctx context.Context, ids []string) ([]uuid.UUID, error) {
	if len(ids) == 0 {
		return nil, nil
	}

	seen := make(map[uuid.UUID]struct{}, len(ids))
	scopes := make([]uuid.UUID, 0, len(ids))

	for _, raw := range ids {
		opID, err := uuid.Parse(raw)
		if err != nil {
			return nil, fmt.Errorf("invalid operation id %q", raw)
		}
		if _, dup := seen[opID]; dup {
			continue
		}
		seen[opID] = struct{}{}

		op, err := gqlctx.LoadOperation(ctx, r.opsRepo, opID)
		if err != nil {
			return nil, fmt.Errorf("operation %s not found", raw)
		}
		// Viewer is the weakest membership that means anything; a key may be
		// scoped to an operation the owner can only read.
		if err := authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleViewer); err != nil {
			return nil, fmt.Errorf("cannot scope an agent key to operation %s: %w", op.Name, err)
		}
		scopes = append(scopes, opID)
	}

	return scopes, nil
}

// --- Field resolvers ---

func (r *agentKeyResolver) ID(_ context.Context, obj *models.AgentKey) (string, error) {
	return obj.AgentKeyID.String(), nil
}

// OperationScopes hydrates the stored ids into full Operations so the settings
// UI can show names. An id that no longer resolves (operation deleted after the
// key was minted) is skipped rather than failing the whole query — the key
// still works for its remaining scopes.
func (r *agentKeyResolver) OperationScopes(ctx context.Context, obj *models.AgentKey) ([]*models.Operation, error) {
	out := make([]*models.Operation, 0, len(obj.OperationScopes))
	for _, opID := range obj.OperationScopes {
		op, err := gqlctx.LoadOperation(ctx, r.opsRepo, opID)
		if err != nil {
			continue
		}
		out = append(out, &op)
	}
	return out, nil
}

func (r *agentKeyResolver) LastUsedAt(_ context.Context, obj *models.AgentKey) (*string, error) {
	if obj.LastUsedAt == nil {
		return nil, nil
	}
	s := obj.LastUsedAt.UTC().Format(time.RFC3339)
	return &s, nil
}

func (r *agentKeyResolver) CreatedAt(_ context.Context, obj *models.AgentKey) (string, error) {
	return obj.CreateAt.UTC().Format(time.RFC3339), nil
}

func (r *agentKeyResolver) UpdatedAt(_ context.Context, obj *models.AgentKey) (string, error) {
	return obj.UpdateAt.UTC().Format(time.RFC3339), nil
}
