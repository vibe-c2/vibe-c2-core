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
	"github.com/vibe-c2/vibe-c2-core/core/pkg/logger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// errCommentNotFound signals a commentId that doesn't exist on the target credential.
var errCommentNotFound = errors.New("comment not found on this credential")

// myCredentialsOpCap bounds the number of operations a single myCredentials
// query may target. Each explicit op triggers a membership check, and the
// resulting $in query fans out across the credentials collection — a hard
// cap keeps both costs predictable. Callers (typically the global Findings
// picker) are expected to narrow their selection or fall back to nil
// (= "all my operations", which the resolver derives in one repo call).
const myCredentialsOpCap = 100

// Limits on the operator-defined Properties bag. Picked to be roomy for any
// real metadata while still preventing pathological documents (a single
// credential mushrooming into multi-MB BSON via this field).
const (
	maxCredentialProperties       = 32
	maxCredentialPropertyNameLen  = 64
	maxCredentialPropertyValueLen = 4096
)

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
	Credentials(ctx context.Context, operationID string, search *string, searchFields []model.CredentialSearchField, typeArg *models.CredentialType, tags []string, validOnly *bool, sortBy *model.CredentialSortField, sortDirection *model.SortDirection, first *int, after *string, last *int, before *string) (*model.CredentialConnection, error)
	CredentialTags(ctx context.Context, operationID string) ([]string, error)

	// Cross-operation queries — power the "global" Findings page. See
	// resolveAccessibleOperationIDs for the operationIDs semantics:
	//   nil   ⇒ caller's full membership set
	//   []    ⇒ explicit empty, returns empty result
	//   [...] ⇒ resolver authorizes each id (viewer role minimum)
	MyCredentials(ctx context.Context, operationIDs []string, search *string, searchFields []model.CredentialSearchField, typeArg *models.CredentialType, tags []string, validOnly *bool, sortBy *model.CredentialSortField, sortDirection *model.SortDirection, first *int, after *string, last *int, before *string) (*model.CredentialConnection, error)
	MyCredentialTags(ctx context.Context, operationIDs []string) ([]string, error)

	// Field resolvers for Credential type
	ID(ctx context.Context, obj *models.Credential) (string, error)
	OperationIDField(ctx context.Context, obj *models.Credential) (string, error)
	Operation(ctx context.Context, obj *models.Credential) (*models.Operation, error)
	Comments(ctx context.Context, obj *models.Credential) ([]*models.CredentialComment, error)
	ViewerCanModerateComments(ctx context.Context, obj *models.Credential) (bool, error)
	CreatedBy(ctx context.Context, obj *models.Credential) (*models.User, error)
	BacklinkCount(ctx context.Context, obj *models.Credential) (int, error)
	Backlinks(ctx context.Context, obj *models.Credential) ([]*models.WikiDocument, error)
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
	// wikiDocRes owns the wiki side of the cross-domain backlinks join.
	// Credential.backlinks / Credential.backlinkCount delegate to it. The
	// dependency arrow intentionally points from credentials → wiki — the
	// inverse index lives in `wiki_documents.credential_references`, so the
	// query naturally belongs in wiki land.
	wikiDocRes IWikiDocumentResolver
	// taskRepo (optional) is used by DeleteCredential to strip the deleted
	// credential's UUID from every task's credential_references array. Nil
	// is acceptable — the resolver skips the cleanup with no error so
	// existing unit tests / wiring that predates Tasks continue to work.
	taskRepo repository.ITaskRepository
	eventBus eventbus.IEventBus
}

// NewCredentialResolver creates a new credential resolver with the given dependencies.
// taskRepo is optional; pass nil if the task feature is not yet wired into
// this caller (tests, embedded contexts).
func NewCredentialResolver(
	credRepo repository.ICredentialRepository,
	operationRepo repository.IOperationRepository,
	userRepo repository.IUserRepository,
	wikiDocRes IWikiDocumentResolver,
	taskRepo repository.ITaskRepository,
	bus eventbus.IEventBus,
) ICredentialResolver {
	if bus == nil {
		bus = eventbus.NewNopEventBus()
	}
	return &credentialResolver{
		credRepo:      credRepo,
		operationRepo: operationRepo,
		userRepo:      userRepo,
		wikiDocRes:    wikiDocRes,
		taskRepo:      taskRepo,
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

	properties, err := normalizeCredentialProperties(input.Properties)
	if err != nil {
		return nil, err
	}

	cred := &models.Credential{
		CredentialID: uuid.New(),
		OperationID:  opUID,
		Name:         name,
		Type:         input.Type,
		Username:     strDeref(input.Username),
		Password:     strDeref(input.Password),
		Keys:         normalizeCredentialKeys(input.Keys),
		Properties:   properties,
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
		updates["keys"] = normalizeCredentialKeys(input.Keys)
	}
	if input.Properties != nil {
		properties, err := normalizeCredentialProperties(input.Properties)
		if err != nil {
			return nil, err
		}
		updates["properties"] = properties
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

	// Strip this credential id from credential_references on every wiki doc
	// in the operation so the inverse index doesn't carry dangling UUIDs.
	// Best-effort — a failed cleanup leaves a stale pointer but does not
	// undo the user-visible delete. The chip render path already handles
	// "credential not found" gracefully.
	if r.wikiDocRes != nil {
		if err := r.wikiDocRes.CleanupCredentialReferences(ctx, cred.OperationID, cred.CredentialID); err != nil {
			logger.From(ctx).Warn("cleanup of credential backlinks failed",
				zap.String("credential_id", cred.CredentialID.String()),
				zap.Error(err),
			)
		}
	}

	// Same cleanup, task side — strip the dead credential id from every
	// task's credential_references array. Best-effort: a failed pull leaves
	// a stale pointer that the task field resolver silently drops at read
	// time. taskRepo is optional in this constructor so tests and any
	// pre-Tasks wiring continue to compile.
	if r.taskRepo != nil {
		if err := r.taskRepo.PullCredentialReference(ctx, cred.OperationID, cred.CredentialID); err != nil {
			logger.From(ctx).Warn("cleanup of task credential references failed",
				zap.String("credential_id", cred.CredentialID.String()),
				zap.Error(err),
			)
		}
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
func (r *credentialResolver) Credentials(ctx context.Context, operationID string, search *string, searchFields []model.CredentialSearchField, typeArg *models.CredentialType, tags []string, validOnly *bool, sortBy *model.CredentialSortField, sortDirection *model.SortDirection, first *int, after *string, last *int, before *string) (*model.CredentialConnection, error) {
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

	sortSpec, err := mapCredentialSort(sortBy, sortDirection)
	if err != nil {
		return nil, err
	}

	searchFieldsMapped, err := mapCredentialSearchFields(searchFields)
	if err != nil {
		return nil, err
	}

	filter := repository.CredentialFilter{
		Tags:         normalizeTags(tags),
		ValidOnly:    validOnly,
		SearchFields: searchFieldsMapped,
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

	creds, err := r.credRepo.FindByOperationIDWithCursor(ctx, opUID, filter, sortSpec, args.Cursor, args.Limit+1, args.Forward)
	if err != nil {
		return nil, fmt.Errorf("failed to list credentials: %w", err)
	}

	hasMore := int64(len(creds)) > args.Limit
	if hasMore {
		creds = creds[:args.Limit]
	}

	edges := make([]*model.CredentialEdge, len(creds))
	for i := range creds {
		// Edge cursors are sort-specific: they carry the active sort
		// column's value (see CredentialSort.Cursor).
		edges[i] = &model.CredentialEdge{
			Node:   &creds[i],
			Cursor: sortSpec.Cursor(&creds[i]),
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

// resolveAccessibleOperationIDs maps the optional `operationIDs` argument to a
// concrete, authorized list of operation UUIDs for the cross-operation queries.
//
//   - nil          ⇒ caller's full membership set (one repo call). Note that
//     app-admins also receive their membership set here, not every operation
//     in the system — admins who want all ops must select them explicitly.
//   - empty slice  ⇒ explicit empty selection. Returns (nil, nil, false) and
//     the caller should short-circuit to an empty connection.
//   - non-empty    ⇒ each id parsed and authorized at OperationRoleViewer.
//     Any unauthorized id returns the resolver error verbatim. Length is
//     capped at myCredentialsOpCap.
//
// Returns (opUIDs, nil, true) on a fillable selection, (nil, nil, false) for
// the explicit-empty case, and (nil, err, false) on any failure.
func (r *credentialResolver) resolveAccessibleOperationIDs(ctx context.Context, operationIDs []string) ([]uuid.UUID, error, bool) {
	if operationIDs == nil {
		auth := gqlctx.AuthFromContext(ctx)
		callerUID, err := uuid.Parse(auth.UserID)
		if err != nil {
			return nil, fmt.Errorf("invalid caller ID: %w", err), false
		}
		ops, err := r.operationRepo.FindByMemberID(ctx, callerUID)
		if err != nil {
			return nil, fmt.Errorf("failed to list accessible operations: %w", err), false
		}
		if len(ops) == 0 {
			return nil, nil, false
		}
		opUIDs := make([]uuid.UUID, len(ops))
		for i := range ops {
			opUIDs[i] = ops[i].OperationID
		}
		return opUIDs, nil, true
	}

	if len(operationIDs) == 0 {
		return nil, nil, false
	}
	if len(operationIDs) > myCredentialsOpCap {
		return nil, fmt.Errorf("too many operations selected (max %d)", myCredentialsOpCap), false
	}

	opUIDs := make([]uuid.UUID, 0, len(operationIDs))
	for _, raw := range operationIDs {
		opUID, err := uuid.Parse(raw)
		if err != nil {
			return nil, fmt.Errorf("invalid operation ID %q: %w", raw, err), false
		}
		if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleViewer); err != nil {
			return nil, err, false
		}
		opUIDs = append(opUIDs, opUID)
	}
	return opUIDs, nil, true
}

// MyCredentials returns a cursor-paginated list of credentials across the
// caller's accessible operations. See the GraphQL schema doc for the
// operationIDs semantics. The pagination shape mirrors Credentials exactly.
func (r *credentialResolver) MyCredentials(ctx context.Context, operationIDs []string, search *string, searchFields []model.CredentialSearchField, typeArg *models.CredentialType, tags []string, validOnly *bool, sortBy *model.CredentialSortField, sortDirection *model.SortDirection, first *int, after *string, last *int, before *string) (*model.CredentialConnection, error) {
	opUIDs, err, ok := r.resolveAccessibleOperationIDs(ctx, operationIDs)
	if err != nil {
		return nil, err
	}

	args, err := pagination.ParseArgs(first, after, last, before)
	if err != nil {
		return nil, fmt.Errorf("invalid pagination args: %w", err)
	}

	sortSpec, err := mapCredentialSort(sortBy, sortDirection)
	if err != nil {
		return nil, err
	}

	if !ok {
		// Explicit empty selection (or caller has zero accessible ops).
		return &model.CredentialConnection{
			Edges:      []*model.CredentialEdge{},
			PageInfo:   &pagination.PageInfo{},
			TotalCount: 0,
		}, nil
	}

	searchFieldsMapped, err := mapCredentialSearchFields(searchFields)
	if err != nil {
		return nil, err
	}

	filter := repository.CredentialFilter{
		Tags:         normalizeTags(tags),
		ValidOnly:    validOnly,
		SearchFields: searchFieldsMapped,
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

	total, err := r.credRepo.CountByOperationIDs(ctx, opUIDs, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to count credentials: %w", err)
	}

	creds, err := r.credRepo.FindByOperationIDsWithCursor(ctx, opUIDs, filter, sortSpec, args.Cursor, args.Limit+1, args.Forward)
	if err != nil {
		return nil, fmt.Errorf("failed to list credentials: %w", err)
	}

	hasMore := int64(len(creds)) > args.Limit
	if hasMore {
		creds = creds[:args.Limit]
	}

	edges := make([]*model.CredentialEdge, len(creds))
	for i := range creds {
		// Edge cursors are sort-specific: they carry the active sort
		// column's value (see CredentialSort.Cursor).
		edges[i] = &model.CredentialEdge{
			Node:   &creds[i],
			Cursor: sortSpec.Cursor(&creds[i]),
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

// MyCredentialTags returns the deduplicated tag set across credentials in the
// caller's accessible operations. Same auth model as MyCredentials.
func (r *credentialResolver) MyCredentialTags(ctx context.Context, operationIDs []string) ([]string, error) {
	opUIDs, err, ok := r.resolveAccessibleOperationIDs(ctx, operationIDs)
	if err != nil {
		return nil, err
	}
	if !ok {
		return []string{}, nil
	}

	tags, err := r.credRepo.DistinctTagsByOperationIDs(ctx, opUIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to list credential tags: %w", err)
	}

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

// Operation resolves the credential's parent Operation via a DB lookup.
// Used by the global Findings page to display which operation each row
// belongs to. Authorization is upstream: the credential was already returned
// to the caller, which means they had at least viewer access to its op via
// the parent query (Credential / Credentials / MyCredentials).
func (r *credentialResolver) Operation(ctx context.Context, obj *models.Credential) (*models.Operation, error) {
	op, err := r.operationRepo.FindByID(ctx, obj.OperationID)
	if err != nil {
		return nil, fmt.Errorf("failed to load operation: %w", err)
	}
	return &op, nil
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

// ViewerCanModerateComments reports whether the caller can delete any comment
// on this credential. App-level admins always can; operation admins can on
// credentials in their operation. Authors can always delete their own comments
// regardless of this flag.
func (r *credentialResolver) ViewerCanModerateComments(ctx context.Context, obj *models.Credential) (bool, error) {
	auth := gqlctx.AuthFromContext(ctx)
	for _, role := range auth.Roles {
		if role == "admin" {
			return true, nil
		}
	}
	op, err := r.operationRepo.FindByID(ctx, obj.OperationID)
	if err != nil {
		return false, nil
	}
	return authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleAdmin) == nil, nil
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

// BacklinkCount resolves the cheap count form of Credential.backlinks. Used
// by the credentials table to render a per-row badge without pulling the full
// document list. Delegates to the wiki resolver so the query lives in the
// package that owns the inverse index.
func (r *credentialResolver) BacklinkCount(ctx context.Context, obj *models.Credential) (int, error) {
	if r.wikiDocRes == nil || obj == nil {
		return 0, nil
	}
	return r.wikiDocRes.CredentialBacklinkCount(ctx, obj)
}

// Backlinks resolves the full Credential.backlinks list. Loaded on demand
// (e.g. when the credential details dialog opens). Delegates to the wiki
// resolver — see BacklinkCount for the dependency-direction rationale.
func (r *credentialResolver) Backlinks(ctx context.Context, obj *models.Credential) ([]*models.WikiDocument, error) {
	if r.wikiDocRes == nil || obj == nil {
		return []*models.WikiDocument{}, nil
	}
	return r.wikiDocRes.CredentialBacklinks(ctx, obj)
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
// strDeref, boolDeref, and callerUIDFromCtx live in helpers.go.

// normalizeCredentialKeys trims each field and drops entries where both name
// and content are empty after trimming. Returns a non-nil empty slice for nil
// input to keep BSON arrays consistent. Whitespace-only fields are normalised
// to "" so the DB never stores accidental spaces.
func normalizeCredentialKeys(in []*model.CredentialKeyInput) []models.CredentialKey {
	if len(in) == 0 {
		return []models.CredentialKey{}
	}
	out := make([]models.CredentialKey, 0, len(in))
	for _, k := range in {
		if k == nil {
			continue
		}
		name := strings.TrimSpace(k.Name)
		content := strings.TrimSpace(k.Content)
		if name == "" && content == "" {
			continue
		}
		out = append(out, models.CredentialKey{Name: name, Content: content})
	}
	return out
}

// normalizeCredentialProperties trims and validates the operator-defined
// metadata bag. Drops entries where both fields are blank (a no-op row in the
// editor); rejects rows that have a value but no name, duplicate names, an
// over-long name/value, or too many entries overall. Names are compared
// case-sensitively after trimming.
func normalizeCredentialProperties(in []*model.CredentialPropertyInput) ([]models.CredentialProperty, error) {
	if len(in) == 0 {
		return []models.CredentialProperty{}, nil
	}
	out := make([]models.CredentialProperty, 0, len(in))
	seen := make(map[string]struct{}, len(in))
	for _, p := range in {
		if p == nil {
			continue
		}
		name := strings.TrimSpace(p.Name)
		value := strings.TrimSpace(p.Value)
		if name == "" && value == "" {
			continue
		}
		if name == "" {
			return nil, fmt.Errorf("property name is required")
		}
		if len(name) > maxCredentialPropertyNameLen {
			return nil, fmt.Errorf("property name %q exceeds %d characters", name, maxCredentialPropertyNameLen)
		}
		if len(value) > maxCredentialPropertyValueLen {
			return nil, fmt.Errorf("property %q value exceeds %d characters", name, maxCredentialPropertyValueLen)
		}
		if _, dup := seen[name]; dup {
			return nil, fmt.Errorf("duplicate property name %q", name)
		}
		seen[name] = struct{}{}
		out = append(out, models.CredentialProperty{Name: name, Value: value})
	}
	if len(out) > maxCredentialProperties {
		return nil, fmt.Errorf("too many properties (max %d)", maxCredentialProperties)
	}
	return out, nil
}

// normalizeTags lowercases, trims, deduplicates while preserving first-seen order.
// mapCredentialSearchFields translates the GraphQL search-field enum into the
// repository field set. An empty/nil input returns nil, which the repository
// reads as "search all default fields" (the historical behaviour). An unknown
// member is rejected rather than skipped: silently dropping it would make the
// repository fall back to searching *all* fields, widening the scope the caller
// asked to narrow. gqlgen validates the enum upstream, so this only fires if
// the schema and this switch ever diverge.
// mapCredentialSort translates the GraphQL sortBy/sortDirection arguments to
// the repository's sort spec. Both arguments carry schema defaults
// (CREATED_AT / DESC), so nil only appears when a client sends an explicit
// null — which means the same thing: "use the default".
func mapCredentialSort(sortBy *model.CredentialSortField, sortDirection *model.SortDirection) (repository.CredentialSort, error) {
	sort := repository.DefaultCredentialSort()

	if sortBy != nil {
		switch *sortBy {
		case model.CredentialSortFieldName:
			sort.Field = repository.CredentialSortFieldName
		case model.CredentialSortFieldUsername:
			sort.Field = repository.CredentialSortFieldUsername
		case model.CredentialSortFieldCreatedAt:
			sort.Field = repository.CredentialSortFieldCreatedAt
		default:
			return repository.CredentialSort{}, fmt.Errorf("invalid credential sort field: %s", *sortBy)
		}
	}

	if sortDirection != nil {
		switch *sortDirection {
		case model.SortDirectionAsc:
			sort.Ascending = true
		case model.SortDirectionDesc:
			sort.Ascending = false
		default:
			return repository.CredentialSort{}, fmt.Errorf("invalid sort direction: %s", *sortDirection)
		}
	}

	return sort, nil
}

func mapCredentialSearchFields(in []model.CredentialSearchField) ([]repository.CredentialSearchField, error) {
	if len(in) == 0 {
		return nil, nil
	}
	out := make([]repository.CredentialSearchField, 0, len(in))
	for _, f := range in {
		switch f {
		case model.CredentialSearchFieldName:
			out = append(out, repository.CredentialSearchFieldName)
		case model.CredentialSearchFieldUsername:
			out = append(out, repository.CredentialSearchFieldUsername)
		case model.CredentialSearchFieldPassword:
			out = append(out, repository.CredentialSearchFieldPassword)
		case model.CredentialSearchFieldProperties:
			out = append(out, repository.CredentialSearchFieldProperties)
		default:
			return nil, fmt.Errorf("invalid credential search field: %s", f)
		}
	}
	return out, nil
}

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
