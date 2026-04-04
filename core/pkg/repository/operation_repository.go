package repository

import (
	"context"
	"errors"
	"regexp"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ErrLastAdmin is returned when an operation would leave zero admins.
var ErrLastAdmin = errors.New("cannot remove or demote the last admin")

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

	// Safe membership operations — atomically enforce the last-admin invariant.
	// Return ErrLastAdmin if the operation would leave zero admins.
	RemoveMemberSafe(ctx context.Context, operationID uuid.UUID, userID uuid.UUID) error
	UpdateMemberRoleSafe(ctx context.Context, operationID uuid.UUID, userID uuid.UUID, role models.OperationRole) error
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

// lastAdminGuard is a MongoDB filter clause that matches only when it's safe
// to remove or demote the given user. It passes when the user is NOT an admin,
// or when there are >= 2 admins in the operation.
func lastAdminGuard(userID uuid.UUID) bson.M {
	return bson.M{"$or": bson.A{
		// Member is not an admin — always safe
		bson.M{"members": bson.M{"$elemMatch": bson.M{
			"user_id": userID,
			"role":    bson.M{"$ne": "admin"},
		}}},
		// Member IS an admin but there are >= 2 admins total
		bson.M{"$expr": bson.M{"$gte": bson.A{
			bson.M{"$size": bson.M{"$filter": bson.M{
				"input": "$members",
				"cond":  bson.M{"$eq": bson.A{"$$this.role", "admin"}},
			}}},
			2,
		}}},
	}}
}

// RemoveMemberSafe atomically removes a member only if doing so won't leave
// the operation with zero admins. Returns ErrLastAdmin if the invariant
// would be violated.
func (r *operationRepository) RemoveMemberSafe(ctx context.Context, operationID uuid.UUID, userID uuid.UUID) error {
	guard := lastAdminGuard(userID)
	filter := bson.M{
		"operation_id":    operationID,
		"members.user_id": userID,
	}
	for k, v := range guard {
		filter[k] = v
	}

	result, err := r.coll.UpdateAll(ctx, filter,
		bson.M{"$pull": bson.M{"members": bson.M{"user_id": userID}}},
	)
	if err != nil {
		return err
	}
	if result == nil || result.ModifiedCount == 0 {
		return ErrLastAdmin
	}
	return nil
}

// UpdateMemberRoleSafe atomically changes a member's role only if doing so
// won't leave zero admins. Returns ErrLastAdmin if the invariant would be
// violated. Promotions to admin always succeed.
func (r *operationRepository) UpdateMemberRoleSafe(ctx context.Context, operationID uuid.UUID, userID uuid.UUID, role models.OperationRole) error {
	if role == models.OperationRoleAdmin {
		// Promoting to admin — always safe, no guard needed.
		return r.UpdateMemberRole(ctx, operationID, userID, role)
	}

	guard := lastAdminGuard(userID)
	filter := bson.M{
		"operation_id":    operationID,
		"members.user_id": userID,
	}
	for k, v := range guard {
		filter[k] = v
	}

	result, err := r.coll.UpdateAll(ctx, filter,
		bson.M{"$set": bson.M{"members.$.role": role}},
	)
	if err != nil {
		return err
	}
	if result == nil || result.ModifiedCount == 0 {
		return ErrLastAdmin
	}
	return nil
}

func buildOperationSearchFilter(search string) bson.M {
	if search == "" {
		return bson.M{}
	}
	escaped := regexp.QuoteMeta(search)
	regex := bson.M{"$regex": escaped, "$options": "i"}
	return bson.M{"$or": bson.A{
		bson.M{"name": regex},
		bson.M{"description": regex},
	}}
}
