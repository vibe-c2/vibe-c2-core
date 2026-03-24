package resolver

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
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
	AddOperationMember(ctx context.Context, operationID string, userID string, role models.OperationRole) (*models.Operation, error)
	RemoveOperationMember(ctx context.Context, operationID string, userID string) (*models.Operation, error)
	UpdateOperationMemberRole(ctx context.Context, operationID string, userID string, role models.OperationRole) (*models.Operation, error)

	// Queries
	Operation(ctx context.Context, id string) (*models.Operation, error)
	Operations(ctx context.Context, search *string, offset *int, limit *int) (*model.OperationPagination, error)
	MyOperationRole(ctx context.Context, operationID string) (*models.OperationRole, error)

	// Field resolvers for Operation type
	ID(ctx context.Context, obj *models.Operation) (string, error)
	Members(ctx context.Context, obj *models.Operation) ([]*models.OperationMember, error)
	CreatedAt(ctx context.Context, obj *models.Operation) (string, error)
	UpdatedAt(ctx context.Context, obj *models.Operation) (string, error)

	// Field resolver for OperationMember type
	OperationMemberUser(ctx context.Context, obj *models.OperationMember) (*models.User, error)
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

// authorizeOperationRole checks if the caller is an app-level admin OR has
// at least the required role in the given operation. Returns nil if authorized.
func (r *operationResolver) authorizeOperationRole(ctx context.Context, op *models.Operation, minRole models.OperationRole) error {
	auth := gqlctx.AuthFromContext(ctx)

	// App-level admins always have full access
	for _, role := range auth.Roles {
		if role == "admin" {
			return nil
		}
	}

	// Check operation-level role
	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return fmt.Errorf("forbidden: invalid caller ID")
	}

	for _, m := range op.Members {
		if m.UserID == callerUID {
			if m.Role.HasAtLeast(minRole) {
				return nil
			}
			return fmt.Errorf("forbidden: requires at least '%s' role in this operation", minRole)
		}
	}

	return fmt.Errorf("forbidden: not a member of this operation")
}

// countAdmins returns the number of members with the admin role.
func countAdmins(members []models.OperationMember) int {
	count := 0
	for _, m := range members {
		if m.Role == models.OperationRoleAdmin {
			count++
		}
	}
	return count
}

// CreateOperation creates a new operation.
// The caller is automatically added as an operation admin.
//
// Example:
//
//	mutation {
//	    createOperation(input: { name: "Red Dawn", description: "APT simulation" }) {
//	        id name description members { user { id username } role }
//	    }
//	}
func (r *operationResolver) CreateOperation(ctx context.Context, input model.CreateOperationInput) (*models.Operation, error) {
	auth := gqlctx.AuthFromContext(ctx)
	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid caller ID: %w", err)
	}

	description := ""
	if input.Description != nil {
		description = *input.Description
	}

	op := &models.Operation{
		OperationID: uuid.New(),
		Name:        input.Name,
		Description: description,
		Members: []models.OperationMember{
			{UserID: callerUID, Role: models.OperationRoleAdmin},
		},
	}

	if err := r.operationRepo.Create(ctx, op); err != nil {
		return nil, fmt.Errorf("failed to create operation: %w", err)
	}

	return op, nil
}

// UpdateOperation modifies an existing operation's name or description.
// Requires operation admin role or app-level admin.
func (r *operationResolver) UpdateOperation(ctx context.Context, id string, input model.UpdateOperationInput) (*models.Operation, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	op, err := r.operationRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}

	if err := r.authorizeOperationRole(ctx, &op, models.OperationRoleAdmin); err != nil {
		return nil, err
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
// App-level admin only (enforced by @hasPermission directive).
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

// AddOperationMember assigns a user to an operation with the given role.
// Requires operation admin role or app-level admin.
func (r *operationResolver) AddOperationMember(ctx context.Context, operationID string, userID string, role models.OperationRole) (*models.Operation, error) {
	if !role.IsValid() {
		return nil, fmt.Errorf("invalid role: %s", role)
	}

	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	userUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	// Verify operation exists and check authorization
	op, err := r.operationRepo.FindByID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}

	if err := r.authorizeOperationRole(ctx, &op, models.OperationRoleAdmin); err != nil {
		return nil, err
	}

	// Verify user exists
	if _, err := r.userRepo.FindByID(ctx, userUID); err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	// Check if user is already a member
	for _, m := range op.Members {
		if m.UserID == userUID {
			return nil, fmt.Errorf("user is already a member of this operation")
		}
	}

	if err := r.operationRepo.AddMember(ctx, opUID, userUID, role); err != nil {
		return nil, fmt.Errorf("failed to add member: %w", err)
	}

	updated, err := r.operationRepo.FindByID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated operation: %w", err)
	}

	return &updated, nil
}

// RemoveOperationMember removes a user from an operation.
// Requires operation admin role or app-level admin.
// Cannot remove the last admin from an operation.
func (r *operationResolver) RemoveOperationMember(ctx context.Context, operationID string, userID string) (*models.Operation, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	userUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	op, err := r.operationRepo.FindByID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}

	if err := r.authorizeOperationRole(ctx, &op, models.OperationRoleAdmin); err != nil {
		return nil, err
	}

	// Check if removing this member would leave zero admins
	for _, m := range op.Members {
		if m.UserID == userUID && m.Role == models.OperationRoleAdmin {
			if countAdmins(op.Members) <= 1 {
				return nil, fmt.Errorf("cannot remove the last admin from an operation")
			}
		}
	}

	if err := r.operationRepo.RemoveMember(ctx, opUID, userUID); err != nil {
		return nil, fmt.Errorf("failed to remove member: %w", err)
	}

	updated, err := r.operationRepo.FindByID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated operation: %w", err)
	}

	return &updated, nil
}

// UpdateOperationMemberRole changes a member's role in an operation.
// Requires operation admin role or app-level admin.
// Cannot demote the last admin.
func (r *operationResolver) UpdateOperationMemberRole(ctx context.Context, operationID string, userID string, role models.OperationRole) (*models.Operation, error) {
	if !role.IsValid() {
		return nil, fmt.Errorf("invalid role: %s", role)
	}

	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	userUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	op, err := r.operationRepo.FindByID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}

	if err := r.authorizeOperationRole(ctx, &op, models.OperationRoleAdmin); err != nil {
		return nil, err
	}

	// Find the target member and validate the change
	found := false
	for _, m := range op.Members {
		if m.UserID == userUID {
			found = true
			// Prevent demoting the last admin
			if m.Role == models.OperationRoleAdmin && role != models.OperationRoleAdmin {
				if countAdmins(op.Members) <= 1 {
					return nil, fmt.Errorf("cannot demote the last admin in an operation")
				}
			}
			break
		}
	}
	if !found {
		return nil, fmt.Errorf("user is not a member of this operation")
	}

	if err := r.operationRepo.UpdateMemberRole(ctx, opUID, userUID, role); err != nil {
		return nil, fmt.Errorf("failed to update member role: %w", err)
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
//	        operations { id name description members { user { id username } role } }
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

// MyOperationRole returns the caller's role in a specific operation,
// or nil if the caller is not a member.
func (r *operationResolver) MyOperationRole(ctx context.Context, operationID string) (*models.OperationRole, error) {
	uid, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	op, err := r.operationRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, nil
	}

	for _, m := range op.Members {
		if m.UserID == callerUID {
			role := m.Role
			return &role, nil
		}
	}

	return nil, nil
}

// ID converts the Operation's UUID to a GraphQL ID string.
func (r *operationResolver) ID(ctx context.Context, obj *models.Operation) (string, error) {
	return obj.OperationID.String(), nil
}

// Members returns the operation's member list as pointers for GraphQL resolution.
// Each OperationMember's User field is resolved separately by OperationMemberUser.
func (r *operationResolver) Members(ctx context.Context, obj *models.Operation) ([]*models.OperationMember, error) {
	if len(obj.Members) == 0 {
		return []*models.OperationMember{}, nil
	}

	ptrs := make([]*models.OperationMember, len(obj.Members))
	for i := range obj.Members {
		ptrs[i] = &obj.Members[i]
	}
	return ptrs, nil
}

// CreatedAt converts the qmgo DefaultField timestamp to an ISO 8601 string.
func (r *operationResolver) CreatedAt(ctx context.Context, obj *models.Operation) (string, error) {
	return obj.CreateAt.Format(time.RFC3339), nil
}

// UpdatedAt converts the qmgo DefaultField timestamp to an ISO 8601 string.
func (r *operationResolver) UpdatedAt(ctx context.Context, obj *models.Operation) (string, error) {
	return obj.UpdateAt.Format(time.RFC3339), nil
}

// OperationMemberUser resolves the User field on an OperationMember.
// Fetches the full User object from the database by the member's UserID.
func (r *operationResolver) OperationMemberUser(ctx context.Context, obj *models.OperationMember) (*models.User, error) {
	user, err := r.userRepo.FindByID(ctx, obj.UserID)
	if err != nil {
		return nil, fmt.Errorf("member user not found: %w", err)
	}
	return &user, nil
}
