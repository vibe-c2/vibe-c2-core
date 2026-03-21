package repository

import (
	"context"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const operationCollection = "operations"

// IOperationRepository defines the interface for operation database operations.
type IOperationRepository interface {
	Create(ctx context.Context, op *models.Operation) error
	FindByID(ctx context.Context, id uuid.UUID) (models.Operation, error)
	FindAll(ctx context.Context, search string, offset, limit int64) ([]models.Operation, error)
	Count(ctx context.Context, search string) (int64, error)
	Update(ctx context.Context, op *models.Operation, updates map[string]interface{}) error
	Delete(ctx context.Context, op *models.Operation) error

	// Membership operations
	AddMember(ctx context.Context, operationID uuid.UUID, userID uuid.UUID) error
	RemoveMember(ctx context.Context, operationID uuid.UUID, userID uuid.UUID) error
	FindByMemberID(ctx context.Context, userID uuid.UUID) ([]models.Operation, error)
}

type operationRepository struct {
	coll database.Collection
}

func NewOperationRepository(db database.Database) IOperationRepository {
	coll := db.Collection(operationCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"operation_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"name"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"member_ids"}},
	})

	return &operationRepository{coll: coll}
}

func (r *operationRepository) Create(ctx context.Context, op *models.Operation) error {
	_, err := r.coll.InsertOne(ctx, op)
	return err
}

func (r *operationRepository) FindByID(ctx context.Context, id uuid.UUID) (models.Operation, error) {
	var op models.Operation
	err := r.coll.FindOne(ctx, bson.M{"operation_id": id}).One(&op)
	return op, err
}

func (r *operationRepository) FindAll(ctx context.Context, search string, offset, limit int64) ([]models.Operation, error) {
	var ops []models.Operation
	err := r.coll.Find(ctx, buildOperationSearchFilter(search)).
		Sort("-createAt").
		Skip(offset).
		Limit(limit).
		All(&ops)

	return ops, err
}

func (r *operationRepository) Count(ctx context.Context, search string) (int64, error) {
	return r.coll.Count(ctx, buildOperationSearchFilter(search))
}

func (r *operationRepository) Update(ctx context.Context, op *models.Operation, updates map[string]interface{}) error {
	return r.coll.UpdateOne(ctx, bson.M{"operation_id": op.OperationID}, bson.M{"$set": updates})
}

func (r *operationRepository) Delete(ctx context.Context, op *models.Operation) error {
	return r.coll.Remove(ctx, bson.M{"operation_id": op.OperationID})
}

func (r *operationRepository) AddMember(ctx context.Context, operationID uuid.UUID, userID uuid.UUID) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"operation_id": operationID},
		bson.M{"$addToSet": bson.M{"member_ids": userID}},
	)
}

func (r *operationRepository) RemoveMember(ctx context.Context, operationID uuid.UUID, userID uuid.UUID) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"operation_id": operationID},
		bson.M{"$pull": bson.M{"member_ids": userID}},
	)
}

func (r *operationRepository) FindByMemberID(ctx context.Context, userID uuid.UUID) ([]models.Operation, error) {
	var ops []models.Operation
	err := r.coll.Find(ctx, bson.M{"member_ids": userID}).
		Sort("-createAt").
		All(&ops)

	return ops, err
}

func buildOperationSearchFilter(search string) bson.M {
	if search == "" {
		return bson.M{}
	}
	regex := bson.M{"$regex": search, "$options": "i"}
	return bson.M{"$or": bson.A{
		bson.M{"name": regex},
		bson.M{"description": regex},
	}}
}
