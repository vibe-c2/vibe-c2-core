package resolver

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// ErrAPIKeyAlreadyExists is returned by CreateMyAPIKey when the caller
// already has a key. The frontend uses this to decide whether to prompt
// "regenerate" instead of "create".
var ErrAPIKeyAlreadyExists = errors.New("api key already exists for this user")

// IAPIKeyResolver defines the business logic for the APIKey GraphQL type.
type IAPIKeyResolver interface {
	// Queries
	MyAPIKey(ctx context.Context) (*models.APIKey, error)

	// Mutations
	CreateMyAPIKey(ctx context.Context) (*model.APIKeyWithSecret, error)
	RegenerateMyAPIKey(ctx context.Context) (*model.APIKeyWithSecret, error)
	SetMyAPIKeyEnabled(ctx context.Context, enabled bool) (*models.APIKey, error)
	DeleteMyAPIKey(ctx context.Context) (bool, error)

	// Field resolvers
	ID(ctx context.Context, obj *models.APIKey) (string, error)
	LastUsedAt(ctx context.Context, obj *models.APIKey) (*string, error)
	CreatedAt(ctx context.Context, obj *models.APIKey) (string, error)
	UpdatedAt(ctx context.Context, obj *models.APIKey) (string, error)
}

type apiKeyResolver struct {
	repo repository.IAPIKeyRepository
}

// NewAPIKeyResolver wires the repo into the resolver. No event bus argument
// because API key lifecycle (create / rotate / disable / delete) doesn't
// publish to the timeline today — add the parameter back when it does.
func NewAPIKeyResolver(repo repository.IAPIKeyRepository) IAPIKeyResolver {
	return &apiKeyResolver{repo: repo}
}

// MyAPIKey returns the caller's key or nil if none exists. A nil return is
// the normal "user hasn't generated one yet" state — not an error.
func (r *apiKeyResolver) MyAPIKey(ctx context.Context) (*models.APIKey, error) {
	uid, err := callerUserID(ctx)
	if err != nil {
		return nil, err
	}
	key, err := r.repo.FindByUserID(ctx, uid)
	if err != nil {
		// "no document" is the common "not yet generated" path. Distinguishing
		// it from real errors here is awkward (qmgo wraps mongo errors), so we
		// fall through and let the resolver return nil. The trade-off: a real
		// DB outage shows as "no key" rather than a clean error. Acceptable
		// for now — the next mutation will surface the error.
		return nil, nil
	}
	return &key, nil
}

// CreateMyAPIKey mints a fresh key. Returns ErrAPIKeyAlreadyExists if the
// user already has one — they should use RegenerateMyAPIKey to rotate.
func (r *apiKeyResolver) CreateMyAPIKey(ctx context.Context) (*model.APIKeyWithSecret, error) {
	uid, err := callerUserID(ctx)
	if err != nil {
		return nil, err
	}

	if _, err := r.repo.FindByUserID(ctx, uid); err == nil {
		return nil, ErrAPIKeyAlreadyExists
	}

	raw, keyID, secretHash, err := auth.GenerateAPIKey()
	if err != nil {
		return nil, fmt.Errorf("failed to generate api key: %w", err)
	}

	key := &models.APIKey{
		KeyID:      keyID,
		UserID:     uid,
		SecretHash: secretHash,
		Enabled:    true,
		Version:    1,
	}
	if err := r.repo.Create(ctx, key); err != nil {
		return nil, fmt.Errorf("failed to create api key: %w", err)
	}

	// Re-fetch so the qmgo-populated _id and timestamps are present in the
	// returned object.
	created, err := r.repo.FindByUserID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to load created api key: %w", err)
	}

	return &model.APIKeyWithSecret{
		APIKey: &created,
		Token:  raw,
	}, nil
}

// RegenerateMyAPIKey overwrites the existing key's secret in place. The
// new token immediately invalidates the old one — any script still using
// the old token gets 401 on its next request.
func (r *apiKeyResolver) RegenerateMyAPIKey(ctx context.Context) (*model.APIKeyWithSecret, error) {
	uid, err := callerUserID(ctx)
	if err != nil {
		return nil, err
	}

	existing, err := r.repo.FindByUserID(ctx, uid)
	if err != nil {
		// No existing key — fall through to create one. Saves the frontend
		// from having to call both endpoints.
		return r.CreateMyAPIKey(ctx)
	}

	raw, keyID, secretHash, err := auth.GenerateAPIKey()
	if err != nil {
		return nil, fmt.Errorf("failed to generate api key: %w", err)
	}

	nextVersion := existing.Version + 1
	if err := r.repo.UpdateSecret(ctx, uid, keyID, secretHash, nextVersion); err != nil {
		return nil, fmt.Errorf("failed to rotate api key: %w", err)
	}

	updated, err := r.repo.FindByUserID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to load rotated api key: %w", err)
	}

	return &model.APIKeyWithSecret{
		APIKey: &updated,
		Token:  raw,
	}, nil
}

// SetMyAPIKeyEnabled toggles the key without destroying it. Disabled keys
// return 401 in the middleware; re-enabling restores access without a
// regeneration.
func (r *apiKeyResolver) SetMyAPIKeyEnabled(ctx context.Context, enabled bool) (*models.APIKey, error) {
	uid, err := callerUserID(ctx)
	if err != nil {
		return nil, err
	}
	if err := r.repo.SetEnabled(ctx, uid, enabled); err != nil {
		return nil, fmt.Errorf("failed to update api key: %w", err)
	}
	updated, err := r.repo.FindByUserID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to load api key: %w", err)
	}
	return &updated, nil
}

// DeleteMyAPIKey removes the key entirely.
func (r *apiKeyResolver) DeleteMyAPIKey(ctx context.Context) (bool, error) {
	uid, err := callerUserID(ctx)
	if err != nil {
		return false, err
	}
	if err := r.repo.DeleteByUserID(ctx, uid); err != nil {
		return false, fmt.Errorf("failed to delete api key: %w", err)
	}
	return true, nil
}

// --- Field resolvers ---

// ID surfaces the public key_id prefix as the GraphQL id. There's no separate
// row UUID worth exposing — key_id is unique and stable across regenerations.
func (r *apiKeyResolver) ID(_ context.Context, obj *models.APIKey) (string, error) {
	return obj.KeyID, nil
}

func (r *apiKeyResolver) LastUsedAt(_ context.Context, obj *models.APIKey) (*string, error) {
	if obj.LastUsedAt == nil {
		return nil, nil
	}
	s := obj.LastUsedAt.UTC().Format(time.RFC3339)
	return &s, nil
}

func (r *apiKeyResolver) CreatedAt(_ context.Context, obj *models.APIKey) (string, error) {
	return obj.CreateAt.UTC().Format(time.RFC3339), nil
}

func (r *apiKeyResolver) UpdatedAt(_ context.Context, obj *models.APIKey) (string, error) {
	return obj.UpdateAt.UTC().Format(time.RFC3339), nil
}

// callerUserID extracts and parses the user id from the GraphQL auth context.
// Returns a clear error if the context is missing or malformed — should be
// unreachable behind @hasPermission(permission: "*"), but defensive guards
// here keep the resolver honest if it's ever called from a test that skips
// the directive.
func callerUserID(ctx context.Context) (uuid.UUID, error) {
	info := gqlctx.AuthFromContext(ctx)
	if info.UserID == "" {
		return uuid.Nil, fmt.Errorf("unauthorized")
	}
	uid, err := uuid.Parse(info.UserID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid user ID in token: %w", err)
	}
	return uid, nil
}
