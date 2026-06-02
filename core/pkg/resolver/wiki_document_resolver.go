package resolver

import (
	"context"
	"fmt"
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
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
	"go.uber.org/zap"
)

const (
	maxTitleLength  = 200
	maxContentSize  = 1 * 1024 * 1024 // 1 MB
	maxNestingDepth = 10
	maxSearchLength = 200
	// maxBacklinks caps both the standalone query and the WikiDocument.backlinks
	// field. Past this point the UI would degrade into a wall of rows and the
	// right fix is editing the referrers, not paginating the list.
	maxBacklinks = 200
)

// IWikiDocumentResolver defines the business logic methods for wiki documents and backups.
type IWikiDocumentResolver interface {
	// Document mutations
	CreateWikiDocument(ctx context.Context, operationID string, input model.CreateWikiDocumentInput) (*models.WikiDocument, error)
	UpdateWikiDocument(ctx context.Context, id string, input model.UpdateWikiDocumentInput) (*models.WikiDocument, error)
	ReorderWikiDocumentSiblings(ctx context.Context, input model.ReorderWikiDocumentSiblingsInput) ([]*models.WikiDocument, error)
	DeleteWikiDocument(ctx context.Context, id string) (bool, error)
	DuplicateWikiDocument(ctx context.Context, id string, withChildren *bool) (*models.WikiDocument, error)
	RestoreWikiDocument(ctx context.Context, id string, cascade *bool) (*models.WikiDocument, error)
	PermanentlyDeleteWikiDocument(ctx context.Context, id string) (bool, error)
	EmptyWikiDocumentTrash(ctx context.Context, operationID string) (bool, error)

	// Backup mutations
	CreateWikiDocumentBackup(ctx context.Context, documentID string, description *string) (*models.WikiDocumentBackup, error)
	RestoreWikiDocumentBackup(ctx context.Context, documentID string, backupID string) (*models.WikiDocument, error)
	DeleteWikiDocumentBackup(ctx context.Context, id string) (bool, error)

	// Document queries
	WikiDocument(ctx context.Context, id string) (*models.WikiDocument, error)
	WikiDocuments(ctx context.Context, operationID string, parentDocumentID *string, search *string, sort *model.WikiDocumentSort, first *int, after *string, last *int, before *string) (*model.WikiDocumentConnection, error)
	WikiDocumentTree(ctx context.Context, operationID string) ([]*models.WikiDocument, error)
	WikiDocumentChildren(ctx context.Context, operationID string, parentDocumentID *string) ([]*models.WikiDocument, error)
	WikiDocumentTreeRevealPath(ctx context.Context, documentID string) ([]*models.WikiDocument, error)
	WikiDocumentTrash(ctx context.Context, operationID string, first *int, after *string, last *int, before *string) (*model.WikiDocumentConnection, error)
	WikiDocumentTrashCount(ctx context.Context, operationID string) (int, error)
	WikiDocumentTrashedDescendants(ctx context.Context, documentID string) ([]*models.WikiDocument, error)
	WikiDocumentBacklinks(ctx context.Context, documentID string) ([]*models.WikiDocument, error)
	// WikiDocumentsReferencingCredential is the standalone counterpart of
	// Credential.backlinks — the cross-domain join that powers the
	// "Referenced in" section on the Findings credentials details dialog.
	WikiDocumentsReferencingCredential(ctx context.Context, credentialID string) ([]*models.WikiDocument, error)
	// CredentialBacklinks resolves Credential.backlinks. Same data as the
	// standalone query above; pulled out so the field resolver in the
	// credential resolver can delegate here without re-authorizing.
	CredentialBacklinks(ctx context.Context, cred *models.Credential) ([]*models.WikiDocument, error)
	// CredentialBacklinkCount resolves Credential.backlinkCount as a single
	// Mongo countDocuments. Cheap enough to call per-row from the list
	// resolver; the batched variant below is preferred when a page of
	// credentials is being rendered.
	CredentialBacklinkCount(ctx context.Context, cred *models.Credential) (int, error)
	// WikiDocumentsReferencingHash is the standalone counterpart of
	// Hash.backlinks — the cross-domain join that powers the hash details
	// dialog's "Referenced in" section. Sibling of
	// WikiDocumentsReferencingCredential.
	WikiDocumentsReferencingHash(ctx context.Context, hashID string) ([]*models.WikiDocument, error)
	// HashBacklinks resolves Hash.backlinks. Same data as the standalone query
	// but auth happens upstream (gqlgen passes the authorized parent hash).
	HashBacklinks(ctx context.Context, hash *models.Hash) ([]*models.WikiDocument, error)
	// HashBacklinkCount resolves Hash.backlinkCount as a single count.
	HashBacklinkCount(ctx context.Context, hash *models.Hash) (int, error)
	// CleanupHashReferences strips a deleted hash's id from hash_references
	// across the operation's wiki documents. Sibling of
	// CleanupCredentialReferences.
	CleanupHashReferences(ctx context.Context, operationID, hashID uuid.UUID) error
	// CleanupCredentialReferences strips a deleted credential's id from
	// credential_references across the operation's wiki documents. Called
	// from the credential delete path so dangling UUIDs don't accumulate
	// in the inverse index.
	CleanupCredentialReferences(ctx context.Context, operationID, credentialID uuid.UUID) error
	WikiSearch(ctx context.Context, operationID string, scope *string, query string, offset *int, limit *int) (*model.WikiSearchConnection, error)

	// Backup queries
	WikiDocumentBackups(ctx context.Context, documentID string, trigger *models.WikiDocumentBackupTrigger, first *int, after *string, last *int, before *string) (*model.WikiDocumentBackupConnection, error)
	WikiDocumentBackup(ctx context.Context, id string) (*models.WikiDocumentBackup, error)

	// Presence queries
	WikiDocumentPresence(ctx context.Context, documentID string) (*model.WikiDocumentPresence, error)
	WikiOperationPresence(ctx context.Context, operationID string) ([]*model.WikiDocumentPresence, error)

	// WikiDocument field resolvers
	WikiDocumentID(ctx context.Context, obj *models.WikiDocument) (string, error)
	WikiDocumentOperationID(ctx context.Context, obj *models.WikiDocument) (string, error)
	WikiDocumentParentDocument(ctx context.Context, obj *models.WikiDocument) (*models.WikiDocument, error)
	WikiDocumentParentDocumentID(ctx context.Context, obj *models.WikiDocument) (*string, error)
	WikiDocumentChildDocuments(ctx context.Context, obj *models.WikiDocument) ([]*models.WikiDocument, error)
	WikiDocumentChildCount(ctx context.Context, obj *models.WikiDocument) (int, error)
	WikiDocumentBacklinksField(ctx context.Context, obj *models.WikiDocument) ([]*models.WikiDocument, error)
	WikiDocumentAncestors(ctx context.Context, obj *models.WikiDocument) ([]*model.WikiDocumentAncestor, error)
	WikiDocumentCreatedBy(ctx context.Context, obj *models.WikiDocument) (*models.User, error)
	WikiDocumentLastUpdatedBy(ctx context.Context, obj *models.WikiDocument) (*models.User, error)
	WikiDocumentLastUpdatedAt(ctx context.Context, obj *models.WikiDocument) (*string, error)
	WikiDocumentDeletedBy(ctx context.Context, obj *models.WikiDocument) (*models.User, error)
	WikiDocumentLastBackupAt(ctx context.Context, obj *models.WikiDocument) (*string, error)
	WikiDocumentDeletedAt(ctx context.Context, obj *models.WikiDocument) (*string, error)
	WikiDocumentCreatedAt(ctx context.Context, obj *models.WikiDocument) (string, error)
	WikiDocumentUpdatedAt(ctx context.Context, obj *models.WikiDocument) (string, error)

	// WikiDocumentBackup field resolvers
	WikiDocumentBackupID(ctx context.Context, obj *models.WikiDocumentBackup) (string, error)
	WikiDocumentBackupDocumentID(ctx context.Context, obj *models.WikiDocumentBackup) (string, error)
	WikiDocumentBackupContentLength(ctx context.Context, obj *models.WikiDocumentBackup) (int, error)
	WikiDocumentBackupCreatedBy(ctx context.Context, obj *models.WikiDocumentBackup) (*models.User, error)
	WikiDocumentBackupCreatedAt(ctx context.Context, obj *models.WikiDocumentBackup) (string, error)
}

type wikiDocumentResolver struct {
	docRepo       repository.IWikiDocumentRepository
	backupRepo    repository.IWikiDocumentBackupRepository
	operationRepo repository.IOperationRepository
	userRepo      repository.IUserRepository
	visitRepo     repository.IWikiDocumentVisitRepository
	// credRepo is only consulted by the credential-backlinks join — it lets
	// the standalone `wikiDocumentsReferencingCredential` query resolve the
	// credential's operation_id before authorizing and querying referrers.
	// The field resolvers on Credential never need it because gqlgen passes
	// the parent credential as `obj`.
	credRepo repository.ICredentialRepository
	// hashRepo is the hash-backlinks counterpart of credRepo — consulted only
	// by the standalone `wikiDocumentsReferencingHash` query to resolve a
	// hash's operation_id before authorizing and querying referrers.
	hashRepo repository.IHashRepository
	// taskRepo (optional) is used by the hard-delete paths to strip the
	// deleted document's UUID from every task's wiki_references array. Nil
	// is acceptable for tests and any pre-Tasks wiring.
	taskRepo repository.ITaskRepository
	eventBus eventbus.IEventBus
	presence *wiki.PresenceTracker
}

// NewWikiDocumentResolver creates a new wiki document resolver with the given dependencies.
// taskRepo is optional; pass nil if Tasks are not wired (tests).
func NewWikiDocumentResolver(
	docRepo repository.IWikiDocumentRepository,
	backupRepo repository.IWikiDocumentBackupRepository,
	operationRepo repository.IOperationRepository,
	userRepo repository.IUserRepository,
	visitRepo repository.IWikiDocumentVisitRepository,
	credRepo repository.ICredentialRepository,
	hashRepo repository.IHashRepository,
	taskRepo repository.ITaskRepository,
	eventBus eventbus.IEventBus,
	presence *wiki.PresenceTracker,
) IWikiDocumentResolver {
	return &wikiDocumentResolver{
		docRepo:       docRepo,
		backupRepo:    backupRepo,
		operationRepo: operationRepo,
		userRepo:      userRepo,
		visitRepo:     visitRepo,
		credRepo:      credRepo,
		hashRepo:      hashRepo,
		taskRepo:      taskRepo,
		eventBus:      eventBus,
		presence:      presence,
	}
}

// stampLastUpdated adds last_updated_by_id/last_updated_at to a $set map so
// every metadata mutation attributes the edit to the caller. Callers that use
// this inside an update path get "lastUpdatedBy" semantics matching the
// content-edit path written by Hocuspocus. Safe to call even if the caller's
// UserID is empty (in which case attribution is skipped and caller gets only
// the timestamp) — but that path only triggers when JWTAuth middleware was
// bypassed, which should not happen in protected routes.
func stampLastUpdated(updates map[string]interface{}, callerID uuid.UUID) {
	updates["last_updated_by_id"] = callerID
	updates["last_updated_at"] = time.Now().UTC()
}

// authorizeForOperation loads the operation and checks the caller's role.
func (r *wikiDocumentResolver) authorizeForOperation(ctx context.Context, operationID uuid.UUID, minRole models.OperationRole) error {
	op, err := r.operationRepo.FindByID(ctx, operationID)
	if err != nil {
		return fmt.Errorf("operation not found: %w", err)
	}
	return authorization.AuthorizeOperationRole(ctx, &op, minRole)
}

func (r *wikiDocumentResolver) wikiDocPayload(doc *models.WikiDocument) eventbus.WikiDocumentEventPayload {
	p := eventbus.WikiDocumentEventPayload{
		DocumentID:  doc.DocumentID.String(),
		OperationID: doc.OperationID.String(),
		Title:       doc.Title,
	}
	if doc.ParentDocumentID != nil {
		p.ParentDocumentID = doc.ParentDocumentID.String()
	}
	if doc.DeletedAt != nil {
		p.DeletedAt = doc.DeletedAt.Format(time.RFC3339)
	}
	return p
}

// --- Document mutations ---

func (r *wikiDocumentResolver) CreateWikiDocument(ctx context.Context, operationID string, input model.CreateWikiDocumentInput) (*models.WikiDocument, error) {
	auth := gqlctx.AuthFromContext(ctx)

	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	// Validate title length
	if len(input.Title) > maxTitleLength {
		return nil, fmt.Errorf("title exceeds maximum length of %d characters", maxTitleLength)
	}

	// Validate content size
	content := ""
	if input.Content != nil {
		content = *input.Content
		if len(content) > maxContentSize {
			return nil, fmt.Errorf("content exceeds maximum size of 1 MB")
		}
	}

	// Validate nesting depth
	var (
		parentDocID *uuid.UUID
		pathIDs     []uuid.UUID
	)
	if input.ParentDocumentID != nil {
		pid, err := uuid.Parse(*input.ParentDocumentID)
		if err != nil {
			return nil, fmt.Errorf("invalid parent document ID: %w", err)
		}
		parentDocID = &pid

		// Verify parent exists and is in the same operation
		parent, err := r.docRepo.FindByID(ctx, pid)
		if err != nil {
			return nil, fmt.Errorf("parent document not found: %w", err)
		}
		if parent.OperationID != opUID {
			return nil, fmt.Errorf("parent document belongs to a different operation")
		}
		if parent.DeletedAt != nil {
			return nil, fmt.Errorf("cannot create child under a deleted document")
		}

		// Check nesting depth
		depth, err := r.docRepo.NestingDepth(ctx, pid)
		if err != nil {
			return nil, fmt.Errorf("failed to check nesting depth: %w", err)
		}
		if depth >= maxNestingDepth {
			return nil, fmt.Errorf("maximum nesting depth of %d levels exceeded", maxNestingDepth)
		}

		// Materialize the ancestor chain so scoped search is a single
		// multikey-index probe (see WikiDocument.PathIDs). Repo helper builds
		// the new slice without aliasing parent.PathIDs.
		pathIDs = repository.ComposePathIDs(parent.PathIDs, parent.DocumentID)
	} else {
		pathIDs = []uuid.UUID{}
	}

	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid caller ID: %w", err)
	}

	sortOrder := ""
	if input.SortOrder != nil {
		sortOrder = *input.SortOrder
	}

	emoji := ""
	if input.Emoji != nil {
		emoji = *input.Emoji
	}

	color := ""
	if input.Color != nil {
		color = *input.Color
	}

	icon := ""
	if input.Icon != nil {
		icon = *input.Icon
	}

	now := time.Now().UTC()
	doc := &models.WikiDocument{
		DocumentID:       uuid.New(),
		OperationID:      opUID,
		ParentDocumentID: parentDocID,
		PathIDs:          pathIDs,
		Title:            input.Title,
		TitleLower:       strings.ToLower(input.Title),
		Content:          content,
		Emoji:            emoji,
		Color:            color,
		Icon:             icon,
		SortOrder:        sortOrder,
		CreatedByID:      callerUID,
		// Seed the attribution pair with the creator/now so a freshly created
		// doc renders "You created just now" instead of falling back to the
		// creator-only path reserved for legacy rows.
		LastUpdatedByID: &callerUID,
		LastUpdatedAt:   &now,
	}

	if err := r.docRepo.Create(ctx, doc); err != nil {
		return nil, fmt.Errorf("failed to create wiki document: %w", err)
	}

	r.eventBus.Publish(eventbus.NewWikiDocumentCreatedEvent(
		eventbus.UserActor(auth.UserID), r.wikiDocPayload(doc),
	))

	return doc, nil
}

func (r *wikiDocumentResolver) UpdateWikiDocument(ctx context.Context, id string, input model.UpdateWikiDocumentInput) (*models.WikiDocument, error) {
	auth := gqlctx.AuthFromContext(ctx)

	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := r.docRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("document not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, doc.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	updates := make(map[string]interface{})
	moved := false
	previousParentID := doc.ParentDocumentID

	if input.Title != nil {
		if len(*input.Title) > maxTitleLength {
			return nil, fmt.Errorf("title exceeds maximum length of %d characters", maxTitleLength)
		}
		updates["title"] = *input.Title
		updates["title_lower"] = strings.ToLower(*input.Title)
	}
	if input.Emoji != nil {
		updates["emoji"] = *input.Emoji
	}
	if input.Color != nil {
		updates["color"] = *input.Color
	}
	if input.Icon != nil {
		updates["icon"] = *input.Icon
	}
	if input.SortOrder != nil {
		updates["sort_order"] = *input.SortOrder
	}

	// Reparent — only treated as a "move" if the new parent actually differs
	// from the current parent. A client that redundantly echoes the current
	// parent in the input must not trigger the cascade-rebuild or the moved
	// event.
	if input.ParentDocumentID != nil {
		newParentStr := *input.ParentDocumentID
		var newParent *uuid.UUID
		if newParentStr == "" {
			// Move to root
			newParent = nil
		} else {
			newParentUID, err := uuid.Parse(newParentStr)
			if err != nil {
				return nil, fmt.Errorf("invalid parent document ID: %w", err)
			}
			// Verify parent exists and is in the same operation
			parent, err := r.docRepo.FindByID(ctx, newParentUID)
			if err != nil {
				return nil, fmt.Errorf("parent document not found: %w", err)
			}
			if parent.OperationID != doc.OperationID {
				return nil, fmt.Errorf("parent document belongs to a different operation")
			}
			if parent.DeletedAt != nil {
				return nil, fmt.Errorf("cannot move under a deleted document")
			}
			// Prevent circular reference
			if newParentUID == doc.DocumentID {
				return nil, fmt.Errorf("cannot make a document its own parent")
			}
			// Check nesting depth
			depth, err := r.docRepo.NestingDepth(ctx, newParentUID)
			if err != nil {
				return nil, fmt.Errorf("failed to check nesting depth: %w", err)
			}
			if depth >= maxNestingDepth {
				return nil, fmt.Errorf("maximum nesting depth of %d levels exceeded", maxNestingDepth)
			}
			newParent = &newParentUID
		}

		if !sameParent(doc.ParentDocumentID, newParent) {
			if newParent == nil {
				updates["parent_document_id"] = nil
			} else {
				updates["parent_document_id"] = *newParent
			}
			moved = true
		}
	}

	if len(updates) == 0 {
		return &doc, nil
	}

	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid caller ID: %w", err)
	}
	stampLastUpdated(updates, callerUID)

	if err := r.docRepo.Update(ctx, &doc, updates); err != nil {
		return nil, fmt.Errorf("failed to update wiki document: %w", err)
	}

	// A reparent invalidates path_ids for the moved doc AND all descendants;
	// recompute before publishing the moved event so any downstream scoped
	// search sees consistent state. Best-effort recovery is via the startup
	// backfill if this fails mid-flight.
	if moved {
		if err := r.docRepo.RebuildPathIDsCascade(ctx, uid); err != nil {
			return nil, fmt.Errorf("failed to rebuild path_ids after move: %w", err)
		}
	}

	updated, err := r.docRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated document: %w", err)
	}

	// Publish exactly one event per mutation. Both Moved and Updated map to
	// EventActionUpdated on the wikiDocumentChanged subscription, so emitting
	// both made every actor refetch twice. Pick the more specific topic so
	// downstream subscribers can distinguish a reparent from a content edit.
	payload := r.wikiDocPayload(&updated)
	if moved {
		if previousParentID != nil {
			payload.PreviousParentDocumentID = previousParentID.String()
		}
		r.eventBus.Publish(eventbus.NewWikiDocumentMovedEvent(eventbus.UserActor(auth.UserID), payload))
	} else {
		r.eventBus.Publish(eventbus.NewWikiDocumentUpdatedEvent(eventbus.UserActor(auth.UserID), payload))
	}

	return &updated, nil
}

// rebalancedSortOrderAt computes a single-letter sortOrder for the i-th of
// `count` total siblings using the same A..z (65..122) bucketing the frontend
// uses in wiki-tree-helpers.ts. The mutation and the optimistic client math
// must agree byte-for-byte so a successful round trip leaves the cache
// consistent without a refetch.
func rebalancedSortOrderAt(index, count int) string {
	fraction := float64(index+1) / float64(count+1)
	return string(rune(65 + int(fraction*57)))
}

// ReorderWikiDocumentSiblings replaces the N-mutation rebalance loop the
// drag-and-drop UI used to fire on every drop. The client computes the final
// sibling order, including any document being moved in from another parent,
// and ships the full ordering. The server validates membership and nesting,
// rewrites sortOrders (and parents for incoming docs), and publishes one
// wikiDocumentChanged event per *affected parent bucket* — i.e. the target
// parent plus each unique previous parent. The frontend subscription
// invalidates exactly those buckets.
func (r *wikiDocumentResolver) ReorderWikiDocumentSiblings(
	ctx context.Context,
	input model.ReorderWikiDocumentSiblingsInput,
) ([]*models.WikiDocument, error) {
	auth := gqlctx.AuthFromContext(ctx)

	opUID, err := uuid.Parse(input.OperationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}
	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	if len(input.OrderedIds) == 0 {
		return []*models.WikiDocument{}, nil
	}

	// Resolve the target parent (nil for root).
	var targetParent *uuid.UUID
	if input.ParentDocumentID != nil && *input.ParentDocumentID != "" {
		pid, err := uuid.Parse(*input.ParentDocumentID)
		if err != nil {
			return nil, fmt.Errorf("invalid parent document ID: %w", err)
		}
		parent, err := r.docRepo.FindByID(ctx, pid)
		if err != nil {
			return nil, fmt.Errorf("parent document not found: %w", err)
		}
		if parent.OperationID != opUID {
			return nil, fmt.Errorf("parent document belongs to a different operation")
		}
		if parent.DeletedAt != nil {
			return nil, fmt.Errorf("cannot reorder under a deleted document")
		}
		targetParent = &pid
	}

	// Reject duplicate ids up front — the rebalance math depends on each
	// position being unique.
	seen := make(map[uuid.UUID]struct{}, len(input.OrderedIds))
	docs := make([]models.WikiDocument, 0, len(input.OrderedIds))
	for _, idStr := range input.OrderedIds {
		docUID, err := uuid.Parse(idStr)
		if err != nil {
			return nil, fmt.Errorf("invalid document ID %q: %w", idStr, err)
		}
		if _, dup := seen[docUID]; dup {
			return nil, fmt.Errorf("duplicate document ID in ordering: %s", idStr)
		}
		seen[docUID] = struct{}{}

		doc, err := r.docRepo.FindByID(ctx, docUID)
		if err != nil {
			return nil, fmt.Errorf("document not found: %s: %w", idStr, err)
		}
		if doc.OperationID != opUID {
			return nil, fmt.Errorf("document %s belongs to a different operation", idStr)
		}
		if doc.DeletedAt != nil {
			return nil, fmt.Errorf("cannot reorder a trashed document: %s", idStr)
		}
		if targetParent != nil && *targetParent == doc.DocumentID {
			return nil, fmt.Errorf("cannot make a document its own parent")
		}
		docs = append(docs, doc)
	}

	// If reparenting any document, enforce nesting depth once (the new
	// parent's depth is the same for every incoming doc).
	if targetParent != nil {
		needsDepthCheck := false
		for _, d := range docs {
			if !sameParent(d.ParentDocumentID, targetParent) {
				needsDepthCheck = true
				break
			}
		}
		if needsDepthCheck {
			depth, err := r.docRepo.NestingDepth(ctx, *targetParent)
			if err != nil {
				return nil, fmt.Errorf("failed to check nesting depth: %w", err)
			}
			if depth >= maxNestingDepth {
				return nil, fmt.Errorf("maximum nesting depth of %d levels exceeded", maxNestingDepth)
			}
		}
	}

	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid caller ID: %w", err)
	}

	// Pass 1: write the updates that actually change something. Track which
	// docs got reparented (so the path_ids cascade only runs where needed)
	// and which buckets lost children (for the event fan-out).
	//
	// `sourceBuckets` keys: *uuid.UUID parent id, or nil sentinel for "root".
	// We store one representative doc per bucket so the published event
	// carries a real document for that bucket.
	count := len(docs)
	reparented := make([]uuid.UUID, 0)
	type bucketKey struct {
		id     uuid.UUID
		isRoot bool
	}
	sourceBuckets := make(map[bucketKey]uuid.UUID) // bucket -> representative doc id
	for i, doc := range docs {
		newSort := rebalancedSortOrderAt(i, count)
		parentChanged := !sameParent(doc.ParentDocumentID, targetParent)
		sortChanged := doc.SortOrder != newSort
		if !parentChanged && !sortChanged {
			continue
		}

		updates := make(map[string]interface{})
		if sortChanged {
			updates["sort_order"] = newSort
		}
		if parentChanged {
			if targetParent == nil {
				updates["parent_document_id"] = nil
			} else {
				updates["parent_document_id"] = *targetParent
			}
			key := bucketKey{isRoot: true}
			if doc.ParentDocumentID != nil {
				key = bucketKey{id: *doc.ParentDocumentID}
			}
			if _, seen := sourceBuckets[key]; !seen {
				sourceBuckets[key] = doc.DocumentID
			}
			reparented = append(reparented, doc.DocumentID)
			// Reparenting is a meaningful edit; attribute it to the caller.
			// Sort-order-only changes (drag-to-resort within the same parent)
			// are bookkeeping and must not bump last_updated_*.
			stampLastUpdated(updates, callerUID)
		}

		if err := r.docRepo.Update(ctx, &doc, updates); err != nil {
			return nil, fmt.Errorf("failed to update document %s: %w", doc.DocumentID, err)
		}
	}

	// Pass 2: rebuild path_ids for each reparented subtree. Done after all
	// writes so descendants pick up the final parent chain.
	for _, id := range reparented {
		if err := r.docRepo.RebuildPathIDsCascade(ctx, id); err != nil {
			return nil, fmt.Errorf("failed to rebuild path_ids for %s: %w", id, err)
		}
	}

	// Pass 3: reload the docs in their final order so the response (and the
	// optimistic client cache) reflect committed state.
	resultsByID := make(map[uuid.UUID]*models.WikiDocument, count)
	results := make([]*models.WikiDocument, 0, count)
	for _, d := range docs {
		updated, err := r.docRepo.FindByID(ctx, d.DocumentID)
		if err != nil {
			return nil, fmt.Errorf("failed to reload document %s: %w", d.DocumentID, err)
		}
		results = append(results, &updated)
		resultsByID[d.DocumentID] = &updated
	}

	// Fan out one event per *affected parent bucket*. Each event sets
	// `parentDocumentId` to the bucket id (empty for root) so the
	// subscription handler knows exactly which per-parent children cache to
	// drop. The event is an invalidation hint, not a single-doc state event
	// — the doc body in the payload exists only to keep the payload type
	// consistent with the single-doc update path.
	actor := eventbus.UserActor(auth.UserID)

	r.publishBucketEvent(actor, results[0], targetParent)

	for bucket, repID := range sourceBuckets {
		rep := resultsByID[repID]
		var bucketID *uuid.UUID
		if !bucket.isRoot {
			b := bucket.id
			bucketID = &b
		}
		r.publishBucketEvent(actor, rep, bucketID)
	}

	return results, nil
}

// publishBucketEvent emits a single wikiDocumentChanged event whose
// `parentDocumentId` names the affected children bucket — `nil` for root,
// a uuid pointer otherwise. The doc fields come from `rep`, which only
// needs to belong to the same operation; the subscription uses the
// bucket id, not the doc, to invalidate caches.
func (r *wikiDocumentResolver) publishBucketEvent(
	actor eventbus.Actor,
	rep *models.WikiDocument,
	bucket *uuid.UUID,
) {
	p := r.wikiDocPayload(rep)
	if bucket == nil {
		p.ParentDocumentID = ""
	} else {
		p.ParentDocumentID = bucket.String()
	}
	r.eventBus.Publish(eventbus.NewWikiDocumentUpdatedEvent(actor, p))
}

func (r *wikiDocumentResolver) DeleteWikiDocument(ctx context.Context, id string) (bool, error) {
	auth := gqlctx.AuthFromContext(ctx)

	uid, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := r.docRepo.FindByID(ctx, uid)
	if err != nil {
		return false, fmt.Errorf("document not found: %w", err)
	}
	if doc.DeletedAt != nil {
		return false, fmt.Errorf("document is already in trash")
	}

	if err := r.authorizeForOperation(ctx, doc.OperationID, models.OperationRoleOperator); err != nil {
		return false, err
	}

	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return false, fmt.Errorf("invalid caller ID: %w", err)
	}

	// Find all descendants for cascading soft-delete
	descendants, err := r.docRepo.FindDescendants(ctx, uid)
	if err != nil {
		return false, fmt.Errorf("failed to find descendants: %w", err)
	}

	// Create pre-delete safety backups for the document and all descendants
	allDocs := append([]models.WikiDocument{doc}, descendants...)
	for i := range allDocs {
		r.createSafetyBackup(ctx, &allDocs[i], callerUID, "Pre-delete snapshot")
	}

	// Soft-delete descendants
	if len(descendants) > 0 {
		descendantIDs := make([]uuid.UUID, len(descendants))
		for i, d := range descendants {
			descendantIDs[i] = d.DocumentID
		}
		if err := r.docRepo.SoftDeleteBatch(ctx, descendantIDs, callerUID); err != nil {
			return false, fmt.Errorf("failed to soft-delete descendants: %w", err)
		}
	}

	// Soft-delete the document itself
	if err := r.docRepo.SoftDelete(ctx, &doc, callerUID); err != nil {
		return false, fmt.Errorf("failed to soft-delete document: %w", err)
	}

	r.eventBus.Publish(eventbus.NewWikiDocumentSoftDeletedEvent(
		eventbus.UserActor(auth.UserID), r.wikiDocPayload(&doc),
	))

	return true, nil
}

// DuplicateWikiDocument clones a document as a sibling immediately following
// the source. When withChildren is true the entire active subtree is cloned;
// trashed descendants are skipped (they stay in trash). The new root's title
// is prefixed "Copy of "; descendants keep their original titles. The sibling
// list under the source's parent is rebalanced so the duplicate sits right
// after the source in sortOrder. One create event is published for the root —
// frontend subscribers invalidate the parent's children bucket once and
// re-render the whole new subtree from one round trip.
func (r *wikiDocumentResolver) DuplicateWikiDocument(ctx context.Context, id string, withChildren *bool) (*models.WikiDocument, error) {
	auth := gqlctx.AuthFromContext(ctx)

	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	source, err := r.docRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("document not found: %w", err)
	}
	if source.DeletedAt != nil {
		return nil, fmt.Errorf("cannot duplicate a trashed document")
	}

	if err := r.authorizeForOperation(ctx, source.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid caller ID: %w", err)
	}

	cascade := withChildren != nil && *withChildren

	// "Copy of " prefix on the root only; descendants keep their original
	// titles. Truncate so the prefixed title still respects the cap.
	rootTitle := "Copy of " + source.Title
	if len(rootTitle) > maxTitleLength {
		rootTitle = rootTitle[:maxTitleLength]
	}

	now := time.Now().UTC()

	// Sibling shares the source's parent and therefore its ancestor chain.
	siblingPath := append([]uuid.UUID(nil), source.PathIDs...)

	rootDup := &models.WikiDocument{
		DocumentID:       uuid.New(),
		OperationID:      source.OperationID,
		ParentDocumentID: source.ParentDocumentID,
		PathIDs:          siblingPath,
		Title:            rootTitle,
		TitleLower:       strings.ToLower(rootTitle),
		Content:          source.Content,
		ContentState:     source.ContentState,
		Emoji:            source.Emoji,
		Color:            source.Color,
		Icon:             source.Icon,
		CreatedByID:      callerUID,
		LastUpdatedByID:  &callerUID,
		LastUpdatedAt:    &now,
	}

	if err := r.docRepo.Create(ctx, rootDup); err != nil {
		return nil, fmt.Errorf("failed to create duplicate: %w", err)
	}

	if cascade {
		// BFS clone active descendants. Parents are always inserted before
		// children — Create's path_ids fallback reads from the just-written
		// parent if path_ids isn't pre-populated, but we pre-populate anyway
		// to keep the multikey index immediately accurate.
		idMap := map[uuid.UUID]uuid.UUID{source.DocumentID: rootDup.DocumentID}
		pathByNewID := map[uuid.UUID][]uuid.UUID{
			rootDup.DocumentID: repository.ComposePathIDs(rootDup.PathIDs, rootDup.DocumentID),
		}
		queue := []uuid.UUID{source.DocumentID}

		for len(queue) > 0 {
			oldParentID := queue[0]
			queue = queue[1:]
			newParentID := idMap[oldParentID]
			newParentPath := pathByNewID[newParentID]

			children, err := r.docRepo.FindChildDocuments(ctx, oldParentID)
			if err != nil {
				return nil, fmt.Errorf("failed to fetch children of %s: %w", oldParentID, err)
			}

			// Pin parent id to a stack slot the loop won't overwrite — the new
			// child holds a pointer into it.
			parentID := newParentID
			for _, child := range children {
				newID := uuid.New()
				newChild := &models.WikiDocument{
					DocumentID:       newID,
					OperationID:      child.OperationID,
					ParentDocumentID: &parentID,
					PathIDs:          append([]uuid.UUID(nil), newParentPath...),
					Title:            child.Title,
					TitleLower:       child.TitleLower,
					Content:          child.Content,
					ContentState:     child.ContentState,
					Emoji:            child.Emoji,
					Color:            child.Color,
					Icon:             child.Icon,
					SortOrder:        child.SortOrder,
					CreatedByID:      callerUID,
					LastUpdatedByID:  &callerUID,
					LastUpdatedAt:    &now,
				}

				if err := r.docRepo.Create(ctx, newChild); err != nil {
					return nil, fmt.Errorf("failed to clone descendant %s: %w", child.DocumentID, err)
				}

				idMap[child.DocumentID] = newID
				pathByNewID[newID] = repository.ComposePathIDs(newParentPath, newID)
				queue = append(queue, child.DocumentID)
			}
		}
	}

	// Rebalance the sibling order so the duplicate sits immediately after the
	// source. Reuses FindChildDocumentsWithCounts to cover both root-level
	// (parentDocumentID == nil) and nested cases in one call.
	siblings, _, err := r.docRepo.FindChildDocumentsWithCounts(ctx, source.OperationID, source.ParentDocumentID)
	if err != nil {
		return nil, fmt.Errorf("failed to load siblings for reorder: %w", err)
	}

	ordered := make([]models.WikiDocument, 0, len(siblings))
	for _, s := range siblings {
		if s.DocumentID == rootDup.DocumentID {
			// Skip the duplicate's current placement; we'll splice it in
			// right after the source below.
			continue
		}
		ordered = append(ordered, s)
		if s.DocumentID == source.DocumentID {
			ordered = append(ordered, *rootDup)
		}
	}

	total := len(ordered)
	for i, doc := range ordered {
		newSort := rebalancedSortOrderAt(i, total)
		if doc.SortOrder == newSort {
			continue
		}
		// Sort-order rebalance only — no last_updated stamp. Siblings weren't
		// edited by the caller; their position shifted to make room for the
		// duplicate.
		updates := map[string]interface{}{"sort_order": newSort}
		docCopy := doc
		if err := r.docRepo.Update(ctx, &docCopy, updates); err != nil {
			return nil, fmt.Errorf("failed to rebalance sibling %s: %w", doc.DocumentID, err)
		}
		if doc.DocumentID == rootDup.DocumentID {
			rootDup.SortOrder = newSort
		}
	}

	// One create event covers the whole new subtree — frontend subscribers
	// invalidate the parent bucket and refetch its children, which lazily pulls
	// in the duplicate's descendants on demand. Matches the cascade-delete
	// pattern (one event per root, not per descendant).
	r.eventBus.Publish(eventbus.NewWikiDocumentCreatedEvent(
		eventbus.UserActor(auth.UserID), r.wikiDocPayload(rootDup),
	))

	reloaded, err := r.docRepo.FindByID(ctx, rootDup.DocumentID)
	if err != nil {
		return nil, fmt.Errorf("failed to reload duplicate: %w", err)
	}
	return &reloaded, nil
}

func (r *wikiDocumentResolver) RestoreWikiDocument(ctx context.Context, id string, cascade *bool) (*models.WikiDocument, error) {
	auth := gqlctx.AuthFromContext(ctx)

	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := r.docRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("document not found: %w", err)
	}
	if doc.DeletedAt == nil {
		return nil, fmt.Errorf("document is not in trash")
	}

	if err := r.authorizeForOperation(ctx, doc.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	// Pick where the restored doc should land. If the original parent is
	// alive, keep it there. Otherwise walk up and re-home under the nearest
	// still-alive ancestor — falling back to root when the whole chain is
	// gone (trashed or hard-deleted). Without this, restoring into a trashed
	// branch would hide the doc from the tree since trashed ancestors aren't
	// rendered.
	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid caller ID: %w", err)
	}

	if doc.ParentDocumentID != nil {
		newParent, err := r.resolveRestoreParent(ctx, &doc)
		if err != nil {
			return nil, err
		}
		if !sameParent(doc.ParentDocumentID, newParent) {
			updates := map[string]interface{}{"parent_document_id": nil}
			if newParent != nil {
				updates["parent_document_id"] = *newParent
			}
			stampLastUpdated(updates, callerUID)
			if err := r.docRepo.Update(ctx, &doc, updates); err != nil {
				return nil, fmt.Errorf("failed to reparent for restore: %w", err)
			}
			// Restore-time reparent invalidates path_ids for the doc and its
			// (still-trashed at this moment) descendants. Rebuild so the
			// search-scope multikey query reflects the new home immediately.
			if err := r.docRepo.RebuildPathIDsCascade(ctx, uid); err != nil {
				return nil, fmt.Errorf("failed to rebuild path_ids after restore-reparent: %w", err)
			}
		}
	}

	if err := r.docRepo.Restore(ctx, &doc); err != nil {
		return nil, fmt.Errorf("failed to restore document: %w", err)
	}
	// Restore() writes only deleted_at/deleted_by_id — also touch the
	// attribution pair so the restorer is credited with the update.
	stamp := map[string]interface{}{}
	stampLastUpdated(stamp, callerUID)
	if err := r.docRepo.Update(ctx, &doc, stamp); err != nil {
		return nil, fmt.Errorf("failed to stamp last updated on restore: %w", err)
	}

	// Cascade restore: bring back every still-trashed descendant in one
	// batch update. Mirrors DeleteWikiDocument's cascade-delete pattern,
	// which only publishes one event for the root — frontend subscribers
	// invalidate the whole tree on a single restore event, so per-descendant
	// events would just duplicate that work.
	if cascade != nil && *cascade {
		descendants, err := r.docRepo.FindTrashedDescendants(ctx, uid)
		if err != nil {
			return nil, fmt.Errorf("failed to find trashed descendants: %w", err)
		}
		if len(descendants) > 0 {
			cascadedIDs := make([]uuid.UUID, len(descendants))
			for i := range descendants {
				cascadedIDs[i] = descendants[i].DocumentID
			}
			if err := r.docRepo.RestoreBatch(ctx, cascadedIDs, callerUID); err != nil {
				return nil, fmt.Errorf("failed to cascade-restore descendants: %w", err)
			}
		}
	}

	restored, err := r.docRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch restored document: %w", err)
	}

	r.eventBus.Publish(eventbus.NewWikiDocumentRestoredEvent(
		eventbus.UserActor(auth.UserID), r.wikiDocPayload(&restored),
	))

	return &restored, nil
}

// resolveRestoreParent returns the document ID the restored doc should be
// parented under: the nearest still-alive ancestor (walking from the original
// parent upward), or nil meaning restore to root. Assumes doc.ParentDocumentID
// is non-nil; callers skip this for root docs.
func (r *wikiDocumentResolver) resolveRestoreParent(ctx context.Context, doc *models.WikiDocument) (*uuid.UUID, error) {
	chain, err := r.docRepo.FindAncestors(ctx, *doc.ParentDocumentID)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve restore parent: %w", err)
	}
	// Chain is root→leaf and includes the original parent as the last entry.
	// Walk leaf→root so we prefer the closest live ancestor.
	for i := len(chain) - 1; i >= 0; i-- {
		a := chain[i]
		if a.OperationID != doc.OperationID {
			break // defensive: parent chain must stay inside the operation
		}
		if a.DeletedAt == nil {
			id := a.DocumentID
			return &id, nil
		}
	}
	return nil, nil // no live ancestor — restore to root
}

// sameParent reports whether two nullable parent IDs point at the same doc,
// so the restore flow can skip an Update when no reparenting is needed.
func sameParent(a *uuid.UUID, b *uuid.UUID) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

func (r *wikiDocumentResolver) PermanentlyDeleteWikiDocument(ctx context.Context, id string) (bool, error) {
	auth := gqlctx.AuthFromContext(ctx)

	uid, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := r.docRepo.FindByID(ctx, uid)
	if err != nil {
		return false, fmt.Errorf("document not found: %w", err)
	}
	if doc.DeletedAt == nil {
		return false, fmt.Errorf("document must be in trash before permanent deletion")
	}

	if err := r.authorizeForOperation(ctx, doc.OperationID, models.OperationRoleAdmin); err != nil {
		return false, err
	}

	// Delete all backups for this document
	if err := r.backupRepo.DeleteByDocumentID(ctx, uid); err != nil {
		return false, fmt.Errorf("failed to delete backups: %w", err)
	}

	// Cascade visit history rows pointing at this doc — once the doc is
	// hard-deleted no user should see it as a ghost in their history.
	if err := r.visitRepo.DeleteByDocumentID(ctx, uid); err != nil {
		return false, fmt.Errorf("failed to delete visit history: %w", err)
	}

	if err := r.docRepo.HardDelete(ctx, &doc); err != nil {
		return false, fmt.Errorf("failed to permanently delete document: %w", err)
	}

	// Strip this doc's id from every task's wiki_references array in the
	// operation. Best-effort: a failed pull leaves a dangling pointer that
	// the task field resolver silently drops at read time.
	if r.taskRepo != nil {
		if err := r.taskRepo.PullWikiReference(ctx, doc.OperationID, doc.DocumentID); err != nil {
			logger.From(ctx).Warn("cleanup of task wiki references failed",
				zap.String("document_id", doc.DocumentID.String()),
				zap.Error(err),
			)
		}
	}

	r.eventBus.Publish(eventbus.NewWikiDocumentHardDeletedEvent(
		eventbus.UserActor(auth.UserID), r.wikiDocPayload(&doc),
	))

	return true, nil
}

func (r *wikiDocumentResolver) EmptyWikiDocumentTrash(ctx context.Context, operationID string) (bool, error) {
	auth := gqlctx.AuthFromContext(ctx)

	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return false, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleAdmin); err != nil {
		return false, err
	}

	// Find all trashed documents to delete their backups
	trashed, err := r.docRepo.FindByOperationIDWithCursor(ctx, opUID,
		repository.WikiDocumentFilter{Trashed: true}, nil, 10000, true)
	if err != nil {
		return false, fmt.Errorf("failed to find trashed documents: %w", err)
	}

	// Delete backups for each trashed document
	for _, doc := range trashed {
		if err := r.backupRepo.DeleteByDocumentID(ctx, doc.DocumentID); err != nil {
			return false, fmt.Errorf("failed to delete backups for document %s: %w", doc.DocumentID, err)
		}
	}

	// Cascade visit history rows for the docs about to be purged.
	if len(trashed) > 0 {
		trashedIDs := make([]uuid.UUID, len(trashed))
		for i := range trashed {
			trashedIDs[i] = trashed[i].DocumentID
		}
		if err := r.visitRepo.DeleteByDocumentIDs(ctx, trashedIDs); err != nil {
			return false, fmt.Errorf("failed to delete visit history: %w", err)
		}
	}

	// Hard-delete all trashed documents
	if err := r.docRepo.HardDeleteTrashed(ctx, opUID); err != nil {
		return false, fmt.Errorf("failed to empty trash: %w", err)
	}

	// Strip each purged doc's id from every task's wiki_references in the
	// operation. Looped because the repo's PullWikiReference takes one id
	// at a time; trash empties are admin-initiated and rare, so the loop
	// is fine. Best-effort — surviving stale pointers are pruned at read.
	if r.taskRepo != nil {
		for _, d := range trashed {
			if err := r.taskRepo.PullWikiReference(ctx, opUID, d.DocumentID); err != nil {
				logger.From(ctx).Warn("cleanup of task wiki references failed",
					zap.String("document_id", d.DocumentID.String()),
					zap.Error(err),
				)
			}
		}
	}

	r.eventBus.Publish(eventbus.NewWikiDocumentHardDeletedEvent(
		eventbus.UserActor(auth.UserID), eventbus.WikiDocumentEventPayload{
			OperationID: operationID,
		},
	))

	return true, nil
}

// --- Backup mutations ---

func (r *wikiDocumentResolver) CreateWikiDocumentBackup(ctx context.Context, documentID string, description *string) (*models.WikiDocumentBackup, error) {
	auth := gqlctx.AuthFromContext(ctx)

	docUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := r.docRepo.FindByID(ctx, docUID)
	if err != nil {
		return nil, fmt.Errorf("document not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, doc.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid caller ID: %w", err)
	}

	desc := ""
	if description != nil {
		desc = *description
	}

	backup := &models.WikiDocumentBackup{
		BackupID:     uuid.New(),
		DocumentID:   doc.DocumentID,
		OperationID:  doc.OperationID,
		Title:        doc.Title,
		Content:      doc.Content,
		ContentState: doc.ContentState,
		Trigger:      models.WikiDocumentBackupTriggerManual,
		Description:  desc,
		CreatedByID:  callerUID,
	}

	if err := r.backupRepo.Create(ctx, backup); err != nil {
		return nil, fmt.Errorf("failed to create backup: %w", err)
	}

	// Update lastBackupAt
	now := time.Now().UTC()
	_ = r.docRepo.Update(ctx, &doc, map[string]interface{}{"last_backup_at": now})

	return backup, nil
}

func (r *wikiDocumentResolver) RestoreWikiDocumentBackup(ctx context.Context, documentID string, backupID string) (*models.WikiDocument, error) {
	auth := gqlctx.AuthFromContext(ctx)

	docUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	backupUID, err := uuid.Parse(backupID)
	if err != nil {
		return nil, fmt.Errorf("invalid backup ID: %w", err)
	}

	doc, err := r.docRepo.FindByID(ctx, docUID)
	if err != nil {
		return nil, fmt.Errorf("document not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, doc.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	backup, err := r.backupRepo.FindByID(ctx, backupUID)
	if err != nil {
		return nil, fmt.Errorf("backup not found: %w", err)
	}
	if backup.DocumentID != docUID {
		return nil, fmt.Errorf("backup does not belong to this document")
	}

	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid caller ID: %w", err)
	}

	// Create pre-restore safety backup
	r.createSafetyBackup(ctx, &doc, callerUID, "Pre-restore snapshot")

	// Restore content from backup (writes both content and content_state)
	if err := r.docRepo.RestoreFromBackup(ctx, docUID, backup.Content, backup.ContentState); err != nil {
		return nil, fmt.Errorf("failed to restore from backup: %w", err)
	}

	// Also restore the title and attribute the restore to the caller.
	titleUpdates := map[string]interface{}{
		"title":       backup.Title,
		"title_lower": strings.ToLower(backup.Title),
	}
	stampLastUpdated(titleUpdates, callerUID)
	_ = r.docRepo.Update(ctx, &doc, titleUpdates)

	restored, err := r.docRepo.FindByID(ctx, docUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch restored document: %w", err)
	}

	r.eventBus.Publish(eventbus.NewWikiDocumentUpdatedEvent(
		eventbus.UserActor(auth.UserID), r.wikiDocPayload(&restored),
	))

	return &restored, nil
}

func (r *wikiDocumentResolver) DeleteWikiDocumentBackup(ctx context.Context, id string) (bool, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("invalid backup ID: %w", err)
	}

	backup, err := r.backupRepo.FindByID(ctx, uid)
	if err != nil {
		return false, fmt.Errorf("backup not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, backup.OperationID, models.OperationRoleAdmin); err != nil {
		return false, err
	}

	if err := r.backupRepo.Delete(ctx, &backup); err != nil {
		return false, fmt.Errorf("failed to delete backup: %w", err)
	}

	return true, nil
}

// --- Document queries ---

func (r *wikiDocumentResolver) WikiDocument(ctx context.Context, id string) (*models.WikiDocument, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := r.docRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("document not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, doc.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	return &doc, nil
}

func (r *wikiDocumentResolver) WikiDocuments(ctx context.Context, operationID string, parentDocumentID *string, search *string, sort *model.WikiDocumentSort, first *int, after *string, last *int, before *string) (*model.WikiDocumentConnection, error) {
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

	filter := repository.WikiDocumentFilter{Trashed: false}
	if parentDocumentID != nil {
		pid, err := uuid.Parse(*parentDocumentID)
		if err != nil {
			return nil, fmt.Errorf("invalid parent document ID: %w", err)
		}
		filter.ParentDocumentID = &pid
	}
	if search != nil {
		trimmed := strings.TrimSpace(*search)
		if len(trimmed) > maxSearchLength {
			return nil, fmt.Errorf("search query exceeds %d characters", maxSearchLength)
		}
		filter.Search = trimmed
	}
	if sort != nil && *sort == model.WikiDocumentSortRecentlyUpdated {
		filter.Sort = repository.SortByLastUpdatedAt
	}

	total, err := r.docRepo.CountByOperationID(ctx, opUID, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to count documents: %w", err)
	}

	docs, err := r.docRepo.FindByOperationIDWithCursor(ctx, opUID, filter, args.Cursor, args.Limit+1, args.Forward)
	if err != nil {
		return nil, fmt.Errorf("failed to list documents: %w", err)
	}

	hasMore := int64(len(docs)) > args.Limit
	if hasMore {
		docs = docs[:args.Limit]
	}

	// Bulk-preload the per-page ancestor crumbs into the request-scoped loader
	// so the field resolver becomes a map walk over PathIDs instead of one
	// upward chain traversal per row. PathIDs is the materialized
	// root→immediate-parent chain on each doc; the union across the page is
	// the exact set of ancestor rows we need to fetch.
	if loader := WikiTreeLoaderFromContext(ctx); loader != nil && len(docs) > 0 {
		preloadAncestorEntries(ctx, loader, r.docRepo, docs, opUID)
	}

	edges := make([]*model.WikiDocumentEdge, len(docs))
	for i := range docs {
		// Cursor encodes the timestamp from the sort column so pagination
		// stays correct in both sort modes. The encoded shape is identical;
		// the resolver/repo agree on the field via filter.Sort.
		var cursorTime time.Time
		if filter.Sort == repository.SortByLastUpdatedAt && docs[i].LastUpdatedAt != nil {
			cursorTime = *docs[i].LastUpdatedAt
		} else {
			cursorTime = docs[i].CreateAt
		}
		cursor := pagination.EncodeCursor(cursorTime, docs[i].Id)
		edges[i] = &model.WikiDocumentEdge{
			Node:   &docs[i],
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

	return &model.WikiDocumentConnection{
		Edges:      edges,
		PageInfo:   &pageInfo,
		TotalCount: int(total),
	}, nil
}

// WikiSearch runs a ranked text search over wiki documents within an operation.
// Short queries (<2 chars) use the title_lower prefix index for instant-feedback
// palette UX; longer queries hit the MongoDB text index with score-based ranking.
// Offset is clamped to MaxSearchOffset at the repository layer.
func (r *wikiDocumentResolver) WikiSearch(
	ctx context.Context,
	operationID string,
	scope *string,
	query string,
	offset *int,
	limit *int,
) (*model.WikiSearchConnection, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	trimmed := strings.TrimSpace(query)
	if len(trimmed) > maxSearchLength {
		return nil, fmt.Errorf("search query exceeds %d characters", maxSearchLength)
	}

	var scopeUID *uuid.UUID
	if scope != nil && *scope != "" {
		p, err := uuid.Parse(*scope)
		if err != nil {
			return nil, fmt.Errorf("invalid scope document ID: %w", err)
		}
		scopeUID = &p
	}

	var off, lim int64 = 0, 20
	if offset != nil && *offset > 0 {
		off = int64(*offset)
	}
	if limit != nil && *limit > 0 {
		lim = int64(*limit)
	}

	hits, total, err := r.docRepo.SearchByOperationID(ctx, opUID, scopeUID, trimmed, off, lim)
	if err != nil {
		return nil, fmt.Errorf("failed to search wiki documents: %w", err)
	}

	out := make([]*model.WikiSearchHit, len(hits))
	for i := range hits {
		doc := hits[i].Doc
		ranges := make([]*model.WikiSearchMatchRange, len(hits[i].MatchRanges))
		for j, rg := range hits[i].MatchRanges {
			ranges[j] = &model.WikiSearchMatchRange{Start: rg[0], End: rg[1]}
		}
		out[i] = &model.WikiSearchHit{
			Document:    &doc,
			Snippet:     hits[i].Snippet,
			MatchRanges: ranges,
			Score:       hits[i].Score,
		}
	}

	hasMore := off+int64(len(hits)) < total

	return &model.WikiSearchConnection{
		Hits:    out,
		Total:   int(total),
		HasMore: hasMore,
	}, nil
}

func (r *wikiDocumentResolver) WikiDocumentTree(ctx context.Context, operationID string) ([]*models.WikiDocument, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	docs, err := r.docRepo.FindAllByOperationID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch document tree: %w", err)
	}

	// Derive child counts from the flat list in memory — no extra round trips.
	// Stashed in the per-request loader so the WikiDocument.childCount field
	// resolver returns map lookups instead of N+1 Count() calls.
	counts := make(map[uuid.UUID]int, len(docs))
	for _, d := range docs {
		if d.ParentDocumentID != nil {
			counts[*d.ParentDocumentID]++
		}
	}
	WikiTreeLoaderFromContext(ctx).SetAllChildCounts(counts)

	ptrs := make([]*models.WikiDocument, len(docs))
	for i := range docs {
		ptrs[i] = &docs[i]
	}

	return ptrs, nil
}

// WikiDocumentChildren returns the active direct children of a parent
// document (or root documents in the operation when parentDocumentID is
// nil/empty), sorted by sortOrder. childCount on each returned row is
// precomputed via aggregation so the sidebar can decide expand-arrow visibility
// without a per-row Count call.
func (r *wikiDocumentResolver) WikiDocumentChildren(ctx context.Context, operationID string, parentDocumentID *string) ([]*models.WikiDocument, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	var parentUID *uuid.UUID
	if parentDocumentID != nil && *parentDocumentID != "" {
		pid, err := uuid.Parse(*parentDocumentID)
		if err != nil {
			return nil, fmt.Errorf("invalid parent document ID: %w", err)
		}
		parentUID = &pid
	}

	docs, counts, err := r.docRepo.FindChildDocumentsWithCounts(ctx, opUID, parentUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch children: %w", err)
	}
	WikiTreeLoaderFromContext(ctx).SetAllChildCounts(counts)

	ptrs := make([]*models.WikiDocument, len(docs))
	for i := range docs {
		ptrs[i] = &docs[i]
	}
	return ptrs, nil
}

// WikiDocumentTreeRevealPath returns every active document the sidebar needs
// to render a tree expanded down to `documentID`: ancestors plus the siblings
// of each ancestor, plus root documents. One reveal round trip instead of N
// per-level fetches when a user lands on a deeply nested doc via direct link.
//
// Returns an empty list (no error) when the doc doesn't exist or is in trash —
// the sidebar will just render the roots fetch and skip auto-expansion.
func (r *wikiDocumentResolver) WikiDocumentTreeRevealPath(ctx context.Context, documentID string) ([]*models.WikiDocument, error) {
	docUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	target, err := r.docRepo.FindByID(ctx, docUID)
	if err != nil {
		// Not found — return empty rather than error; the sidebar treats this
		// as "no reveal" and falls back to roots.
		return []*models.WikiDocument{}, nil
	}
	if target.DeletedAt != nil {
		return []*models.WikiDocument{}, nil
	}
	if err := r.authorizeForOperation(ctx, target.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	// Collect the parent IDs we need siblings for: every ancestor of the
	// target. The target's own parent provides the row containing the target;
	// each grand-ancestor provides the row containing its child. Roots are
	// added by the repo regardless of the parent list.
	var ancestorIDs []uuid.UUID
	if target.ParentDocumentID != nil {
		chain, err := r.docRepo.FindAncestors(ctx, *target.ParentDocumentID)
		if err == nil {
			ancestorIDs = make([]uuid.UUID, 0, len(chain))
			for _, a := range chain {
				// Walks through trashed ancestors too; the reveal-path filter
				// already excludes trashed docs from the result set, so a
				// trashed ancestor just means its level shows no siblings.
				ancestorIDs = append(ancestorIDs, a.DocumentID)
			}
		}
	}

	docs, counts, err := r.docRepo.FindDocumentsForRevealPath(ctx, target.OperationID, ancestorIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch reveal path: %w", err)
	}
	WikiTreeLoaderFromContext(ctx).SetAllChildCounts(counts)

	ptrs := make([]*models.WikiDocument, len(docs))
	for i := range docs {
		ptrs[i] = &docs[i]
	}
	return ptrs, nil
}

// WikiDocumentTrashCount returns the number of soft-deleted documents in the
// operation. Used by the sidebar to render the trash badge without fetching
// the full paginated trash list.
func (r *wikiDocumentResolver) WikiDocumentTrashCount(ctx context.Context, operationID string) (int, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return 0, fmt.Errorf("invalid operation ID: %w", err)
	}
	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleViewer); err != nil {
		return 0, err
	}
	count, err := r.docRepo.CountByOperationID(ctx, opUID, repository.WikiDocumentFilter{Trashed: true})
	if err != nil {
		return 0, fmt.Errorf("failed to count trashed documents: %w", err)
	}
	return int(count), nil
}

func (r *wikiDocumentResolver) WikiDocumentTrash(ctx context.Context, operationID string, first *int, after *string, last *int, before *string) (*model.WikiDocumentConnection, error) {
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

	filter := repository.WikiDocumentFilter{Trashed: true}

	total, err := r.docRepo.CountByOperationID(ctx, opUID, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to count trashed documents: %w", err)
	}

	docs, err := r.docRepo.FindTrashedByOperationIDWithCursor(ctx, opUID, args.Cursor, args.Limit+1, args.Forward)
	if err != nil {
		return nil, fmt.Errorf("failed to list trashed documents: %w", err)
	}

	hasMore := int64(len(docs)) > args.Limit
	if hasMore {
		docs = docs[:args.Limit]
	}

	edges := make([]*model.WikiDocumentEdge, len(docs))
	for i := range docs {
		// Encode cursor on deleted_at (the trash sort key) instead of createAt
		// so seek-pagination matches the listing order. Falls back to CreateAt
		// only as a defensive guard against a corrupt row with deleted_at=nil
		// slipping through the filter — should never happen in practice.
		t := docs[i].CreateAt
		if docs[i].DeletedAt != nil {
			t = *docs[i].DeletedAt
		}
		cursor := pagination.EncodeCursor(t, docs[i].Id)
		edges[i] = &model.WikiDocumentEdge{
			Node:   &docs[i],
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

	return &model.WikiDocumentConnection{
		Edges:      edges,
		PageInfo:   &pageInfo,
		TotalCount: int(total),
	}, nil
}

// WikiDocumentTrashedDescendants powers the cascade-restore prompt: given a
// trashed (or live) document, lists every currently-trashed descendant so
// the UI can ask "restore X and N children?". The starting document itself
// is excluded from the result.
func (r *wikiDocumentResolver) WikiDocumentTrashedDescendants(ctx context.Context, documentID string) ([]*models.WikiDocument, error) {
	uid, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := r.docRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("document not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, doc.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	descendants, err := r.docRepo.FindTrashedDescendants(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to list trashed descendants: %w", err)
	}

	out := make([]*models.WikiDocument, len(descendants))
	for i := range descendants {
		out[i] = &descendants[i]
	}
	return out, nil
}

// WikiDocumentBacklinks returns the documents that cite documentID inline.
// Standalone query path — used by the editor footer's backlinks list and by
// invalidation flows that don't want to refetch the entire WikiDocument.
func (r *wikiDocumentResolver) WikiDocumentBacklinks(ctx context.Context, documentID string) ([]*models.WikiDocument, error) {
	uid, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := r.docRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("document not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, doc.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	return r.fetchBacklinks(ctx, &doc)
}

// WikiDocumentsReferencingCredential returns the active wiki documents in the
// credential's operation that cite it via the inline /credential chip. The
// query is operation-scoped at the repo level so there's no cross-tenant
// leak path even if the same credential id existed in another op.
func (r *wikiDocumentResolver) WikiDocumentsReferencingCredential(ctx context.Context, credentialID string) ([]*models.WikiDocument, error) {
	cUID, err := uuid.Parse(credentialID)
	if err != nil {
		return nil, fmt.Errorf("invalid credential ID: %w", err)
	}

	cred, err := r.credRepo.FindByID(ctx, cUID)
	if err != nil {
		return nil, fmt.Errorf("credential not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, cred.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	return r.fetchCredentialBacklinks(ctx, cred.OperationID, cred.CredentialID)
}

// CredentialBacklinks is the field resolver body for Credential.backlinks.
// Auth happens upstream — gqlgen has already resolved the parent credential
// from an authorized query.
func (r *wikiDocumentResolver) CredentialBacklinks(ctx context.Context, cred *models.Credential) ([]*models.WikiDocument, error) {
	if cred == nil {
		return []*models.WikiDocument{}, nil
	}
	return r.fetchCredentialBacklinks(ctx, cred.OperationID, cred.CredentialID)
}

// CredentialBacklinkCount is the field resolver body for
// Credential.backlinkCount. Single Mongo countDocuments per call — the
// batched repo method is used by list resolvers that page through credentials.
func (r *wikiDocumentResolver) CredentialBacklinkCount(ctx context.Context, cred *models.Credential) (int, error) {
	if cred == nil {
		return 0, nil
	}
	counts, err := r.docRepo.CountCredentialReferrersBatch(ctx, cred.OperationID, []uuid.UUID{cred.CredentialID})
	if err != nil {
		return 0, fmt.Errorf("failed to count credential backlinks: %w", err)
	}
	return int(counts[cred.CredentialID]), nil
}

// CleanupCredentialReferences pulls credentialID from credential_references
// across every active or trashed document in operationID. Best-effort: a
// failed cleanup leaves dangling pointers but never blocks the credential
// delete itself. Callers log on error.
func (r *wikiDocumentResolver) CleanupCredentialReferences(ctx context.Context, operationID, credentialID uuid.UUID) error {
	return r.docRepo.PullCredentialReference(ctx, operationID, credentialID)
}

// fetchCredentialBacklinks is the shared body of the standalone query and the
// Credential.backlinks field resolver. Capped at maxBacklinks for the same
// reason as the document → document path: past that, refining the source
// documents beats paginating the list.
func (r *wikiDocumentResolver) fetchCredentialBacklinks(ctx context.Context, opID, credentialID uuid.UUID) ([]*models.WikiDocument, error) {
	referrers, err := r.docRepo.FindCredentialReferrers(ctx, opID, credentialID, maxBacklinks)
	if err != nil {
		return nil, fmt.Errorf("failed to list credential backlinks: %w", err)
	}
	out := make([]*models.WikiDocument, len(referrers))
	for i := range referrers {
		out[i] = &referrers[i]
	}
	return out, nil
}

// WikiDocumentsReferencingHash returns the active wiki documents in the hash's
// operation that cite it via the inline /hash chip. Sibling of
// WikiDocumentsReferencingCredential — operation-scoped at the repo level so
// there's no cross-tenant leak path.
func (r *wikiDocumentResolver) WikiDocumentsReferencingHash(ctx context.Context, hashID string) ([]*models.WikiDocument, error) {
	hUID, err := uuid.Parse(hashID)
	if err != nil {
		return nil, fmt.Errorf("invalid hash ID: %w", err)
	}

	hash, err := r.hashRepo.FindByID(ctx, hUID)
	if err != nil {
		return nil, fmt.Errorf("hash not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, hash.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	return r.fetchHashBacklinks(ctx, hash.OperationID, hash.HashID)
}

// HashBacklinks is the field resolver body for Hash.backlinks. Auth happens
// upstream — gqlgen has already resolved the parent hash from an authorized
// query.
func (r *wikiDocumentResolver) HashBacklinks(ctx context.Context, hash *models.Hash) ([]*models.WikiDocument, error) {
	if hash == nil {
		return []*models.WikiDocument{}, nil
	}
	return r.fetchHashBacklinks(ctx, hash.OperationID, hash.HashID)
}

// HashBacklinkCount is the field resolver body for Hash.backlinkCount.
func (r *wikiDocumentResolver) HashBacklinkCount(ctx context.Context, hash *models.Hash) (int, error) {
	if hash == nil {
		return 0, nil
	}
	counts, err := r.docRepo.CountHashReferrersBatch(ctx, hash.OperationID, []uuid.UUID{hash.HashID})
	if err != nil {
		return 0, fmt.Errorf("failed to count hash backlinks: %w", err)
	}
	return int(counts[hash.HashID]), nil
}

// CleanupHashReferences pulls hashID from hash_references across every document
// in operationID. Best-effort — a failed cleanup leaves dangling pointers but
// never blocks the hash delete itself. Sibling of CleanupCredentialReferences.
func (r *wikiDocumentResolver) CleanupHashReferences(ctx context.Context, operationID, hashID uuid.UUID) error {
	return r.docRepo.PullHashReference(ctx, operationID, hashID)
}

// fetchHashBacklinks is the shared body of the standalone query and the
// Hash.backlinks field resolver. Capped at maxBacklinks. Sibling of
// fetchCredentialBacklinks.
func (r *wikiDocumentResolver) fetchHashBacklinks(ctx context.Context, opID, hashID uuid.UUID) ([]*models.WikiDocument, error) {
	referrers, err := r.docRepo.FindHashReferrers(ctx, opID, hashID, maxBacklinks)
	if err != nil {
		return nil, fmt.Errorf("failed to list hash backlinks: %w", err)
	}
	out := make([]*models.WikiDocument, len(referrers))
	for i := range referrers {
		out[i] = &referrers[i]
	}
	return out, nil
}

// fetchBacklinks is the shared body of the standalone query and the
// WikiDocument.backlinks field resolver. Pulled out so the field path can
// skip re-fetching and re-authorizing the document — gqlgen has already
// resolved obj from an authorized query.
func (r *wikiDocumentResolver) fetchBacklinks(ctx context.Context, doc *models.WikiDocument) ([]*models.WikiDocument, error) {
	referrers, err := r.docRepo.FindReferrers(ctx, doc.OperationID, doc.DocumentID, maxBacklinks)
	if err != nil {
		return nil, fmt.Errorf("failed to list backlinks: %w", err)
	}
	out := make([]*models.WikiDocument, len(referrers))
	for i := range referrers {
		out[i] = &referrers[i]
	}
	return out, nil
}

// --- Backup queries ---

func (r *wikiDocumentResolver) WikiDocumentBackups(ctx context.Context, documentID string, trigger *models.WikiDocumentBackupTrigger, first *int, after *string, last *int, before *string) (*model.WikiDocumentBackupConnection, error) {
	docUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := r.docRepo.FindByID(ctx, docUID)
	if err != nil {
		return nil, fmt.Errorf("document not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, doc.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	args, err := pagination.ParseArgs(first, after, last, before)
	if err != nil {
		return nil, fmt.Errorf("invalid pagination args: %w", err)
	}

	total, err := r.backupRepo.CountByDocumentID(ctx, docUID, trigger)
	if err != nil {
		return nil, fmt.Errorf("failed to count backups: %w", err)
	}

	backups, err := r.backupRepo.FindByDocumentIDWithCursor(ctx, docUID, trigger, args.Cursor, args.Limit+1, args.Forward)
	if err != nil {
		return nil, fmt.Errorf("failed to list backups: %w", err)
	}

	hasMore := int64(len(backups)) > args.Limit
	if hasMore {
		backups = backups[:args.Limit]
	}

	edges := make([]*model.WikiDocumentBackupEdge, len(backups))
	for i := range backups {
		cursor := pagination.EncodeCursor(backups[i].CreateAt, backups[i].Id)
		edges[i] = &model.WikiDocumentBackupEdge{
			Node:   &backups[i],
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

	return &model.WikiDocumentBackupConnection{
		Edges:      edges,
		PageInfo:   &pageInfo,
		TotalCount: int(total),
	}, nil
}

func (r *wikiDocumentResolver) WikiDocumentBackup(ctx context.Context, id string) (*models.WikiDocumentBackup, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid backup ID: %w", err)
	}

	backup, err := r.backupRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("backup not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, backup.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	return &backup, nil
}

// --- Presence query ---

func (r *wikiDocumentResolver) WikiDocumentPresence(ctx context.Context, documentID string) (*model.WikiDocumentPresence, error) {
	docUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := r.docRepo.FindByID(ctx, docUID)
	if err != nil {
		return nil, fmt.Errorf("document not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, doc.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	editors := r.presence.GetPresence(docUID)
	gqlEditors := make([]*model.WikiDocumentEditor, len(editors))
	for i, e := range editors {
		gqlEditors[i] = &model.WikiDocumentEditor{
			UserID:      e.UserID.String(),
			Username:    e.Username,
			ConnectedAt: e.ConnectedAt.Format(time.RFC3339),
		}
	}

	return &model.WikiDocumentPresence{
		DocumentID:    documentID,
		ActiveEditors: gqlEditors,
	}, nil
}

func (r *wikiDocumentResolver) WikiOperationPresence(ctx context.Context, operationID string) ([]*model.WikiDocumentPresence, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	byDoc := r.presence.GetPresenceByOperation(opUID)
	result := make([]*model.WikiDocumentPresence, 0, len(byDoc))
	for docID, editors := range byDoc {
		gqlEditors := make([]*model.WikiDocumentEditor, len(editors))
		for i, e := range editors {
			gqlEditors[i] = &model.WikiDocumentEditor{
				UserID:      e.UserID.String(),
				Username:    e.Username,
				ConnectedAt: e.ConnectedAt.Format(time.RFC3339),
			}
		}
		result = append(result, &model.WikiDocumentPresence{
			DocumentID:    docID.String(),
			ActiveEditors: gqlEditors,
		})
	}
	return result, nil
}

// --- WikiDocument field resolvers ---

func (r *wikiDocumentResolver) WikiDocumentID(ctx context.Context, obj *models.WikiDocument) (string, error) {
	return obj.DocumentID.String(), nil
}

func (r *wikiDocumentResolver) WikiDocumentOperationID(ctx context.Context, obj *models.WikiDocument) (string, error) {
	return obj.OperationID.String(), nil
}

func (r *wikiDocumentResolver) WikiDocumentParentDocument(ctx context.Context, obj *models.WikiDocument) (*models.WikiDocument, error) {
	if obj.ParentDocumentID == nil {
		return nil, nil
	}
	parent, err := r.docRepo.FindByID(ctx, *obj.ParentDocumentID)
	if err != nil {
		return nil, nil // parent may have been deleted
	}
	return &parent, nil
}

// WikiDocumentParentDocumentID exposes the parent's id as a scalar — preferred
// by tree-style queries where loading the full parent document just to read
// its id would cost a Mongo round trip per row. Nil for root documents.
func (r *wikiDocumentResolver) WikiDocumentParentDocumentID(ctx context.Context, obj *models.WikiDocument) (*string, error) {
	if obj.ParentDocumentID == nil {
		return nil, nil
	}
	s := obj.ParentDocumentID.String()
	return &s, nil
}

// WikiDocumentAncestors returns the parent chain root→leaf (excluding obj
// itself) so the frontend can render a breadcrumb for any document — notably
// trashed ones, where the tree cache doesn't carry the path. Walks through
// trashed ancestors and marks each segment's isDeleted accordingly.
//
// Fast path: when a list resolver bulk-preloaded crumbs into the request
// loader and `obj.PathIDs` is populated, we assemble the chain entirely from
// the loader map — zero round trips. The legacy chain walk stays as the
// fallback for paths that don't precompute (subscription event payloads,
// callers that bypass the list resolver, missing entries).
func (r *wikiDocumentResolver) WikiDocumentAncestors(ctx context.Context, obj *models.WikiDocument) ([]*model.WikiDocumentAncestor, error) {
	if obj.ParentDocumentID == nil {
		return []*model.WikiDocumentAncestor{}, nil
	}

	if loader := WikiTreeLoaderFromContext(ctx); loader != nil && len(obj.PathIDs) > 0 {
		out := make([]*model.WikiDocumentAncestor, 0, len(obj.PathIDs))
		allPresent := true
		for _, id := range obj.PathIDs {
			entry, ok := loader.Ancestor(id)
			if !ok {
				allPresent = false
				break
			}
			out = append(out, entry)
		}
		if allPresent {
			return out, nil
		}
		// Partial loader population (e.g. preload encountered an error for a
		// subset of ids) — fall through to the live walk rather than
		// returning a partial breadcrumb.
	}

	chain, err := r.docRepo.FindAncestors(ctx, *obj.ParentDocumentID)
	if err != nil {
		// Degrade silently — the rest of the row is still useful.
		return []*model.WikiDocumentAncestor{}, nil
	}
	out := make([]*model.WikiDocumentAncestor, 0, len(chain))
	for _, a := range chain {
		// Defensive op-boundary check — parent chains must stay inside the
		// owning operation; if something slips, stop rather than leak.
		if a.OperationID != obj.OperationID {
			break
		}
		out = append(out, &model.WikiDocumentAncestor{
			ID:        a.DocumentID.String(),
			Title:     a.Title,
			Emoji:     a.Emoji,
			Icon:      a.Icon,
			Color:     a.Color,
			IsDeleted: a.DeletedAt != nil,
		})
	}
	return out, nil
}

// preloadAncestorEntries collects the union of PathIDs across the given
// page, fetches them in one Mongo round trip, and seeds the request loader
// so the per-row Ancestors resolver can assemble each chain from the map.
// Entries belonging to a different operation are skipped — the same
// op-boundary defense the live walk applies.
func preloadAncestorEntries(
	ctx context.Context,
	loader *WikiTreeLoader,
	docRepo repository.IWikiDocumentRepository,
	docs []models.WikiDocument,
	opID uuid.UUID,
) {
	wantSet := make(map[uuid.UUID]struct{})
	for i := range docs {
		for _, id := range docs[i].PathIDs {
			wantSet[id] = struct{}{}
		}
	}
	if len(wantSet) == 0 {
		return
	}
	want := make([]uuid.UUID, 0, len(wantSet))
	for id := range wantSet {
		want = append(want, id)
	}

	ancestors, err := docRepo.FindByIDs(ctx, want)
	if err != nil {
		// Don't fail the page — the field resolver falls back to the live
		// walk on a partial preload.
		return
	}
	entries := make(map[uuid.UUID]*model.WikiDocumentAncestor, len(ancestors))
	for i := range ancestors {
		a := &ancestors[i]
		if a.OperationID != opID {
			continue
		}
		entries[a.DocumentID] = &model.WikiDocumentAncestor{
			ID:        a.DocumentID.String(),
			Title:     a.Title,
			Emoji:     a.Emoji,
			Icon:      a.Icon,
			Color:     a.Color,
			IsDeleted: a.DeletedAt != nil,
		}
	}
	loader.SetAncestorEntries(entries)
}

func (r *wikiDocumentResolver) WikiDocumentChildDocuments(ctx context.Context, obj *models.WikiDocument) ([]*models.WikiDocument, error) {
	children, err := r.docRepo.FindChildDocuments(ctx, obj.DocumentID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch child documents: %w", err)
	}
	ptrs := make([]*models.WikiDocument, len(children))
	for i := range children {
		ptrs[i] = &children[i]
	}
	return ptrs, nil
}

func (r *wikiDocumentResolver) WikiDocumentChildCount(ctx context.Context, obj *models.WikiDocument) (int, error) {
	// Tree-shaped queries pre-populate the loader with bulk counts; honor
	// that so this resolver doesn't issue one Mongo Count per visible row.
	// Map miss falls back to a live count — covers non-tree callers and
	// rows that weren't included in the bulk precompute (defensive).
	if c, ok := WikiTreeLoaderFromContext(ctx).ChildCount(obj.DocumentID); ok {
		return c, nil
	}
	count, err := r.docRepo.CountChildDocuments(ctx, obj.DocumentID)
	if err != nil {
		return 0, fmt.Errorf("failed to count children: %w", err)
	}
	return int(count), nil
}

// WikiDocumentBacklinksField is the field resolver for WikiDocument.backlinks.
// Auth already happened on the parent query — skip the re-authorize that the
// standalone WikiDocumentBacklinks path performs.
func (r *wikiDocumentResolver) WikiDocumentBacklinksField(ctx context.Context, obj *models.WikiDocument) ([]*models.WikiDocument, error) {
	return r.fetchBacklinks(ctx, obj)
}

func (r *wikiDocumentResolver) WikiDocumentCreatedBy(ctx context.Context, obj *models.WikiDocument) (*models.User, error) {
	user, err := r.userRepo.FindByID(ctx, obj.CreatedByID)
	if err != nil {
		return nil, nil
	}
	return &user, nil
}

func (r *wikiDocumentResolver) WikiDocumentLastUpdatedBy(ctx context.Context, obj *models.WikiDocument) (*models.User, error) {
	if obj.LastUpdatedByID == nil {
		return nil, nil
	}
	user, err := r.userRepo.FindByID(ctx, *obj.LastUpdatedByID)
	if err != nil {
		return nil, nil
	}
	return &user, nil
}

func (r *wikiDocumentResolver) WikiDocumentLastUpdatedAt(ctx context.Context, obj *models.WikiDocument) (*string, error) {
	if obj.LastUpdatedAt == nil {
		return nil, nil
	}
	s := obj.LastUpdatedAt.Format(time.RFC3339)
	return &s, nil
}

func (r *wikiDocumentResolver) WikiDocumentDeletedBy(ctx context.Context, obj *models.WikiDocument) (*models.User, error) {
	if obj.DeletedByID == nil {
		return nil, nil
	}
	user, err := r.userRepo.FindByID(ctx, *obj.DeletedByID)
	if err != nil {
		return nil, nil
	}
	return &user, nil
}

func (r *wikiDocumentResolver) WikiDocumentLastBackupAt(ctx context.Context, obj *models.WikiDocument) (*string, error) {
	if obj.LastBackupAt == nil {
		return nil, nil
	}
	s := obj.LastBackupAt.Format(time.RFC3339)
	return &s, nil
}

func (r *wikiDocumentResolver) WikiDocumentDeletedAt(ctx context.Context, obj *models.WikiDocument) (*string, error) {
	if obj.DeletedAt == nil {
		return nil, nil
	}
	s := obj.DeletedAt.Format(time.RFC3339)
	return &s, nil
}

func (r *wikiDocumentResolver) WikiDocumentCreatedAt(ctx context.Context, obj *models.WikiDocument) (string, error) {
	return obj.CreateAt.Format(time.RFC3339), nil
}

func (r *wikiDocumentResolver) WikiDocumentUpdatedAt(ctx context.Context, obj *models.WikiDocument) (string, error) {
	return obj.UpdateAt.Format(time.RFC3339), nil
}

// --- WikiDocumentBackup field resolvers ---

func (r *wikiDocumentResolver) WikiDocumentBackupID(ctx context.Context, obj *models.WikiDocumentBackup) (string, error) {
	return obj.BackupID.String(), nil
}

func (r *wikiDocumentResolver) WikiDocumentBackupDocumentID(ctx context.Context, obj *models.WikiDocumentBackup) (string, error) {
	return obj.DocumentID.String(), nil
}

func (r *wikiDocumentResolver) WikiDocumentBackupContentLength(ctx context.Context, obj *models.WikiDocumentBackup) (int, error) {
	return len(obj.Content), nil
}

func (r *wikiDocumentResolver) WikiDocumentBackupCreatedBy(ctx context.Context, obj *models.WikiDocumentBackup) (*models.User, error) {
	if obj.CreatedByID == uuid.Nil {
		return nil, nil
	}
	user, err := r.userRepo.FindByID(ctx, obj.CreatedByID)
	if err != nil {
		return nil, nil
	}
	return &user, nil
}

func (r *wikiDocumentResolver) WikiDocumentBackupCreatedAt(ctx context.Context, obj *models.WikiDocumentBackup) (string, error) {
	return obj.CreateAt.Format(time.RFC3339), nil
}

// --- Internal helpers ---

// createSafetyBackup creates an automatic safety backup before destructive operations.
func (r *wikiDocumentResolver) createSafetyBackup(ctx context.Context, doc *models.WikiDocument, createdByID uuid.UUID, description string) {
	backup := &models.WikiDocumentBackup{
		BackupID:     uuid.New(),
		DocumentID:   doc.DocumentID,
		OperationID:  doc.OperationID,
		Title:        doc.Title,
		Content:      doc.Content,
		ContentState: doc.ContentState,
		Trigger:      models.WikiDocumentBackupTriggerAuto,
		Description:  description,
		CreatedByID:  createdByID,
	}
	// Best-effort — don't fail the parent operation if backup creation fails
	_ = r.backupRepo.Create(ctx, backup)
}
