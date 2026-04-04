package repository

import (
	"context"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const operationCollection = "operations"

// IOperationRepository defines the interface for operation database operations.
type IOperationRepository interface {
	Create(ctx context.Context, op *models.Operation) error
	FindByID(ctx context.Context, id uuid.UUID) (models.Operation, error)
	FindAll(ctx context.Context, search string, offset, limit int64, memberID *uuid.UUID) ([]models.Operation, error)
	FindWithCursor(ctx context.Context, search string, cursor *pagination.Cursor, limit int64, forward bool, memberID *uuid.UUID) ([]models.Operation, error)
	Count(ctx context.Context, search string, memberID *uuid.UUID) (int64, error)
	Update(ctx context.Context, op *models.Operation, updates map[string]interface{}) error
	Delete(ctx context.Context, op *models.Operation) error

	// Membership operations
	AddMember(ctx context.Context, operationID uuid.UUID, userID uuid.UUID, role models.OperationRole) error
	RemoveMember(ctx context.Context, operationID uuid.UUID, userID uuid.UUID) error
	UpdateMemberRole(ctx context.Context, operationID uuid.UUID, userID uuid.UUID, role models.OperationRole) error
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
		{Key: []string{"members.user_id"}},
		{Key: []string{"-createAt", "-_id"}}, // Supports cursor-based pagination
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

func (r *operationRepository) FindAll(ctx context.Context, search string, offset, limit int64, memberID *uuid.UUID) ([]models.Operation, error) {
	filter := buildOperationSearchFilter(search)
	if memberID != nil {
		filter["members.user_id"] = *memberID
	}

	var ops []models.Operation
	err := r.coll.Find(ctx, filter).
		Sort("-createAt").
		Skip(offset).
		Limit(limit).
		All(&ops)

	return ops, err
}

func (r *operationRepository) FindWithCursor(ctx context.Context, search string, cursor *pagination.Cursor, limit int64, forward bool, memberID *uuid.UUID) ([]models.Operation, error) {
	filter := buildOperationSearchFilter(search)
	if memberID != nil {
		filter["members.user_id"] = *memberID
	}

	if cursorFilter := pagination.BuildCursorFilter(cursor, forward); len(cursorFilter) > 0 {
		for k, v := range cursorFilter {
			filter[k] = v
		}
	}

	var ops []models.Operation
	err := r.coll.Find(ctx, filter).
		Sort(pagination.SortFields(forward)...).
		Limit(limit).
		All(&ops)

	if !forward && len(ops) > 0 {
		for i, j := 0, len(ops)-1; i < j; i, j = i+1, j-1 {
			ops[i], ops[j] = ops[j], ops[i]
		}
	}

	return ops, err
}

func (r *operationRepository) Count(ctx context.Context, search string, memberID *uuid.UUID) (int64, error) {
	filter := buildOperationSearchFilter(search)
	if memberID != nil {
		filter["members.user_id"] = *memberID
	}
	return r.coll.Count(ctx, filter)
}

func (r *operationRepository) Update(ctx context.Context, op *models.Operation, updates map[string]interface{}) error {
	return r.coll.UpdateOne(ctx, bson.M{"operation_id": op.OperationID}, bson.M{"$set": updates})
}

func (r *operationRepository) Delete(ctx context.Context, op *models.Operation) error {
	return r.coll.Remove(ctx, bson.M{"operation_id": op.OperationID})
}

// AddMember adds a user to an operation with the given role.
// Uses a filter to prevent duplicate membership (checks user_id not already present).
func (r *operationRepository) AddMember(ctx context.Context, operationID uuid.UUID, userID uuid.UUID, role models.OperationRole) error {
	return r.coll.UpdateOne(ctx,
		bson.M{
			"operation_id":    operationID,
			"members.user_id": bson.M{"$ne": userID},
		},
		bson.M{"$push": bson.M{"members": models.OperationMember{
			UserID: userID,
			Role:   role,
		}}},
	)
}

func (r *operationRepository) RemoveMember(ctx context.Context, operationID uuid.UUID, userID uuid.UUID) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"operation_id": operationID},
		bson.M{"$pull": bson.M{"members": bson.M{"user_id": userID}}},
	)
}

// UpdateMemberRole changes a member's role using the positional $ operator.
func (r *operationRepository) UpdateMemberRole(ctx context.Context, operationID uuid.UUID, userID uuid.UUID, role models.OperationRole) error {
	return r.coll.UpdateOne(ctx,
		bson.M{
			"operation_id":    operationID,
			"members.user_id": userID,
		},
		bson.M{"$set": bson.M{"members.$.role": role}},
	)
}

func (r *operationRepository) FindByMemberID(ctx context.Context, userID uuid.UUID) ([]models.Operation, error) {
	var ops []models.Operation
	err := r.coll.Find(ctx, bson.M{"members.user_id": userID}).
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
