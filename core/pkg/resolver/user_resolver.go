package resolver

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
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

	// Queries
	Me(ctx context.Context) (*models.User, error)
	User(ctx context.Context, id string) (*models.User, error)
	Users(ctx context.Context, search *string, offset *int, limit *int) (*model.UserPagination, error)

	// Field resolvers — these handle fields where the Go model doesn't
	// map directly to the GraphQL type (e.g. UUID → String, time.Time → String).
	ID(ctx context.Context, obj *models.User) (string, error)
	CreatedAt(ctx context.Context, obj *models.User) (string, error)
	UpdatedAt(ctx context.Context, obj *models.User) (string, error)
}

type userResolver struct {
	userRepo repository.IUserRepository
}

// NewUserResolver creates a new user resolver with the given dependencies.
func NewUserResolver(userRepo repository.IUserRepository) IUserResolver {
	return &userResolver{userRepo: userRepo}
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

// Users returns a paginated list of users with optional search.
//
// Example:
//
//	query {
//	    users(search: "admin", offset: 0, limit: 10) {
//	        totalCount
//	        users { id username roles active }
//	    }
//	}
func (r *userResolver) Users(ctx context.Context, search *string, offset *int, limit *int) (*model.UserPagination, error) {
	// Apply defaults for optional pagination parameters.
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

	total, err := r.userRepo.Count(ctx, s)
	if err != nil {
		return nil, fmt.Errorf("failed to count users: %w", err)
	}

	users, err := r.userRepo.FindAll(ctx, s, off, lim)
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}

	// Convert []models.User to []*models.User (gqlgen uses pointers).
	ptrs := make([]*models.User, len(users))
	for i := range users {
		ptrs[i] = &users[i]
	}

	// Compute pagination flags for the frontend.
	// hasNextPage:     true if there are more users beyond this page
	// hasPreviousPage: true if we skipped some users (offset > 0)
	hasNext := off+lim < total
	hasPrev := off > 0

	return &model.UserPagination{
		Users:           ptrs,
		TotalCount:      int(total),
		HasNextPage:     hasNext,
		HasPreviousPage: hasPrev,
	}, nil
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
