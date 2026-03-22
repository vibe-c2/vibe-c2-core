package resolver

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// IOperationResolver defines the business logic methods for the Operation entity.
// These map 1:1 to the GraphQL query, mutation, and field resolvers for Operation.
type IOperationResolver interface {
	// Mutations
	CreateOperation(ctx context.Context, input model.CreateOperationInput) (*models.Operation, error)
	UpdateOperation(ctx context.Context, id string, input model.UpdateOperationInput) (*models.Operation, error)
	DeleteOperation(ctx context.Context, id string) (bool, error)
	AddOperationMember(ctx context.Context, operationID string, userID string) (*models.Operation, error)
	RemoveOperationMember(ctx context.Context, operationID string, userID string) (*models.Operation, error)

	// Queries
	Operation(ctx context.Context, id string) (*models.Operation, error)
	Operations(ctx context.Context, search *string, offset *int, limit *int) (*model.OperationPagination, error)

	// Field resolvers — these handle fields where the Go model doesn't
	// map directly to the GraphQL type (e.g. UUID → String, []UUID → []*User).
	ID(ctx context.Context, obj *models.Operation) (string, error)
	Members(ctx context.Context, obj *models.Operation) ([]*models.User, error)
	CreatedAt(ctx context.Context, obj *models.Operation) (string, error)
	UpdatedAt(ctx context.Context, obj *models.Operation) (string, error)
}

type operationResolver struct {
	operationRepo repository.IOperationRepository
	userRepo      repository.IUserRepository // needed for Members field resolver
}

// NewOperationResolver creates a new operation resolver with the given dependencies.
func NewOperationResolver(
	operationRepo repository.IOperationRepository,
	userRepo repository.IUserRepository,
) IOperationResolver {
	return &operationResolver{
		operationRepo: operationRepo,
		userRepo:      userRepo,
	}
}

// CreateOperation creates a new operation.
//
// Example:
//
//	mutation {
//	    createOperation(input: { name: "Red Dawn", description: "APT simulation" }) {
//	        id name description members { id username }
//	    }
//	}
func (r *operationResolver) CreateOperation(ctx context.Context, input model.CreateOperationInput) (*models.Operation, error) {
	description := ""
	if input.Description != nil {
		description = *input.Description
	}

	op := &models.Operation{
		OperationID: uuid.New(),
		Name:        input.Name,
		Description: description,
		MemberIDs:   []uuid.UUID{},
	}

	if err := r.operationRepo.Create(ctx, op); err != nil {
		return nil, fmt.Errorf("failed to create operation: %w", err)
	}

	return op, nil
}

// UpdateOperation modifies an existing operation's name or description.
func (r *operationResolver) UpdateOperation(ctx context.Context, id string, input model.UpdateOperationInput) (*models.Operation, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	op, err := r.operationRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}

	updates := make(map[string]interface{})
	if input.Name != nil {
		updates["name"] = *input.Name
	}
	if input.Description != nil {
		updates["description"] = *input.Description
	}

	if len(updates) == 0 {
		return &op, nil
	}

	if err := r.operationRepo.Update(ctx, &op, updates); err != nil {
		return nil, fmt.Errorf("failed to update operation: %w", err)
	}

	updated, err := r.operationRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated operation: %w", err)
	}

	return &updated, nil
}

// DeleteOperation removes an operation by ID.
func (r *operationResolver) DeleteOperation(ctx context.Context, id string) (bool, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("invalid operation ID: %w", err)
	}

	op, err := r.operationRepo.FindByID(ctx, uid)
	if err != nil {
		return false, fmt.Errorf("operation not found: %w", err)
	}

	if err := r.operationRepo.Delete(ctx, &op); err != nil {
		return false, fmt.Errorf("failed to delete operation: %w", err)
	}
	return true, nil
}

// AddOperationMember assigns a user to an operation.
// Validates that both the operation and user exist before adding.
func (r *operationResolver) AddOperationMember(ctx context.Context, operationID string, userID string) (*models.Operation, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	userUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	// Verify operation exists
	if _, err := r.operationRepo.FindByID(ctx, opUID); err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}

	// Verify user exists
	if _, err := r.userRepo.FindByID(ctx, userUID); err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	// $addToSet is idempotent — adding an existing member is a no-op
	if err := r.operationRepo.AddMember(ctx, opUID, userUID); err != nil {
		return nil, fmt.Errorf("failed to add member: %w", err)
	}

	updated, err := r.operationRepo.FindByID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated operation: %w", err)
	}

	return &updated, nil
}

// RemoveOperationMember removes a user from an operation.
func (r *operationResolver) RemoveOperationMember(ctx context.Context, operationID string, userID string) (*models.Operation, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	userUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	// Verify operation exists
	if _, err := r.operationRepo.FindByID(ctx, opUID); err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}

	// $pull is idempotent — removing a non-member is a no-op
	if err := r.operationRepo.RemoveMember(ctx, opUID, userUID); err != nil {
		return nil, fmt.Errorf("failed to remove member: %w", err)
	}

	updated, err := r.operationRepo.FindByID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated operation: %w", err)
	}

	return &updated, nil
}

// Operation returns a single operation by its ID.
func (r *operationResolver) Operation(ctx context.Context, id string) (*models.Operation, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	op, err := r.operationRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}
	return &op, nil
}

// Operations returns a paginated list of operations with optional search.
//
// Example:
//
//	query {
//	    operations(search: "red", limit: 10) {
//	        totalCount
//	        operations { id name description members { id username } }
//	    }
//	}
func (r *operationResolver) Operations(ctx context.Context, search *string, offset *int, limit *int) (*model.OperationPagination, error) {
	s := ""
	if search != nil {
		s = *search
	}
	off := int64(0)
	if offset != nil {
		off = int64(*offset)
	}
	lim := int64(20)
	if limit != nil {
		lim = int64(*limit)
	}

	total, err := r.operationRepo.Count(ctx, s)
	if err != nil {
		return nil, fmt.Errorf("failed to count operations: %w", err)
	}

	ops, err := r.operationRepo.FindAll(ctx, s, off, lim)
	if err != nil {
		return nil, fmt.Errorf("failed to list operations: %w", err)
	}

	ptrs := make([]*models.Operation, len(ops))
	for i := range ops {
		ptrs[i] = &ops[i]
	}

	hasNext := off+lim < total
	hasPrev := off > 0

	return &model.OperationPagination{
		Operations:      ptrs,
		TotalCount:      int(total),
		HasNextPage:     hasNext,
		HasPreviousPage: hasPrev,
	}, nil
}

// ID converts the Operation's UUID to a GraphQL ID string.
func (r *operationResolver) ID(ctx context.Context, obj *models.Operation) (string, error) {
	return obj.OperationID.String(), nil
}

// Members resolves the operation's member_ids into full User objects.
// This is the many-to-many "join" — we fetch each user by their UUID.
func (r *operationResolver) Members(ctx context.Context, obj *models.Operation) ([]*models.User, error) {
	if len(obj.MemberIDs) == 0 {
		return []*models.User{}, nil
	}

	members := make([]*models.User, 0, len(obj.MemberIDs))
	for _, uid := range obj.MemberIDs {
		user, err := r.userRepo.FindByID(ctx, uid)
		if err != nil {
			// Skip users that no longer exist (e.g. deleted after being added)
			continue
		}
		members = append(members, &user)
	}

	return members, nil
}

// CreatedAt converts the qmgo DefaultField timestamp to an ISO 8601 string.
func (r *operationResolver) CreatedAt(ctx context.Context, obj *models.Operation) (string, error) {
	return obj.CreateAt.Format(time.RFC3339), nil
}

// UpdatedAt converts the qmgo DefaultField timestamp to an ISO 8601 string.
func (r *operationResolver) UpdatedAt(ctx context.Context, obj *models.Operation) (string, error) {
	return obj.UpdateAt.Format(time.RFC3339), nil
}
