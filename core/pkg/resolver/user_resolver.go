package resolver

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// IUserResolver defines the business logic methods for the User entity.
// These map 1:1 to the GraphQL query, mutation, and field resolvers for User.
type IUserResolver interface {
	// Mutations
	CreateUser(ctx context.Context, input model.CreateUserInput) (*models.User, error)
	UpdateUser(ctx context.Context, id string, input model.UpdateUserInput) (*models.User, error)
	DeleteUser(ctx context.Context, id string) (bool, error)
	UpdateOwnProfile(ctx context.Context, input model.UpdateUserInput) (*models.User, error)
	SetHiddenIdentities(ctx context.Context, names []string) (*models.User, error)

	// Queries
	Me(ctx context.Context) (*models.User, error)
	User(ctx context.Context, id string) (*models.User, error)
	Users(ctx context.Context, search *string, sortBy *model.UserSortField, sortDirection *model.SortDirection, first *int, after *string, last *int, before *string) (*model.UserConnection, error)
	UserSuggestions(ctx context.Context, search string, first *int) ([]*model.UserSuggestion, error)

	// Field resolvers — these handle fields where the Go model doesn't
	// map directly to the GraphQL type (e.g. UUID → String, time.Time → String).
	ID(ctx context.Context, obj *models.User) (string, error)
	CreatedAt(ctx context.Context, obj *models.User) (string, error)
	UpdatedAt(ctx context.Context, obj *models.User) (string, error)
}

type userResolver struct {
	userRepo repository.IUserRepository
	eventBus eventbus.IEventBus
}

// NewUserResolver creates a new user resolver with the given dependencies.
func NewUserResolver(userRepo repository.IUserRepository, eventBus eventbus.IEventBus) IUserResolver {
	return &userResolver{userRepo: userRepo, eventBus: eventBus}
}

// CreateUser handles the createUser mutation.
// By the time this runs, @hasPermission has already verified "user:create".
//
// Example GraphQL call:
//
//	mutation {
//	    createUser(input: { username: "bob", password: "s3cret", roles: ["user"] }) {
//	        id username roles active
//	    }
//	}
func (r *userResolver) CreateUser(ctx context.Context, input model.CreateUserInput) (*models.User, error) {
	// Check if username is already taken (same check as enroll controller)
	exists, err := r.userRepo.ExistsByUsername(ctx, input.Username)
	if err != nil {
		return nil, fmt.Errorf("failed to check username: %w", err)
	}
	if exists {
		return nil, fmt.Errorf("username '%s' already exists", input.Username)
	}

	// Hash the password with bcrypt (same function used by the enroll controller)
	hashedPassword, err := auth.HashPassword(input.Password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// Default active to true if the client didn't specify it.
	// In the schema, active has a default value of true, but gqlgen sends
	// it as a *bool (pointer) so we need to handle the nil case.
	active := true
	if input.Active != nil {
		active = *input.Active
	}

	user := &models.User{
		UserID:   uuid.New(),
		Username: input.Username,
		Password: hashedPassword,
		Roles:    input.Roles,
		Active:   active,
	}

	if err := r.userRepo.Create(ctx, user); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	authInfo := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewUserCreatedEvent(eventbus.UserActor(authInfo.UserID), eventbus.UserEventPayload{
		UserID: user.UserID.String(), Username: user.Username,
	}))

	return user, nil
}

// UpdateUser handles the updateUser mutation.
// Only fields that the client sends (non-nil) are updated.
//
// Example:
//
//	mutation {
//	    updateUser(id: "some-uuid", input: { active: false }) {
//	        id username active
//	    }
//	}
func (r *userResolver) UpdateUser(ctx context.Context, id string, input model.UpdateUserInput) (*models.User, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	user, err := r.userRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	// Build a map of only the fields the client wants to change.
	// This is the "partial update" pattern — null fields are ignored.
	updates := buildUpdateMap(input)
	if len(updates) == 0 {
		return &user, nil
	}

	// If the password is being updated, hash it before storing
	if rawPwd, ok := updates["password"]; ok {
		hashed, err := auth.HashPassword(rawPwd.(string))
		if err != nil {
			return nil, fmt.Errorf("failed to hash password: %w", err)
		}
		updates["password"] = hashed
	}

	if err := r.userRepo.Update(ctx, &user, updates); err != nil {
		return nil, fmt.Errorf("failed to update user: %w", err)
	}

	// Re-fetch to return the updated state
	updated, err := r.userRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated user: %w", err)
	}

	authInfo := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewUserUpdatedEvent(eventbus.UserActor(authInfo.UserID), eventbus.UserEventPayload{
		UserID: updated.UserID.String(), Username: updated.Username,
	}))

	return &updated, nil
}

// DeleteUser handles the deleteUser mutation.
// Returns true on success.
func (r *userResolver) DeleteUser(ctx context.Context, id string) (bool, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("invalid user ID: %w", err)
	}

	user, err := r.userRepo.FindByID(ctx, uid)
	if err != nil {
		return false, fmt.Errorf("user not found: %w", err)
	}

	if err := r.userRepo.Delete(ctx, &user); err != nil {
		return false, fmt.Errorf("failed to delete user: %w", err)
	}

	authInfo := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewUserDeletedEvent(eventbus.UserActor(authInfo.UserID), eventbus.UserDeletedPayload{
		UserID: id,
	}))

	return true, nil
}

// UpdateOwnProfile lets a user update their own account.
// The user ID comes from the JWT (not from the client input) to prevent
// users from modifying other users' profiles.
func (r *userResolver) UpdateOwnProfile(ctx context.Context, input model.UpdateUserInput) (*models.User, error) {
	authInfo := gqlctx.AuthFromContext(ctx)
	uid, err := uuid.Parse(authInfo.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID in token: %w", err)
	}

	user, err := r.userRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	// Build update map but exclude "roles" — regular users should not
	// be able to escalate their own privileges.
	updates := buildUpdateMap(input)
	delete(updates, "roles")

	if len(updates) == 0 {
		return &user, nil
	}

	// Hash password if being updated
	if rawPwd, ok := updates["password"]; ok {
		hashed, err := auth.HashPassword(rawPwd.(string))
		if err != nil {
			return nil, fmt.Errorf("failed to hash password: %w", err)
		}
		updates["password"] = hashed
	}

	if err := r.userRepo.Update(ctx, &user, updates); err != nil {
		return nil, fmt.Errorf("failed to update profile: %w", err)
	}

	// Re-fetch to return the updated state
	updated, err := r.userRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated user: %w", err)
	}

	r.eventBus.Publish(eventbus.NewUserUpdatedEvent(eventbus.UserActor(authInfo.UserID), eventbus.UserEventPayload{
		UserID: updated.UserID.String(), Username: updated.Username,
	}))

	return &updated, nil
}

// maxHiddenIdentities bounds the per-operator hidden list so a single user
// document can't grow without limit.
const maxHiddenIdentities = 500

// SetHiddenIdentities replaces the caller's hidden-identity list — the
// usernames hidden from the host topology Users lens. The target user comes
// from the JWT (not client input) so a caller can only edit their own list.
// Names are normalized (trimmed, lowercased, deduped) so the frontend can
// compare against them case-insensitively without further work.
func (r *userResolver) SetHiddenIdentities(ctx context.Context, names []string) (*models.User, error) {
	authInfo := gqlctx.AuthFromContext(ctx)
	uid, err := uuid.Parse(authInfo.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID in token: %w", err)
	}

	user, err := r.userRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	normalized := normalizeHiddenIdentities(names)
	if err := r.userRepo.Update(ctx, &user, map[string]interface{}{
		"hidden_identities": normalized,
	}); err != nil {
		return nil, fmt.Errorf("failed to update hidden identities: %w", err)
	}

	updated, err := r.userRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated user: %w", err)
	}

	r.eventBus.Publish(eventbus.NewUserUpdatedEvent(eventbus.UserActor(authInfo.UserID), eventbus.UserEventPayload{
		UserID: updated.UserID.String(), Username: updated.Username,
	}))

	return &updated, nil
}

// Me returns the currently authenticated user.
// The user ID is extracted from the JWT token in the context.
func (r *userResolver) Me(ctx context.Context) (*models.User, error) {
	authInfo := gqlctx.AuthFromContext(ctx)
	uid, err := uuid.Parse(authInfo.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID in token: %w", err)
	}

	user, err := r.userRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}
	return &user, nil
}

// User returns a single user by their ID.
func (r *userResolver) User(ctx context.Context, id string) (*models.User, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	user, err := r.userRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}
	return &user, nil
}

// Users returns a cursor-paginated list of users with optional search.
//
// Uses the Relay Connection spec: first/after for forward pagination,
// last/before for backward pagination. Cursors are opaque strings
// encoding the item's position (createAt + _id).
//
// Example:
//
//	query {
//	    users(search: "admin", first: 10) {
//	        edges { node { id username roles active } cursor }
//	        pageInfo { hasNextPage endCursor }
//	        totalCount
//	    }
//	}
func (r *userResolver) Users(ctx context.Context, search *string, sortBy *model.UserSortField, sortDirection *model.SortDirection, first *int, after *string, last *int, before *string) (*model.UserConnection, error) {
	args, err := pagination.ParseArgs(first, after, last, before)
	if err != nil {
		return nil, fmt.Errorf("invalid pagination args: %w", err)
	}

	sortSpec, err := mapUserSort(sortBy, sortDirection)
	if err != nil {
		return nil, err
	}

	s := ""
	if search != nil {
		s = *search
	}

	total, err := r.userRepo.Count(ctx, s)
	if err != nil {
		return nil, fmt.Errorf("failed to count users: %w", err)
	}

	// Fetch limit+1 to detect if there are more items beyond this page.
	users, err := r.userRepo.FindWithCursor(ctx, s, sortSpec, args.Cursor, args.Limit+1, args.Forward)
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}

	hasMore := int64(len(users)) > args.Limit
	if hasMore {
		users = users[:args.Limit]
	}

	edges := make([]*model.UserEdge, len(users))
	for i := range users {
		edges[i] = &model.UserEdge{
			Node:   &users[i],
			Cursor: sortSpec.Cursor(&users[i]),
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

	return &model.UserConnection{
		Edges:      edges,
		PageInfo:   &pageInfo,
		TotalCount: int(total),
	}, nil
}

// UserSuggestions returns a lightweight list of users matching a search string.
// Designed for autocomplete pickers — returns only id and username.
func (r *userResolver) UserSuggestions(ctx context.Context, search string, first *int) ([]*model.UserSuggestion, error) {
	limit := int64(10)
	if first != nil {
		limit = int64(*first)
	}
	if limit > 50 {
		limit = 50
	}

	users, err := r.userRepo.FindSuggestions(ctx, search, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to search users: %w", err)
	}

	suggestions := make([]*model.UserSuggestion, len(users))
	for i := range users {
		suggestions[i] = &model.UserSuggestion{
			ID:       users[i].UserID.String(),
			Username: users[i].Username,
		}
	}

	return suggestions, nil
}

// ID converts the User's UUID to a GraphQL ID string.
// In the Go model, UserID is a uuid.UUID; in GraphQL, id is a String/ID.
func (r *userResolver) ID(ctx context.Context, obj *models.User) (string, error) {
	return obj.UserID.String(), nil
}

// CreatedAt converts the qmgo DefaultField timestamp to an ISO 8601 string.
// The DefaultField stores timestamps as time.Time, but GraphQL expects a string.
func (r *userResolver) CreatedAt(ctx context.Context, obj *models.User) (string, error) {
	return obj.CreateAt.Format(time.RFC3339), nil
}

// UpdatedAt converts the qmgo DefaultField timestamp to an ISO 8601 string.
func (r *userResolver) UpdatedAt(ctx context.Context, obj *models.User) (string, error) {
	return obj.UpdateAt.Format(time.RFC3339), nil
}

// normalizeHiddenIdentities trims, lowercases, and dedupes the names, dropping
// empties and preserving first-seen order. The result is capped at
// maxHiddenIdentities. It always returns a non-nil slice so the stored value
// (and the GraphQL [String!]! field) is a concrete list, never null.
func normalizeHiddenIdentities(names []string) []string {
	out := make([]string, 0, len(names))
	seen := make(map[string]struct{}, len(names))
	for _, n := range names {
		name := strings.ToLower(strings.TrimSpace(n))
		if name == "" {
			continue
		}
		if _, dup := seen[name]; dup {
			continue
		}
		seen[name] = struct{}{}
		out = append(out, name)
		if len(out) >= maxHiddenIdentities {
			break
		}
	}
	return out
}

// buildUpdateMap converts an UpdateUserInput into a map of field names to values.
// Only non-nil fields are included — this enables partial updates where the
// client only sends the fields they want to change.
func buildUpdateMap(input model.UpdateUserInput) map[string]interface{} {
	updates := make(map[string]interface{})

	if input.Username != nil {
		updates["username"] = *input.Username
	}
	if input.Password != nil {
		updates["password"] = *input.Password
	}
	if input.Roles != nil {
		// Convert []*string to []string (gqlgen uses pointers for nullable list items).
		roles := make([]string, 0, len(input.Roles))
		for _, r := range input.Roles {
			if r != nil {
				roles = append(roles, *r)
			}
		}
		updates["roles"] = roles
	}
	if input.Active != nil {
		updates["active"] = *input.Active
	}

	return updates
}

// mapUserSort converts the GraphQL sort args to the repository's sort spec.
// Nil args fall back to the default (createAt descending) — gqlgen fills the
// schema defaults, so nils only appear when a client sends explicit nulls.
func mapUserSort(sortBy *model.UserSortField, sortDirection *model.SortDirection) (repository.UserSort, error) {
	sort := repository.DefaultUserSort()

	if sortBy != nil {
		switch *sortBy {
		case model.UserSortFieldUsername:
			sort.Field = repository.UserSortFieldUsername
		case model.UserSortFieldCreatedAt:
			sort.Field = repository.UserSortFieldCreatedAt
		default:
			return repository.UserSort{}, fmt.Errorf("invalid user sort field: %s", *sortBy)
		}
	}

	if sortDirection != nil {
		switch *sortDirection {
		case model.SortDirectionAsc:
			sort.Ascending = true
		case model.SortDirectionDesc:
			sort.Ascending = false
		default:
			return repository.UserSort{}, fmt.Errorf("invalid sort direction: %s", *sortDirection)
		}
	}

	return sort, nil
}
