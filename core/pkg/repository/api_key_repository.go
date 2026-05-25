package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const apiKeyCollection = "api_keys"

// IAPIKeyRepository defines persistence for user-owned API keys.
// One row per user (unique on user_id); KeyID is unique-indexed for O(1)
// middleware lookup by the public prefix carried in the raw token.
type IAPIKeyRepository interface {
	FindByKeyID(ctx context.Context, keyID string) (models.APIKey, error)
	FindByUserID(ctx context.Context, userID uuid.UUID) (models.APIKey, error)
	Create(ctx context.Context, key *models.APIKey) error
	UpdateSecret(ctx context.Context, userID uuid.UUID, keyID, secretHash string, version int) error
	SetEnabled(ctx context.Context, userID uuid.UUID, enabled bool) error
	DeleteByUserID(ctx context.Context, userID uuid.UUID) error
	TouchLastUsed(ctx context.Context, keyID string, at time.Time) error
}

type apiKeyRepository struct {
	coll database.Collection
}

func NewAPIKeyRepository(db database.Database) IAPIKeyRepository {
	coll := db.Collection(apiKeyCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"key_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"user_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
	})

	return &apiKeyRepository{coll: coll}
}

func (r *apiKeyRepository) FindByKeyID(ctx context.Context, keyID string) (models.APIKey, error) {
	var key models.APIKey
	err := r.coll.FindOne(ctx, bson.M{"key_id": keyID}).One(&key)
	return key, err
}

func (r *apiKeyRepository) FindByUserID(ctx context.Context, userID uuid.UUID) (models.APIKey, error) {
	var key models.APIKey
	err := r.coll.FindOne(ctx, bson.M{"user_id": userID}).One(&key)
	return key, err
}

func (r *apiKeyRepository) Create(ctx context.Context, key *models.APIKey) error {
	_, err := r.coll.InsertOne(ctx, key)
	return err
}

func (r *apiKeyRepository) UpdateSecret(ctx context.Context, userID uuid.UUID, keyID, secretHash string, version int) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"user_id": userID},
		bson.M{"$set": bson.M{
			"key_id":      keyID,
			"secret_hash": secretHash,
			"version":     version,
			"enabled":     true,
			// Clear last_used_at on regenerate — the old secret is dead, so
			// any previously-recorded use no longer corresponds to the live
			// credential.
			"last_used_at": nil,
		}},
	)
}

func (r *apiKeyRepository) SetEnabled(ctx context.Context, userID uuid.UUID, enabled bool) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"user_id": userID},
		bson.M{"$set": bson.M{"enabled": enabled}},
	)
}

func (r *apiKeyRepository) DeleteByUserID(ctx context.Context, userID uuid.UUID) error {
	return r.coll.Remove(ctx, bson.M{"user_id": userID})
}

func (r *apiKeyRepository) TouchLastUsed(ctx context.Context, keyID string, at time.Time) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"key_id": keyID},
		bson.M{"$set": bson.M{"last_used_at": at}},
	)
}
