package resolver

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/authorization"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// refuseIfPublic blocks mutations targeted at the synthetic Public operation.
// Public is read-only at the resolver layer: its name, description, and
// membership are hardcoded and there is no Mongo row to mutate. The
// authorization layer would also refuse admin-level requests against Public
// (see authorization.AuthorizeOperationRole), but this check fires earlier
// and gives a clearer error message.
func refuseIfPublic(id uuid.UUID) error {
	if models.IsPublicOperation(id) {
		return fmt.Errorf("the Public operation is read-only")
	}
	return nil
}

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
	Operations(ctx context.Context, search *string, sortBy *model.OperationSortField, sortDirection *model.SortDirection, first *int, after *string, last *int, before *string) (*model.OperationConnection, error)
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
	operationRepo  repository.IOperationRepository
	userRepo       repository.IUserRepository               // needed for Members field resolver
	wikiDocRepo    repository.IWikiDocumentRepository        // needed for cascade delete
	wikiBackupRepo repository.IWikiDocumentBackupRepository  // needed for cascade delete
	credRepo       repository.ICredentialRepository          // needed for cascade delete
	hostRepo       repository.IHostRepository                // needed for cascade delete
	eventBus       eventbus.IEventBus                        // async event publishing
}

// NewOperationResolver creates a new operation resolver with the given dependencies.
func NewOperationResolver(
	operationRepo repository.IOperationRepository,
	userRepo repository.IUserRepository,
	opts ...OperationResolverOption,
) IOperationResolver {
	r := &operationResolver{
		operationRepo: operationRepo,
		userRepo:      userRepo,
		eventBus:      eventbus.NewNopEventBus(),
	}
	for _, opt := range opts {
		opt(r)
	}
	return r
}

// OperationResolverOption is a functional option for configuring the operation resolver.
type OperationResolverOption func(*operationResolver)

// WithWikiDocumentRepo adds the WikiDocument repository for cascade delete.
func WithWikiDocumentRepo(repo repository.IWikiDocumentRepository) OperationResolverOption {
	return func(r *operationResolver) {
		r.wikiDocRepo = repo
	}
}

// WithWikiDocumentBackupRepo adds the WikiDocumentBackup repository for cascade delete.
func WithWikiDocumentBackupRepo(repo repository.IWikiDocumentBackupRepository) OperationResolverOption {
	return func(r *operationResolver) {
		r.wikiBackupRepo = repo
	}
}

// WithCredentialRepo adds the Credential repository for cascade delete.
func WithCredentialRepo(repo repository.ICredentialRepository) OperationResolverOption {
	return func(r *operationResolver) {
		r.credRepo = repo
	}
}

// WithHostRepo adds the Host repository for cascade delete.
func WithHostRepo(repo repository.IHostRepository) OperationResolverOption {
	return func(r *operationResolver) {
		r.hostRepo = repo
	}
}

// WithEventBus adds the event bus for publishing domain events.
func WithEventBus(bus eventbus.IEventBus) OperationResolverOption {
	return func(r *operationResolver) {
		r.eventBus = bus
	}
}

// isAppAdmin returns true if the caller has the app-level "admin" role.
func isAppAdmin(auth gqlctx.AuthInfo) bool {
	return authorization.IsAppAdmin(auth)
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

	// Reserve the "Public" name (case-insensitive) for the synthetic Public
	// operation. The Mongo unique-name index can't catch this collision
	// because the synthetic op is never stored — guard at the resolver.
	trimmedName := strings.TrimSpace(input.Name)
	if strings.EqualFold(trimmedName, models.PublicOperationName) {
		return nil, fmt.Errorf("the name %q is reserved", models.PublicOperationName)
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

	r.eventBus.Publish(eventbus.NewOperationCreatedEvent(eventbus.UserActor(auth.UserID), eventbus.OperationEventPayload{
		OperationID: op.OperationID.String(), Name: op.Name,
	}))

	return op, nil
}

// UpdateOperation modifies an existing operation's name or description.
// Requires operation admin role or app-level admin.
func (r *operationResolver) UpdateOperation(ctx context.Context, id string, input model.UpdateOperationInput) (*models.Operation, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := refuseIfPublic(uid); err != nil {
		return nil, err
	}

	op, err := r.operationRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}

	if err := authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleAdmin); err != nil {
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

	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewOperationUpdatedEvent(eventbus.UserActor(auth.UserID), eventbus.OperationEventPayload{
		OperationID: updated.OperationID.String(), Name: updated.Name,
	}))

	return &updated, nil
}

// DeleteOperation removes an operation by ID.
// App-level admin only (enforced by @hasPermission directive).
func (r *operationResolver) DeleteOperation(ctx context.Context, id string) (bool, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := refuseIfPublic(uid); err != nil {
		return false, err
	}

	op, err := r.operationRepo.FindByID(ctx, uid)
	if err != nil {
		return false, fmt.Errorf("operation not found: %w", err)
	}

	// Cascade delete: remove all credentials (findings) belonging to this operation
	if r.credRepo != nil {
		if err := r.credRepo.DeleteByOperationID(ctx, op.OperationID); err != nil {
			return false, fmt.Errorf("failed to delete operation's credentials: %w", err)
		}
	}

	// Cascade delete: remove all hosts (findings) belonging to this operation
	if r.hostRepo != nil {
		if err := r.hostRepo.DeleteByOperationID(ctx, op.OperationID); err != nil {
			return false, fmt.Errorf("failed to delete operation's hosts: %w", err)
		}
	}

	// Cascade delete: remove all wiki backups then documents belonging to this operation
	if r.wikiBackupRepo != nil {
		if err := r.wikiBackupRepo.DeleteByOperationID(ctx, op.OperationID); err != nil {
			return false, fmt.Errorf("failed to delete operation's wiki backups: %w", err)
		}
	}
	if r.wikiDocRepo != nil {
		if err := r.wikiDocRepo.HardDeleteByOperationID(ctx, op.OperationID); err != nil {
			return false, fmt.Errorf("failed to delete operation's wiki documents: %w", err)
		}
	}

	if err := r.operationRepo.Delete(ctx, &op); err != nil {
		return false, fmt.Errorf("failed to delete operation: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewOperationDeletedEvent(eventbus.UserActor(auth.UserID), eventbus.OperationDeletedPayload{
		OperationID: id,
	}))

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

	if err := refuseIfPublic(opUID); err != nil {
		return nil, err
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

	if err := authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleAdmin); err != nil {
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

	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewOperationMemberAddedEvent(eventbus.UserActor(auth.UserID), eventbus.OperationMemberPayload{
		OperationID: operationID, MemberID: userID,
	}))

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

	if err := refuseIfPublic(opUID); err != nil {
		return nil, err
	}

	userUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	op, err := r.operationRepo.FindByID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}

	if err := authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleAdmin); err != nil {
		return nil, err
	}

	// Atomically remove the member, refusing if it would leave zero admins.
	if err := r.operationRepo.RemoveMemberSafe(ctx, opUID, userUID); err != nil {
		if errors.Is(err, repository.ErrLastAdmin) {
			return nil, fmt.Errorf("cannot remove the last admin from an operation")
		}
		return nil, fmt.Errorf("failed to remove member: %w", err)
	}

	updated, err := r.operationRepo.FindByID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated operation: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewOperationMemberRemovedEvent(eventbus.UserActor(auth.UserID), eventbus.OperationMemberPayload{
		OperationID: operationID, MemberID: userID,
	}))

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

	if err := refuseIfPublic(opUID); err != nil {
		return nil, err
	}

	userUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	op, err := r.operationRepo.FindByID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}

	if err := authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleAdmin); err != nil {
		return nil, err
	}

	// Atomically update the role, refusing if it would leave zero admins.
	if err := r.operationRepo.UpdateMemberRoleSafe(ctx, opUID, userUID, role); err != nil {
		if errors.Is(err, repository.ErrLastAdmin) {
			return nil, fmt.Errorf("cannot demote the last admin in an operation")
		}
		return nil, fmt.Errorf("failed to update member role: %w", err)
	}

	updated, err := r.operationRepo.FindByID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated operation: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewOperationMemberUpdatedEvent(eventbus.UserActor(auth.UserID), eventbus.OperationMemberPayload{
		OperationID: operationID, MemberID: userID,
	}))

	return &updated, nil
}

// Operation returns a single operation by its ID.
// Non-admin users can only view operations they are a member of.
func (r *operationResolver) Operation(ctx context.Context, id string) (*models.Operation, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	op, err := r.operationRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}

	if err := authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	return &op, nil
}

// Operations returns a cursor-paginated list of operations with optional search.
//
// Example:
//
//	query {
//	    operations(search: "red", first: 10) {
//	        edges { node { id name description } cursor }
//	        pageInfo { hasNextPage endCursor }
//	        totalCount
//	    }
//	}
func (r *operationResolver) Operations(ctx context.Context, search *string, sortBy *model.OperationSortField, sortDirection *model.SortDirection, first *int, after *string, last *int, before *string) (*model.OperationConnection, error) {
	auth := gqlctx.AuthFromContext(ctx)
	args, err := pagination.ParseArgs(first, after, last, before)
	if err != nil {
		return nil, fmt.Errorf("invalid pagination args: %w", err)
	}

	sortSpec, err := mapOperationSort(sortBy, sortDirection)
	if err != nil {
		return nil, err
	}

	s := ""
	if search != nil {
		s = *search
	}

	// App admins see all operations; regular users only see operations they belong to.
	var memberID *uuid.UUID
	if !isAppAdmin(auth) {
		uid, err := uuid.Parse(auth.UserID)
		if err != nil {
			return nil, fmt.Errorf("invalid caller ID")
		}
		memberID = &uid
	}

	total, err := r.operationRepo.Count(ctx, s, memberID)
	if err != nil {
		return nil, fmt.Errorf("failed to count operations: %w", err)
	}

	ops, err := r.operationRepo.FindWithCursor(ctx, s, sortSpec, args.Cursor, args.Limit+1, args.Forward, memberID)
	if err != nil {
		return nil, fmt.Errorf("failed to list operations: %w", err)
	}

	hasMore := int64(len(ops)) > args.Limit
	if hasMore {
		ops = ops[:args.Limit]
	}

	edges := make([]*model.OperationEdge, len(ops))
	for i := range ops {
		edges[i] = &model.OperationEdge{
			Node:   &ops[i],
			Cursor: sortSpec.Cursor(&ops[i]),
		}
	}

	pageInfo := pagination.PageInfo{
		HasNextPage:     args.Forward && hasMore,
		HasPreviousPage: (!args.Forward && hasMore) || (args.Forward && args.Cursor != nil),
	}
	if len(edges) > 0 {
		pageInfo.StartCursor = &edges[0].Cursor
		pageInfo.EndCursor = &edges[len(edges)-1].Cursor
	}

	return &model.OperationConnection{
		Edges:      edges,
		PageInfo:   &pageInfo,
		TotalCount: int(total),
	}, nil
}

// MyOperationRole returns the caller's role in a specific operation,
// or nil if the caller is not a member.
//
// Public operation: any authenticated caller is treated as an operator —
// mirrors the implicit-membership rule in authorization.AuthorizeOperationRole
// so the frontend can render edit affordances for the Public wiki tab
// without doing role math itself.
func (r *operationResolver) MyOperationRole(ctx context.Context, operationID string) (*models.OperationRole, error) {
	uid, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, nil
	}

	if models.IsPublicOperation(uid) {
		role := models.OperationRoleOperator
		return &role, nil
	}

	op, err := r.operationRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
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

// mapOperationSort converts the GraphQL sort args to the repository's sort
// spec. Nil args fall back to the default (createAt descending) — gqlgen fills
// the schema defaults, so nils only appear when a client sends explicit nulls.
func mapOperationSort(sortBy *model.OperationSortField, sortDirection *model.SortDirection) (repository.OperationSort, error) {
	sort := repository.DefaultOperationSort()

	if sortBy != nil {
		switch *sortBy {
		case model.OperationSortFieldName:
			sort.Field = repository.OperationSortFieldName
		case model.OperationSortFieldCreatedAt:
			sort.Field = repository.OperationSortFieldCreatedAt
		default:
			return repository.OperationSort{}, fmt.Errorf("invalid operation sort field: %s", *sortBy)
		}
	}

	if sortDirection != nil {
		switch *sortDirection {
		case model.SortDirectionAsc:
			sort.Ascending = true
		case model.SortDirectionDesc:
			sort.Ascending = false
		default:
			return repository.OperationSort{}, fmt.Errorf("invalid sort direction: %s", *sortDirection)
		}
	}

	return sort, nil
}
