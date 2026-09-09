package repository

import (
	"context"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const agentActionCollection = "agent_actions"

// IAgentActionRepository persists the MCP tool-call trace.
//
// Append-and-read only: an audit trail the writer can edit is not an audit
// trail. Retention is unbounded for now, matching the sessions collection —
// revisit when volume makes it a problem.
type IAgentActionRepository interface {
	Insert(ctx context.Context, action *models.AgentAction) error
	ListByOperation(ctx context.Context, operationID uuid.UUID, limit int64) ([]models.AgentAction, error)
	ListByOwner(ctx context.Context, ownerUserID uuid.UUID, limit int64) ([]models.AgentAction, error)
}

type agentActionRepository struct {
	coll database.Collection
}

func NewAgentActionRepository(db database.Database) IAgentActionRepository {
	coll := db.Collection(agentActionCollection)

	// Both read paths sort newest-first within a scope, so the indexes are
	// compound rather than on the scope alone.
	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"operation_id", "-occurred_at"}},
		{Key: []string{"owner_user_id", "-occurred_at"}},
		{Key: []string{"agent_key_id", "-occurred_at"}},
	})

	return &agentActionRepository{coll: coll}
}

func (r *agentActionRepository) Insert(ctx context.Context, action *models.AgentAction) error {
	_, err := r.coll.InsertOne(ctx, action)
	return err
}

func (r *agentActionRepository) ListByOperation(ctx context.Context, operationID uuid.UUID, limit int64) ([]models.AgentAction, error) {
	actions := make([]models.AgentAction, 0)
	err := r.coll.Find(ctx, bson.M{"operation_id": operationID}).
		Sort("-occurred_at").Limit(limit).All(&actions)
	return actions, err
}

func (r *agentActionRepository) ListByOwner(ctx context.Context, ownerUserID uuid.UUID, limit int64) ([]models.AgentAction, error) {
	actions := make([]models.AgentAction, 0)
	err := r.coll.Find(ctx, bson.M{"owner_user_id": ownerUserID}).
		Sort("-occurred_at").Limit(limit).All(&actions)
	return actions, err
}
