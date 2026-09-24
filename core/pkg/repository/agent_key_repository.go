package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const agentKeyCollection = "agent_keys"

// IAgentKeyRepository defines persistence for delegated agent keys.
//
// Deliberately unlike IAPIKeyRepository: a user may own several agent keys, so
// every mutating method is addressed by (userID, agentKeyID) rather than by
// userID alone. Carrying the owner in the filter — instead of looking the row
// up by id and comparing afterwards — means a caller cannot touch someone
// else's key even if a resolver forgets to check.
type IAgentKeyRepository interface {
	FindByKeyID(ctx context.Context, keyID string) (models.AgentKey, error)
	FindByAgentKeyID(ctx context.Context, userID, agentKeyID uuid.UUID) (models.AgentKey, error)
	ListByUserID(ctx context.Context, userID uuid.UUID) ([]models.AgentKey, error)
	Create(ctx context.Context, key *models.AgentKey) error
	UpdateSecret(ctx context.Context, userID, agentKeyID uuid.UUID, keyID, secretHash string, version int) error
	UpdateSettings(ctx context.Context, userID, agentKeyID uuid.UUID, set bson.M) error
	SetEnabled(ctx context.Context, userID, agentKeyID uuid.UUID, enabled bool) error
	Delete(ctx context.Context, userID, agentKeyID uuid.UUID) error
	TouchLastUsed(ctx context.Context, keyID string, at time.Time) error
}

type agentKeyRepository struct {
	coll database.Collection
}

func NewAgentKeyRepository(db database.Database) IAgentKeyRepository {
	coll := db.Collection(agentKeyCollection)

	// key_id and agent_key_id are unique; user_id is NOT — several agent keys
	// per owner is the point of this collection.
	db.EnsureIndexes(context.Background(), agentKeyCollection, []opts.IndexModel{
		{Key: []string{"key_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"agent_key_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"user_id"}},
	})

	return &agentKeyRepository{coll: coll}
}

func (r *agentKeyRepository) FindByKeyID(ctx context.Context, keyID string) (models.AgentKey, error) {
	var key models.AgentKey
	err := r.coll.FindOne(ctx, bson.M{"key_id": keyID}).One(&key)
	return key, err
}

func (r *agentKeyRepository) FindByAgentKeyID(ctx context.Context, userID, agentKeyID uuid.UUID) (models.AgentKey, error) {
	var key models.AgentKey
	err := r.coll.FindOne(ctx, bson.M{"agent_key_id": agentKeyID, "user_id": userID}).One(&key)
	return key, err
}

func (r *agentKeyRepository) ListByUserID(ctx context.Context, userID uuid.UUID) ([]models.AgentKey, error) {
	keys := make([]models.AgentKey, 0)
	err := r.coll.Find(ctx, bson.M{"user_id": userID}).Sort("createAt").All(&keys)
	return keys, err
}

func (r *agentKeyRepository) Create(ctx context.Context, key *models.AgentKey) error {
	_, err := r.coll.InsertOne(ctx, key)
	return err
}

func (r *agentKeyRepository) UpdateSecret(ctx context.Context, userID, agentKeyID uuid.UUID, keyID, secretHash string, version int) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"agent_key_id": agentKeyID, "user_id": userID},
		bson.M{"$set": bson.M{
			"key_id":      keyID,
			"secret_hash": secretHash,
			"version":     version,
			"enabled":     true,
			// The old secret is dead, so a previously-recorded use no longer
			// corresponds to the live credential. Same reasoning as api_keys.
			"last_used_at": nil,
		}},
	)
}

// UpdateSettings applies a caller-built $set of scope fields. The resolver is
// responsible for validating the contents; the filter here guarantees only
// that the row belongs to userID.
func (r *agentKeyRepository) UpdateSettings(ctx context.Context, userID, agentKeyID uuid.UUID, set bson.M) error {
	if len(set) == 0 {
		return nil
	}
	return r.coll.UpdateOne(ctx,
		bson.M{"agent_key_id": agentKeyID, "user_id": userID},
		bson.M{"$set": set},
	)
}

func (r *agentKeyRepository) SetEnabled(ctx context.Context, userID, agentKeyID uuid.UUID, enabled bool) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"agent_key_id": agentKeyID, "user_id": userID},
		bson.M{"$set": bson.M{"enabled": enabled}},
	)
}

func (r *agentKeyRepository) Delete(ctx context.Context, userID, agentKeyID uuid.UUID) error {
	return r.coll.Remove(ctx, bson.M{"agent_key_id": agentKeyID, "user_id": userID})
}

func (r *agentKeyRepository) TouchLastUsed(ctx context.Context, keyID string, at time.Time) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"key_id": keyID},
		bson.M{"$set": bson.M{"last_used_at": at}},
	)
}
