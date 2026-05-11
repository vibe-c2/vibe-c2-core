package resolver

import (
	"context"
	"errors"
	"fmt"
	"sort"
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

// errCommentNotFound signals a commentId that doesn't exist on the target credential.
var errCommentNotFound = errors.New("comment not found on this credential")

// ICredentialResolver defines the business logic methods for the Credential entity.
// These map 1:1 to the GraphQL query, mutation, and field resolvers for Credential.
type ICredentialResolver interface {
	// Mutations
	CreateCredential(ctx context.Context, operationID string, input model.CreateCredentialInput) (*models.Credential, error)
	UpdateCredential(ctx context.Context, id string, input model.UpdateCredentialInput) (*models.Credential, error)
	DeleteCredential(ctx context.Context, id string) (bool, error)

	// Comment mutations (embedded doc management)
	AddCredentialComment(ctx context.Context, credentialID string, text string) (*models.Credential, error)
	UpdateCredentialComment(ctx context.Context, credentialID string, commentID string, text string) (*models.Credential, error)
	DeleteCredentialComment(ctx context.Context, credentialID string, commentID string) (*models.Credential, error)

	// Queries
	Credential(ctx context.Context, id string) (*models.Credential, error)
	Credentials(ctx context.Context, operationID string, search *string, typeArg *models.CredentialType, tags []string, validOnly *bool, first *int, after *string, last *int, before *string) (*model.CredentialConnection, error)
	CredentialTags(ctx context.Context, operationID string) ([]string, error)

	// Field resolvers for Credential type
	ID(ctx context.Context, obj *models.Credential) (string, error)
	OperationIDField(ctx context.Context, obj *models.Credential) (string, error)
	Comments(ctx context.Context, obj *models.Credential) ([]*models.CredentialComment, error)
	CreatedBy(ctx context.Context, obj *models.Credential) (*models.User, error)
	CreatedAt(ctx context.Context, obj *models.Credential) (string, error)
	UpdatedAt(ctx context.Context, obj *models.Credential) (string, error)

	// Field resolvers for CredentialComment type
	CommentID(ctx context.Context, obj *models.CredentialComment) (string, error)
	CommentAuthor(ctx context.Context, obj *models.CredentialComment) (*models.User, error)
	CommentCreatedAt(ctx context.Context, obj *models.CredentialComment) (string, error)
	CommentUpdatedAt(ctx context.Context, obj *models.CredentialComment) (string, error)
}

type credentialResolver struct {
	credRepo      repository.ICredentialRepository
	operationRepo repository.IOperationRepository
	userRepo      repository.IUserRepository
	eventBus      eventbus.IEventBus
}

// NewCredentialResolver creates a new credential resolver with the given dependencies.
func NewCredentialResolver(
	credRepo repository.ICredentialRepository,
	operationRepo repository.IOperationRepository,
	userRepo repository.IUserRepository,
	bus eventbus.IEventBus,
) ICredentialResolver {
	if bus == nil {
		bus = eventbus.NewNopEventBus()
	}
	return &credentialResolver{
		credRepo:      credRepo,
		operationRepo: operationRepo,
		userRepo:      userRepo,
		eventBus:      bus,
	}
}

// authorizeForOperation enforces a minimum operation role on the caller.
func (r *credentialResolver) authorizeForOperation(ctx context.Context, operationID uuid.UUID, minRole models.OperationRole) error {
	op, err := r.operationRepo.FindByID(ctx, operationID)
	if err != nil {
		return fmt.Errorf("operation not found: %w", err)
	}
	return authorization.AuthorizeOperationRole(ctx, &op, minRole)
}

// CreateCredential creates a new credential in an operation.
// Requires at least operator role in the operation.
func (r *credentialResolver) CreateCredential(ctx context.Context, operationID string, input model.CreateCredentialInput) (*models.Credential, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if !input.Type.IsValid() {
		return nil, fmt.Errorf("invalid credential type: %s", input.Type)
	}

	auth := gqlctx.AuthFromContext(ctx)
	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid caller ID: %w", err)
	}

	cred := &models.Credential{
		CredentialID: uuid.New(),
		OperationID:  opUID,
		Name:         name,
		Type:         input.Type,
		Username:     strDeref(input.Username),
		Password:     strDeref(input.Password),
		Keys:         normalizeStringSlice(input.Keys),
		IsValid:      boolDeref(input.IsValid, false),
		Tags:         normalizeTags(input.Tags),
		Comments:     []models.CredentialComment{},
		CreatedByID:  callerUID,
	}

	if err := r.credRepo.Create(ctx, cred); err != nil {
		return nil, fmt.Errorf("failed to create credential: %w", err)
	}

	r.eventBus.Publish(eventbus.NewCredentialCreatedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.CredentialEventPayload{
			CredentialID: cred.CredentialID.String(),
			OperationID:  cred.OperationID.String(),
		},
	))

	return cred, nil
}

// UpdateCredential modifies an existing credential.
// Requires at least operator role in the operation.
func (r *credentialResolver) UpdateCredential(ctx context.Context, id string, input model.UpdateCredentialInput) (*models.Credential, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid credential ID: %w", err)
	}

	cred, err := r.credRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("credential not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, cred.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	updates := make(map[string]interface{})
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, fmt.Errorf("name cannot be empty")
		}
		updates["name"] = name
	}
	if input.Type != nil {
		if !input.Type.IsValid() {
			return nil, fmt.Errorf("invalid credential type: %s", *input.Type)
		}
		updates["type"] = *input.Type
	}
	if input.Username != nil {
		updates["username"] = *input.Username
	}
	if input.Password != nil {
		updates["password"] = *input.Password
	}
	if input.Keys != nil {
		updates["keys"] = normalizeStringSlice(input.Keys)
	}
	if input.IsValid != nil {
		updates["is_valid"] = *input.IsValid
	}
	if input.Tags != nil {
		updates["tags"] = normalizeTags(input.Tags)
	}

	if len(updates) == 0 {
		return &cred, nil
	}

	if err := r.credRepo.Update(ctx, &cred, updates); err != nil {
		return nil, fmt.Errorf("failed to update credential: %w", err)
	}

	updated, err := r.credRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated credential: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewCredentialUpdatedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.CredentialEventPayload{
			CredentialID: updated.CredentialID.String(),
			OperationID:  updated.OperationID.String(),
		},
	))

	return &updated, nil
}

// DeleteCredential removes a credential by ID.
// Requires at least operator role in the operation.
func (r *credentialResolver) DeleteCredential(ctx context.Context, id string) (bool, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("invalid credential ID: %w", err)
	}

	cred, err := r.credRepo.FindByID(ctx, uid)
	if err != nil {
		return false, fmt.Errorf("credential not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, cred.OperationID, models.OperationRoleOperator); err != nil {
		return false, err
	}

	if err := r.credRepo.Delete(ctx, &cred); err != nil {
		return false, fmt.Errorf("failed to delete credential: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewCredentialDeletedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.CredentialEventPayload{
			CredentialID: cred.CredentialID.String(),
			OperationID:  cred.OperationID.String(),
		},
	))

	return true, nil
}

// AddCredentialComment appends a new comment to the credential.
// Requires at least operator role in the operation.
func (r *credentialResolver) AddCredentialComment(ctx context.Context, credentialID string, text string) (*models.Credential, error) {
	cUID, err := uuid.Parse(credentialID)
	if err != nil {
		return nil, fmt.Errorf("invalid credential ID: %w", err)
	}

	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return nil, fmt.Errorf("comment text cannot be empty")
	}

	cred, err := r.credRepo.FindByID(ctx, cUID)
	if err != nil {
		return nil, fmt.Errorf("credential not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, cred.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	auth := gqlctx.AuthFromContext(ctx)
	authorUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid caller ID: %w", err)
	}

	now := time.Now().UTC()
	comment := models.CredentialComment{
		CommentID: uuid.New(),
		AuthorID:  authorUID,
		Text:      trimmed,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := r.credRepo.AddComment(ctx, cUID, comment); err != nil {
		return nil, fmt.Errorf("failed to add comment: %w", err)
	}

	updated, err := r.credRepo.FindByID(ctx, cUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated credential: %w", err)
	}

	r.eventBus.Publish(eventbus.NewCredentialCommentAddedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.CredentialEventPayload{
			CredentialID: updated.CredentialID.String(),
			OperationID:  updated.OperationID.String(),
		},
	))

	return &updated, nil
}

// UpdateCredentialComment edits an existing comment on a credential.
// Author can edit own comments. Operation admins can edit any comment.
// Operation operators cannot edit other operators' comments.
func (r *credentialResolver) UpdateCredentialComment(ctx context.Context, credentialID string, commentID string, text string) (*models.Credential, error) {
	cUID, err := uuid.Parse(credentialID)
	if err != nil {
		return nil, fmt.Errorf("invalid credential ID: %w", err)
	}
	commentUID, err := uuid.Parse(commentID)
	if err != nil {
		return nil, fmt.Errorf("invalid comment ID: %w", err)
	}

	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return nil, fmt.Errorf("comment text cannot be empty")
	}

	cred, err := r.credRepo.FindByID(ctx, cUID)
	if err != nil {
		return nil, fmt.Errorf("credential not found: %w", err)
	}

	comment, ok := findComment(cred.Comments, commentUID)
	if !ok {
		return nil, errCommentNotFound
	}

	if err := r.authorizeForCommentMutation(ctx, cred.OperationID, comment.AuthorID); err != nil {
		return nil, err
	}

	if err := r.credRepo.UpdateComment(ctx, cUID, commentUID, trimmed, time.Now().UTC()); err != nil {
		return nil, fmt.Errorf("failed to update comment: %w", err)
	}

	updated, err := r.credRepo.FindByID(ctx, cUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated credential: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewCredentialCommentUpdatedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.CredentialEventPayload{
			CredentialID: updated.CredentialID.String(),
			OperationID:  updated.OperationID.String(),
		},
	))

	return &updated, nil
}

// DeleteCredentialComment removes a comment from a credential.
// Author can delete own comments. Operation admins can delete any comment.
func (r *credentialResolver) DeleteCredentialComment(ctx context.Context, credentialID string, commentID string) (*models.Credential, error) {
	cUID, err := uuid.Parse(credentialID)
	if err != nil {
		return nil, fmt.Errorf("invalid credential ID: %w", err)
	}
	commentUID, err := uuid.Parse(commentID)
	if err != nil {
		return nil, fmt.Errorf("invalid comment ID: %w", err)
	}

	cred, err := r.credRepo.FindByID(ctx, cUID)
	if err != nil {
		return nil, fmt.Errorf("credential not found: %w", err)
	}

	comment, ok := findComment(cred.Comments, commentUID)
	if !ok {
		return nil, errCommentNotFound
	}

	if err := r.authorizeForCommentMutation(ctx, cred.OperationID, comment.AuthorID); err != nil {
		return nil, err
	}

	if err := r.credRepo.RemoveComment(ctx, cUID, commentUID); err != nil {
		return nil, fmt.Errorf("failed to delete comment: %w", err)
	}

	updated, err := r.credRepo.FindByID(ctx, cUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated credential: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewCredentialCommentRemovedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.CredentialEventPayload{
			CredentialID: updated.CredentialID.String(),
			OperationID:  updated.OperationID.String(),
		},
	))

	return &updated, nil
}

// authorizeForCommentMutation enforces: caller must be the author OR be an
// operation admin (or app-level admin). Operators on the operation cannot
// touch comments written by someone else.
func (r *credentialResolver) authorizeForCommentMutation(ctx context.Context, operationID uuid.UUID, authorID uuid.UUID) error {
	op, err := r.operationRepo.FindByID(ctx, operationID)
	if err != nil {
		return fmt.Errorf("operation not found: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return fmt.Errorf("invalid caller ID: %w", err)
	}

	// Author always wins; verify the caller is still at least a viewer in the op.
	if callerUID == authorID {
		return authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleViewer)
	}

	// Otherwise require operation-admin (or app-admin via AuthorizeOperationRole).
	if err := authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleAdmin); err != nil {
		return fmt.Errorf("forbidden: only the comment author or an operation admin can modify this comment")
	}
	return nil
}

// Credential returns a single credential by ID.
// Requires at least viewer role in the operation.
func (r *credentialResolver) Credential(ctx context.Context, id string) (*models.Credential, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid credential ID: %w", err)
	}

	cred, err := r.credRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("credential not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, cred.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	return &cred, nil
}

// Credentials returns a cursor-paginated list of credentials for an operation.
// Requires at least viewer role in the operation.
func (r *credentialResolver) Credentials(ctx context.Context, operationID string, search *string, typeArg *models.CredentialType, tags []string, validOnly *bool, first *int, after *string, last *int, before *string) (*model.CredentialConnection, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	args, err := pagination.ParseArgs(first, after, last, before)
	if err != nil {
		return nil, fmt.Errorf("invalid pagination args: %w", err)
	}

	filter := repository.CredentialFilter{
		Tags:      normalizeTags(tags),
		ValidOnly: validOnly,
	}
	if search != nil {
		filter.Search = strings.TrimSpace(*search)
	}
	if typeArg != nil {
		if !typeArg.IsValid() {
			return nil, fmt.Errorf("invalid credential type: %s", *typeArg)
		}
		filter.Type = typeArg
	}

	total, err := r.credRepo.CountByOperationID(ctx, opUID, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to count credentials: %w", err)
	}

	creds, err := r.credRepo.FindByOperationIDWithCursor(ctx, opUID, filter, args.Cursor, args.Limit+1, args.Forward)
	if err != nil {
		return nil, fmt.Errorf("failed to list credentials: %w", err)
	}

	hasMore := int64(len(creds)) > args.Limit
	if hasMore {
		creds = creds[:args.Limit]
	}

	edges := make([]*model.CredentialEdge, len(creds))
	for i := range creds {
		cursor := pagination.EncodeCursor(creds[i].CreateAt, creds[i].Id)
		edges[i] = &model.CredentialEdge{
			Node:   &creds[i],
			Cursor: cursor,
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

	return &model.CredentialConnection{
		Edges:      edges,
		PageInfo:   &pageInfo,
		TotalCount: int(total),
	}, nil
}

// CredentialTags returns the deduplicated tag set across all credentials in the operation.
// Requires at least viewer role in the operation.
func (r *credentialResolver) CredentialTags(ctx context.Context, operationID string) ([]string, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	tags, err := r.credRepo.DistinctTagsByOperationID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("failed to list credential tags: %w", err)
	}

	// Mongo's distinct doesn't sort; sort for stable UI rendering.
	sort.Strings(tags)
	return tags, nil
}

// ID converts the Credential's UUID to a GraphQL ID string.
func (r *credentialResolver) ID(ctx context.Context, obj *models.Credential) (string, error) {
	return obj.CredentialID.String(), nil
}

// OperationIDField converts the OperationID UUID to a GraphQL ID string.
func (r *credentialResolver) OperationIDField(ctx context.Context, obj *models.Credential) (string, error) {
	return obj.OperationID.String(), nil
}

// Comments returns the credential's comment list as pointers for GraphQL resolution.
func (r *credentialResolver) Comments(ctx context.Context, obj *models.Credential) ([]*models.CredentialComment, error) {
	if len(obj.Comments) == 0 {
		return []*models.CredentialComment{}, nil
	}
	ptrs := make([]*models.CredentialComment, len(obj.Comments))
	for i := range obj.Comments {
		ptrs[i] = &obj.Comments[i]
	}
	return ptrs, nil
}

// CreatedBy resolves the User who created the credential, or nil if that user was deleted.
func (r *credentialResolver) CreatedBy(ctx context.Context, obj *models.Credential) (*models.User, error) {
	if obj.CreatedByID == uuid.Nil {
		return nil, nil
	}
	user, err := r.userRepo.FindByID(ctx, obj.CreatedByID)
	if err != nil {
		// Treat a missing creator as nullable rather than failing the whole query.
		return nil, nil
	}
	return &user, nil
}

// CreatedAt converts the qmgo DefaultField timestamp to an ISO 8601 string.
func (r *credentialResolver) CreatedAt(ctx context.Context, obj *models.Credential) (string, error) {
	return obj.CreateAt.Format(time.RFC3339), nil
}

// UpdatedAt converts the qmgo DefaultField timestamp to an ISO 8601 string.
func (r *credentialResolver) UpdatedAt(ctx context.Context, obj *models.Credential) (string, error) {
	return obj.UpdateAt.Format(time.RFC3339), nil
}

// CommentID converts the CredentialComment's UUID to a GraphQL ID string.
func (r *credentialResolver) CommentID(ctx context.Context, obj *models.CredentialComment) (string, error) {
	return obj.CommentID.String(), nil
}

// CommentAuthor resolves the User who authored the comment, or nil if the
// account was deleted. Mirrors CreatedBy — a missing author must not null
// out the entire credential payload via GraphQL error propagation.
func (r *credentialResolver) CommentAuthor(ctx context.Context, obj *models.CredentialComment) (*models.User, error) {
	if obj.AuthorID == uuid.Nil {
		return nil, nil
	}
	user, err := r.userRepo.FindByID(ctx, obj.AuthorID)
	if err != nil {
		return nil, nil
	}
	return &user, nil
}

// CommentCreatedAt converts the comment timestamp to an ISO 8601 string.
func (r *credentialResolver) CommentCreatedAt(ctx context.Context, obj *models.CredentialComment) (string, error) {
	return obj.CreatedAt.Format(time.RFC3339), nil
}

// CommentUpdatedAt converts the comment timestamp to an ISO 8601 string.
func (r *credentialResolver) CommentUpdatedAt(ctx context.Context, obj *models.CredentialComment) (string, error) {
	return obj.UpdatedAt.Format(time.RFC3339), nil
}

// --- helpers ---

func strDeref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func boolDeref(p *bool, fallback bool) bool {
	if p == nil {
		return fallback
	}
	return *p
}

// normalizeStringSlice trims each entry and drops empty entries.
// Returns a non-nil empty slice for nil input to keep BSON arrays consistent.
func normalizeStringSlice(in []string) []string {
	if len(in) == 0 {
		return []string{}
	}
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

// normalizeTags lowercases, trims, deduplicates while preserving first-seen order.
func normalizeTags(in []string) []string {
	if len(in) == 0 {
		return []string{}
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, t := range in {
		t = strings.ToLower(strings.TrimSpace(t))
		if t == "" {
			continue
		}
		if _, dup := seen[t]; dup {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	return out
}

// findComment returns the comment matching id and whether it was found.
func findComment(list []models.CredentialComment, id uuid.UUID) (models.CredentialComment, bool) {
	for _, c := range list {
		if c.CommentID == id {
			return c, true
		}
	}
	return models.CredentialComment{}, false
}

