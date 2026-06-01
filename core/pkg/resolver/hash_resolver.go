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

// Caps and limits intentionally mirror the credential resolver — operators
// expect the two findings tabs to behave the same way.
const (
	myHashesOpCap          = 100
	maxHashProperties      = 32
	maxHashPropertyNameLen = 64
	maxHashPropertyValLen  = 4096
	// bulkImportCap bounds a single bulkImportHashes call. Above this the
	// request becomes a latency hazard (each row triggers an index lookup for
	// dedupe). Operators with bigger pastes split them by hand.
	bulkImportCap = 5000
)

// errHashCommentNotFound signals a commentId that doesn't exist on the target hash.
var errHashCommentNotFound = errors.New("comment not found on this hash")

// IHashResolver defines the business logic methods for the Hash entity.
type IHashResolver interface {
	// Mutations
	CreateHash(ctx context.Context, operationID string, input model.CreateHashInput) (*models.Hash, error)
	UpdateHash(ctx context.Context, id string, input model.UpdateHashInput) (*models.Hash, error)
	DeleteHash(ctx context.Context, id string) (bool, error)
	BulkImportHashes(ctx context.Context, operationID string, input model.BulkImportHashesInput) (*model.BulkImportHashesResult, error)
	MarkHashCracked(ctx context.Context, id string, input model.MarkHashCrackedInput) (*models.Hash, error)

	// Comment mutations
	AddHashComment(ctx context.Context, hashID string, text string) (*models.Hash, error)
	UpdateHashComment(ctx context.Context, hashID string, commentID string, text string) (*models.Hash, error)
	DeleteHashComment(ctx context.Context, hashID string, commentID string) (*models.Hash, error)

	// Queries
	Hash(ctx context.Context, id string) (*models.Hash, error)
	Hashes(ctx context.Context, operationID string, search *string, statuses []models.HashStatus, hashTypes []string, tags []string, hasCredential *bool, first *int, after *string, last *int, before *string) (*model.HashConnection, error)
	HashTags(ctx context.Context, operationID string) ([]string, error)
	MyHashes(ctx context.Context, operationIDs []string, search *string, statuses []models.HashStatus, hashTypes []string, tags []string, hasCredential *bool, first *int, after *string, last *int, before *string) (*model.HashConnection, error)
	MyHashTags(ctx context.Context, operationIDs []string) ([]string, error)
	HashTypes(ctx context.Context) ([]*models.HashTypeSpec, error)

	// Field resolvers for Hash
	ID(ctx context.Context, obj *models.Hash) (string, error)
	OperationIDField(ctx context.Context, obj *models.Hash) (string, error)
	Operation(ctx context.Context, obj *models.Hash) (*models.Operation, error)
	CredentialID(ctx context.Context, obj *models.Hash) (*string, error)
	Credential(ctx context.Context, obj *models.Hash) (*models.Credential, error)
	CrackingMeta(ctx context.Context, obj *models.Hash) (*models.HashCrackingMeta, error)
	Comments(ctx context.Context, obj *models.Hash) ([]*models.HashComment, error)
	ViewerCanModerateComments(ctx context.Context, obj *models.Hash) (bool, error)
	CreatedBy(ctx context.Context, obj *models.Hash) (*models.User, error)
	CreatedAt(ctx context.Context, obj *models.Hash) (string, error)
	UpdatedAt(ctx context.Context, obj *models.Hash) (string, error)

	// Field resolvers for HashComment
	CommentID(ctx context.Context, obj *models.HashComment) (string, error)
	CommentAuthor(ctx context.Context, obj *models.HashComment) (*models.User, error)
	CommentCreatedAt(ctx context.Context, obj *models.HashComment) (string, error)
	CommentUpdatedAt(ctx context.Context, obj *models.HashComment) (string, error)

	// Field resolvers for HashCrackingMeta
	CrackingMetaDurationSec(ctx context.Context, obj *models.HashCrackingMeta) (int, error)
	CrackingMetaCrackedBy(ctx context.Context, obj *models.HashCrackingMeta) (*models.User, error)
	CrackingMetaCrackedAt(ctx context.Context, obj *models.HashCrackingMeta) (string, error)

	// Cross-domain: backlinks from a credential to the hashes that produced it.
	// Called by the Credential.sourceHashes field resolver — the inverse index
	// lives in the hashes collection (Hash.credential_id) so the query
	// naturally belongs in hash-land.
	SourceHashesForCredential(ctx context.Context, credential *models.Credential) ([]*models.Hash, error)
}

type hashResolver struct {
	hashRepo      repository.IHashRepository
	credRepo      repository.ICredentialRepository
	operationRepo repository.IOperationRepository
	userRepo      repository.IUserRepository
	// credResolver is used by MarkHashCracked when the operator opts to create
	// a new credential inline. Going through the resolver (not the repo)
	// preserves the credential's own validation, normalisation, and event
	// publishing — there is no second code path for credential creation.
	credResolver ICredentialResolver
	eventBus     eventbus.IEventBus
}

// NewHashResolver wires dependencies. credResolver is required for the
// "create credential inline" branch of MarkHashCracked; pass the same
// CredentialResolver instance that NewCredentialResolver produced.
func NewHashResolver(
	hashRepo repository.IHashRepository,
	credRepo repository.ICredentialRepository,
	operationRepo repository.IOperationRepository,
	userRepo repository.IUserRepository,
	credResolver ICredentialResolver,
	bus eventbus.IEventBus,
) IHashResolver {
	if bus == nil {
		bus = eventbus.NewNopEventBus()
	}
	return &hashResolver{
		hashRepo:      hashRepo,
		credRepo:      credRepo,
		operationRepo: operationRepo,
		userRepo:      userRepo,
		credResolver:  credResolver,
		eventBus:      bus,
	}
}

func (r *hashResolver) authorizeForOperation(ctx context.Context, operationID uuid.UUID, minRole models.OperationRole) error {
	op, err := r.operationRepo.FindByID(ctx, operationID)
	if err != nil {
		return fmt.Errorf("operation not found: %w", err)
	}
	return authorization.AuthorizeOperationRole(ctx, &op, minRole)
}

// --- Mutations ---

func (r *hashResolver) CreateHash(ctx context.Context, operationID string, input model.CreateHashInput) (*models.Hash, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}
	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	value := strings.TrimSpace(input.Value)
	if value == "" {
		return nil, fmt.Errorf("value is required")
	}
	hashTypeName, hashcatMode := models.NormalizeHashType(input.HashType)
	if hashTypeName == "" {
		return nil, fmt.Errorf("hashType is required")
	}

	status := models.HashStatusNotProcessed
	if input.Status != nil {
		if !input.Status.IsValid() {
			return nil, fmt.Errorf("invalid status: %s", *input.Status)
		}
		// Create-time CRACKED is not allowed; markHashCracked is the only way
		// to land in that state because it enforces the credential link.
		if *input.Status == models.HashStatusCracked {
			return nil, fmt.Errorf("cannot create a hash directly in CRACKED status; use markHashCracked after creation")
		}
		status = *input.Status
	}

	callerUID, err := callerUIDFromCtx(ctx)
	if err != nil {
		return nil, err
	}

	properties, err := normalizeHashProperties(input.Properties)
	if err != nil {
		return nil, err
	}

	h := &models.Hash{
		HashID:      uuid.New(),
		OperationID: opUID,
		Value:       value,
		HashType:    hashTypeName,
		HashcatMode: hashcatMode,
		Username:    strings.TrimSpace(strDeref(input.Username)),
		Domain:      strings.TrimSpace(strDeref(input.Domain)),
		Status:      status,
		Source:      strings.TrimSpace(strDeref(input.Source)),
		Tags:        normalizeTags(input.Tags),
		Properties:  properties,
		Comments:    []models.HashComment{},
		CreatedByID: callerUID,
	}

	if err := r.hashRepo.Create(ctx, h); err != nil {
		if errors.Is(err, repository.ErrHashDuplicate) {
			return nil, fmt.Errorf("a hash with this value already exists in the operation")
		}
		return nil, fmt.Errorf("failed to create hash: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewHashCreatedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.HashEventPayload{
			HashID:      h.HashID.String(),
			OperationID: h.OperationID.String(),
		},
	))

	return h, nil
}

func (r *hashResolver) UpdateHash(ctx context.Context, id string, input model.UpdateHashInput) (*models.Hash, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid hash ID: %w", err)
	}

	h, err := r.hashRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("hash not found: %w", err)
	}
	if err := r.authorizeForOperation(ctx, h.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	updates := make(map[string]interface{})

	if input.Value != nil {
		v := strings.TrimSpace(*input.Value)
		if v == "" {
			return nil, fmt.Errorf("value cannot be empty")
		}
		updates["value"] = v
	}
	if input.HashType != nil {
		name, mode := models.NormalizeHashType(*input.HashType)
		if name == "" {
			return nil, fmt.Errorf("hashType cannot be empty")
		}
		updates["hash_type"] = name
		updates["hashcat_mode"] = mode
	}
	if input.Username != nil {
		updates["username"] = strings.TrimSpace(*input.Username)
	}
	if input.Domain != nil {
		updates["domain"] = strings.TrimSpace(*input.Domain)
	}
	if input.Source != nil {
		updates["source"] = strings.TrimSpace(*input.Source)
	}
	if input.Status != nil {
		if !input.Status.IsValid() {
			return nil, fmt.Errorf("invalid status: %s", *input.Status)
		}
		// CRACKED transitions are gated to markHashCracked so the credential
		// link is always set together with the status. Without this check the
		// UI could leave a cracked hash without any source-of-truth password.
		if *input.Status == models.HashStatusCracked && h.Status != models.HashStatusCracked {
			return nil, fmt.Errorf("transition to CRACKED must go through markHashCracked")
		}
		updates["status"] = *input.Status
	}
	if input.Tags != nil {
		updates["tags"] = normalizeTags(input.Tags)
	}
	if input.Properties != nil {
		props, err := normalizeHashProperties(input.Properties)
		if err != nil {
			return nil, err
		}
		updates["properties"] = props
	}

	if len(updates) == 0 {
		return &h, nil
	}

	if err := r.hashRepo.Update(ctx, &h, updates); err != nil {
		return nil, fmt.Errorf("failed to update hash: %w", err)
	}

	updated, err := r.hashRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated hash: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewHashUpdatedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.HashEventPayload{
			HashID:      updated.HashID.String(),
			OperationID: updated.OperationID.String(),
		},
	))

	return &updated, nil
}

func (r *hashResolver) DeleteHash(ctx context.Context, id string) (bool, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("invalid hash ID: %w", err)
	}
	h, err := r.hashRepo.FindByID(ctx, uid)
	if err != nil {
		return false, fmt.Errorf("hash not found: %w", err)
	}
	if err := r.authorizeForOperation(ctx, h.OperationID, models.OperationRoleOperator); err != nil {
		return false, err
	}

	if err := r.hashRepo.Delete(ctx, &h); err != nil {
		return false, fmt.Errorf("failed to delete hash: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewHashDeletedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.HashEventPayload{
			HashID:      h.HashID.String(),
			OperationID: h.OperationID.String(),
		},
	))

	return true, nil
}

// BulkImportHashes parses `input.Text` per `input.Format`, dedupes against
// existing hashes, and inserts the survivors. Emits one summary event per
// call regardless of batch size.
func (r *hashResolver) BulkImportHashes(ctx context.Context, operationID string, input model.BulkImportHashesInput) (*model.BulkImportHashesResult, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}
	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	callerUID, err := callerUIDFromCtx(ctx)
	if err != nil {
		return nil, err
	}

	defaultType := strings.TrimSpace(strDeref(input.DefaultHashType))
	if defaultType == "" {
		// RAW input without a default leaves rows with no hash type, which is
		// useless for filtering — fail fast rather than insert junk.
		if input.Format == model.BulkHashFormatRaw {
			return nil, fmt.Errorf("defaultHashType is required for RAW format")
		}
	}

	parsed, err := parseBulkHashes(input.Text, input.Format, defaultType)
	if err != nil {
		return nil, err
	}
	if len(parsed) == 0 {
		return &model.BulkImportHashesResult{
			Added:   0,
			Skipped: 0,
			Hashes:  []*models.Hash{},
		}, nil
	}
	if len(parsed) > bulkImportCap {
		return nil, fmt.Errorf("bulk import exceeds cap of %d rows (got %d)", bulkImportCap, len(parsed))
	}

	source := strings.TrimSpace(strDeref(input.Source))
	tags := normalizeTags(input.Tags)

	// Dedupe within the same paste — two identical hashes in one batch would
	// blow the unique index on the second insert; one survives.
	seen := make(map[string]struct{}, len(parsed))
	rows := make([]*models.Hash, 0, len(parsed))
	intraBatchSkipped := 0
	for _, p := range parsed {
		if _, dup := seen[p.value]; dup {
			intraBatchSkipped++
			continue
		}
		seen[p.value] = struct{}{}
		name, mode := models.NormalizeHashType(p.hashType)
		rows = append(rows, &models.Hash{
			HashID:      uuid.New(),
			OperationID: opUID,
			Value:       p.value,
			HashType:    name,
			HashcatMode: mode,
			Username:    p.username,
			Domain:      p.domain,
			Status:      models.HashStatusNotProcessed,
			Source:      source,
			Tags:        tags,
			Properties:  []models.HashProperty{},
			Comments:    []models.HashComment{},
			CreatedByID: callerUID,
		})
	}

	inserted, dbSkipped, err := r.hashRepo.BulkCreate(ctx, rows)
	if err != nil {
		return nil, fmt.Errorf("bulk insert failed after %d rows: %w", len(inserted), err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	if len(inserted) > 0 {
		r.eventBus.Publish(eventbus.NewHashBulkImportedEvent(
			eventbus.UserActor(auth.UserID),
			eventbus.HashBulkImportPayload{
				OperationID: opUID.String(),
				Count:       len(inserted),
			},
		))
	}

	return &model.BulkImportHashesResult{
		Added:   len(inserted),
		Skipped: dbSkipped + intraBatchSkipped,
		Hashes:  inserted,
	}, nil
}

// MarkHashCracked is the only mutation that can move a hash into CRACKED.
// Caller must supply either credentialId (link to existing) or newCredential
// (create inline). Plaintext goes onto the linked credential's Password; the
// hash itself never stores the plaintext (single source of truth).
//
// Ordering: credential first, then hash. If the hash update fails after a new
// credential was created, the credential remains as an orphan — easier to
// recover (operator can manually link via updateHash → newCredentialId in a
// future iteration, or just delete the credential) than the inverse risk of
// double-crediting a hash that was already linked.
func (r *hashResolver) MarkHashCracked(ctx context.Context, id string, input model.MarkHashCrackedInput) (*models.Hash, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid hash ID: %w", err)
	}

	h, err := r.hashRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("hash not found: %w", err)
	}
	if err := r.authorizeForOperation(ctx, h.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	plaintext := strings.TrimSpace(input.Plaintext)
	if plaintext == "" {
		return nil, fmt.Errorf("plaintext is required")
	}

	// XOR — exactly one of credentialId / newCredential must be set.
	hasExisting := input.CredentialID != nil && strings.TrimSpace(*input.CredentialID) != ""
	hasNew := input.NewCredential != nil
	if hasExisting == hasNew {
		return nil, fmt.Errorf("supply exactly one of credentialId or newCredential")
	}

	var credUID uuid.UUID
	if hasExisting {
		credUID, err = uuid.Parse(*input.CredentialID)
		if err != nil {
			return nil, fmt.Errorf("invalid credentialId: %w", err)
		}
		// Verify the existing credential belongs to the same operation.
		existing, err := r.credRepo.FindByID(ctx, credUID)
		if err != nil {
			return nil, fmt.Errorf("credential not found: %w", err)
		}
		if existing.OperationID != h.OperationID {
			return nil, fmt.Errorf("credential belongs to a different operation")
		}
		// Update the existing credential's password with the cracked plaintext.
		// Leave name/type/tags untouched — the operator chose this credential
		// for a reason; we only fill in the password they came here to record.
		passwordPtr := plaintext
		if _, err := r.credResolver.UpdateCredential(ctx, credUID.String(), model.UpdateCredentialInput{
			Password: &passwordPtr,
		}); err != nil {
			return nil, fmt.Errorf("failed to update credential: %w", err)
		}
	} else {
		// Create inline. Defaults: type=PASSWORD if omitted, name = "<username> (cracked from hash)"
		// if omitted, username from the hash if omitted, password = plaintext.
		newInput := *input.NewCredential
		if !newInput.Type.IsValid() {
			newInput.Type = models.CredentialTypePassword
		}
		if strings.TrimSpace(newInput.Name) == "" {
			n := defaultCredentialName(h)
			newInput.Name = n
		}
		if newInput.Username == nil || strings.TrimSpace(*newInput.Username) == "" {
			u := h.Username
			newInput.Username = &u
		}
		passwordPtr := plaintext
		newInput.Password = &passwordPtr

		cred, err := r.credResolver.CreateCredential(ctx, h.OperationID.String(), newInput)
		if err != nil {
			return nil, fmt.Errorf("failed to create credential: %w", err)
		}
		credUID = cred.CredentialID
	}

	now := time.Now().UTC()
	callerUID, err := callerUIDFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	meta := models.HashCrackingMeta{
		Tool:        strings.TrimSpace(strDeref(input.Tool)),
		Wordlist:    strings.TrimSpace(strDeref(input.Wordlist)),
		Rules:       strings.TrimSpace(strDeref(input.Rules)),
		DurationSec: int64ValueOrZero(input.DurationSec),
		CrackedByID: callerUID,
		CrackedAt:   now,
	}
	updates := map[string]interface{}{
		"status":        models.HashStatusCracked,
		"credential_id": credUID,
		"cracking_meta": meta,
	}
	if err := r.hashRepo.Update(ctx, &h, updates); err != nil {
		return nil, fmt.Errorf("failed to mark hash cracked (credential link survived): %w", err)
	}

	updated, err := r.hashRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated hash: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewHashCrackedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.HashCrackedPayload{
			HashID:       updated.HashID.String(),
			OperationID:  updated.OperationID.String(),
			CredentialID: credUID.String(),
		},
	))

	return &updated, nil
}

// --- Comment mutations ---

func (r *hashResolver) AddHashComment(ctx context.Context, hashID string, text string) (*models.Hash, error) {
	hUID, err := uuid.Parse(hashID)
	if err != nil {
		return nil, fmt.Errorf("invalid hash ID: %w", err)
	}
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return nil, fmt.Errorf("comment text cannot be empty")
	}
	h, err := r.hashRepo.FindByID(ctx, hUID)
	if err != nil {
		return nil, fmt.Errorf("hash not found: %w", err)
	}
	if err := r.authorizeForOperation(ctx, h.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}
	authorUID, err := callerUIDFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	comment := models.HashComment{
		CommentID: uuid.New(),
		AuthorID:  authorUID,
		Text:      trimmed,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := r.hashRepo.AddComment(ctx, hUID, comment); err != nil {
		return nil, fmt.Errorf("failed to add comment: %w", err)
	}
	updated, err := r.hashRepo.FindByID(ctx, hUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated hash: %w", err)
	}
	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewHashCommentAddedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.HashEventPayload{
			HashID:      updated.HashID.String(),
			OperationID: updated.OperationID.String(),
		},
	))
	return &updated, nil
}

func (r *hashResolver) UpdateHashComment(ctx context.Context, hashID string, commentID string, text string) (*models.Hash, error) {
	hUID, err := uuid.Parse(hashID)
	if err != nil {
		return nil, fmt.Errorf("invalid hash ID: %w", err)
	}
	cUID, err := uuid.Parse(commentID)
	if err != nil {
		return nil, fmt.Errorf("invalid comment ID: %w", err)
	}
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return nil, fmt.Errorf("comment text cannot be empty")
	}
	h, err := r.hashRepo.FindByID(ctx, hUID)
	if err != nil {
		return nil, fmt.Errorf("hash not found: %w", err)
	}
	comment, ok := findHashComment(h.Comments, cUID)
	if !ok {
		return nil, errHashCommentNotFound
	}
	if err := r.authorizeForCommentMutation(ctx, h.OperationID, comment.AuthorID); err != nil {
		return nil, err
	}
	if err := r.hashRepo.UpdateComment(ctx, hUID, cUID, trimmed, time.Now().UTC()); err != nil {
		return nil, fmt.Errorf("failed to update comment: %w", err)
	}
	updated, err := r.hashRepo.FindByID(ctx, hUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated hash: %w", err)
	}
	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewHashCommentUpdatedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.HashEventPayload{
			HashID:      updated.HashID.String(),
			OperationID: updated.OperationID.String(),
		},
	))
	return &updated, nil
}

func (r *hashResolver) DeleteHashComment(ctx context.Context, hashID string, commentID string) (*models.Hash, error) {
	hUID, err := uuid.Parse(hashID)
	if err != nil {
		return nil, fmt.Errorf("invalid hash ID: %w", err)
	}
	cUID, err := uuid.Parse(commentID)
	if err != nil {
		return nil, fmt.Errorf("invalid comment ID: %w", err)
	}
	h, err := r.hashRepo.FindByID(ctx, hUID)
	if err != nil {
		return nil, fmt.Errorf("hash not found: %w", err)
	}
	comment, ok := findHashComment(h.Comments, cUID)
	if !ok {
		return nil, errHashCommentNotFound
	}
	if err := r.authorizeForCommentMutation(ctx, h.OperationID, comment.AuthorID); err != nil {
		return nil, err
	}
	if err := r.hashRepo.RemoveComment(ctx, hUID, cUID); err != nil {
		return nil, fmt.Errorf("failed to delete comment: %w", err)
	}
	updated, err := r.hashRepo.FindByID(ctx, hUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated hash: %w", err)
	}
	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewHashCommentRemovedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.HashEventPayload{
			HashID:      updated.HashID.String(),
			OperationID: updated.OperationID.String(),
		},
	))
	return &updated, nil
}

// authorizeForCommentMutation mirrors the credential resolver: author always
// wins (still needs viewer in the op); otherwise requires op-admin / app-admin.
func (r *hashResolver) authorizeForCommentMutation(ctx context.Context, operationID uuid.UUID, authorID uuid.UUID) error {
	op, err := r.operationRepo.FindByID(ctx, operationID)
	if err != nil {
		return fmt.Errorf("operation not found: %w", err)
	}
	callerUID, err := callerUIDFromCtx(ctx)
	if err != nil {
		return err
	}
	if callerUID == authorID {
		return authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleViewer)
	}
	if err := authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleAdmin); err != nil {
		return fmt.Errorf("forbidden: only the comment author or an operation admin can modify this comment")
	}
	return nil
}

// --- Queries ---

func (r *hashResolver) Hash(ctx context.Context, id string) (*models.Hash, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid hash ID: %w", err)
	}
	h, err := r.hashRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("hash not found: %w", err)
	}
	if err := r.authorizeForOperation(ctx, h.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}
	return &h, nil
}

func (r *hashResolver) Hashes(ctx context.Context, operationID string, search *string, statuses []models.HashStatus, hashTypes []string, tags []string, hasCredential *bool, first *int, after *string, last *int, before *string) (*model.HashConnection, error) {
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
	filter := buildHashListFilter(search, statuses, hashTypes, tags, hasCredential)

	total, err := r.hashRepo.CountByOperationID(ctx, opUID, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to count hashes: %w", err)
	}
	hashes, err := r.hashRepo.FindByOperationIDWithCursor(ctx, opUID, filter, args.Cursor, args.Limit+1, args.Forward)
	if err != nil {
		return nil, fmt.Errorf("failed to list hashes: %w", err)
	}
	return buildHashConnection(hashes, args, int(total)), nil
}

func (r *hashResolver) HashTags(ctx context.Context, operationID string) ([]string, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}
	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleViewer); err != nil {
		return nil, err
	}
	tags, err := r.hashRepo.DistinctTagsByOperationID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("failed to list hash tags: %w", err)
	}
	sort.Strings(tags)
	return tags, nil
}

func (r *hashResolver) MyHashes(ctx context.Context, operationIDs []string, search *string, statuses []models.HashStatus, hashTypes []string, tags []string, hasCredential *bool, first *int, after *string, last *int, before *string) (*model.HashConnection, error) {
	opUIDs, err, ok := r.resolveAccessibleOperationIDs(ctx, operationIDs)
	if err != nil {
		return nil, err
	}
	args, err := pagination.ParseArgs(first, after, last, before)
	if err != nil {
		return nil, fmt.Errorf("invalid pagination args: %w", err)
	}
	if !ok {
		return &model.HashConnection{
			Edges:      []*model.HashEdge{},
			PageInfo:   &pagination.PageInfo{},
			TotalCount: 0,
		}, nil
	}
	filter := buildHashListFilter(search, statuses, hashTypes, tags, hasCredential)

	total, err := r.hashRepo.CountByOperationIDs(ctx, opUIDs, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to count hashes: %w", err)
	}
	hashes, err := r.hashRepo.FindByOperationIDsWithCursor(ctx, opUIDs, filter, args.Cursor, args.Limit+1, args.Forward)
	if err != nil {
		return nil, fmt.Errorf("failed to list hashes: %w", err)
	}
	return buildHashConnection(hashes, args, int(total)), nil
}

func (r *hashResolver) MyHashTags(ctx context.Context, operationIDs []string) ([]string, error) {
	opUIDs, err, ok := r.resolveAccessibleOperationIDs(ctx, operationIDs)
	if err != nil {
		return nil, err
	}
	if !ok {
		return []string{}, nil
	}
	tags, err := r.hashRepo.DistinctTagsByOperationIDs(ctx, opUIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to list hash tags: %w", err)
	}
	sort.Strings(tags)
	return tags, nil
}

func (r *hashResolver) HashTypes(ctx context.Context) ([]*models.HashTypeSpec, error) {
	specs := models.HashTypeSpecs()
	out := make([]*models.HashTypeSpec, len(specs))
	for i := range specs {
		cp := specs[i]
		out[i] = &cp
	}
	return out, nil
}

// resolveAccessibleOperationIDs is the hash-resolver twin of the credential
// resolver's same-named helper. Kept duplicated rather than promoted to a
// shared helper because both copies are short and exporting them would mean
// promoting myCredentialsOpCap too — the two caps are independent on purpose.
func (r *hashResolver) resolveAccessibleOperationIDs(ctx context.Context, operationIDs []string) ([]uuid.UUID, error, bool) {
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
	if len(operationIDs) > myHashesOpCap {
		return nil, fmt.Errorf("too many operations selected (max %d)", myHashesOpCap), false
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

// --- Field resolvers ---

func (r *hashResolver) ID(_ context.Context, obj *models.Hash) (string, error) {
	return obj.HashID.String(), nil
}

func (r *hashResolver) OperationIDField(_ context.Context, obj *models.Hash) (string, error) {
	return obj.OperationID.String(), nil
}

func (r *hashResolver) Operation(ctx context.Context, obj *models.Hash) (*models.Operation, error) {
	op, err := r.operationRepo.FindByID(ctx, obj.OperationID)
	if err != nil {
		return nil, fmt.Errorf("failed to load operation: %w", err)
	}
	return &op, nil
}

func (r *hashResolver) CredentialID(_ context.Context, obj *models.Hash) (*string, error) {
	if obj.CredentialID == nil {
		return nil, nil
	}
	s := obj.CredentialID.String()
	return &s, nil
}

// Credential lookup is on-demand. Skip the field in list queries to avoid an
// N+1; the details dialog selects it.
func (r *hashResolver) Credential(ctx context.Context, obj *models.Hash) (*models.Credential, error) {
	if obj.CredentialID == nil {
		return nil, nil
	}
	cred, err := r.credRepo.FindByID(ctx, *obj.CredentialID)
	if err != nil {
		// Treat a missing credential as nullable so a stale link does not
		// fail the whole hash query.
		return nil, nil
	}
	return &cred, nil
}

func (r *hashResolver) CrackingMeta(_ context.Context, obj *models.Hash) (*models.HashCrackingMeta, error) {
	return obj.CrackingMeta, nil
}

func (r *hashResolver) Comments(_ context.Context, obj *models.Hash) ([]*models.HashComment, error) {
	if len(obj.Comments) == 0 {
		return []*models.HashComment{}, nil
	}
	out := make([]*models.HashComment, len(obj.Comments))
	for i := range obj.Comments {
		out[i] = &obj.Comments[i]
	}
	return out, nil
}

func (r *hashResolver) ViewerCanModerateComments(ctx context.Context, obj *models.Hash) (bool, error) {
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

func (r *hashResolver) CreatedBy(ctx context.Context, obj *models.Hash) (*models.User, error) {
	if obj.CreatedByID == uuid.Nil {
		return nil, nil
	}
	user, err := r.userRepo.FindByID(ctx, obj.CreatedByID)
	if err != nil {
		return nil, nil
	}
	return &user, nil
}

func (r *hashResolver) CreatedAt(_ context.Context, obj *models.Hash) (string, error) {
	return obj.CreateAt.Format(time.RFC3339), nil
}

func (r *hashResolver) UpdatedAt(_ context.Context, obj *models.Hash) (string, error) {
	return obj.UpdateAt.Format(time.RFC3339), nil
}

func (r *hashResolver) CommentID(_ context.Context, obj *models.HashComment) (string, error) {
	return obj.CommentID.String(), nil
}

func (r *hashResolver) CommentAuthor(ctx context.Context, obj *models.HashComment) (*models.User, error) {
	if obj.AuthorID == uuid.Nil {
		return nil, nil
	}
	user, err := r.userRepo.FindByID(ctx, obj.AuthorID)
	if err != nil {
		return nil, nil
	}
	return &user, nil
}

func (r *hashResolver) CommentCreatedAt(_ context.Context, obj *models.HashComment) (string, error) {
	return obj.CreatedAt.Format(time.RFC3339), nil
}

func (r *hashResolver) CommentUpdatedAt(_ context.Context, obj *models.HashComment) (string, error) {
	return obj.UpdatedAt.Format(time.RFC3339), nil
}

func (r *hashResolver) CrackingMetaDurationSec(_ context.Context, obj *models.HashCrackingMeta) (int, error) {
	return int(obj.DurationSec), nil
}

func (r *hashResolver) CrackingMetaCrackedBy(ctx context.Context, obj *models.HashCrackingMeta) (*models.User, error) {
	if obj.CrackedByID == uuid.Nil {
		return nil, nil
	}
	user, err := r.userRepo.FindByID(ctx, obj.CrackedByID)
	if err != nil {
		return nil, nil
	}
	return &user, nil
}

func (r *hashResolver) CrackingMetaCrackedAt(_ context.Context, obj *models.HashCrackingMeta) (string, error) {
	return obj.CrackedAt.Format(time.RFC3339), nil
}

// SourceHashesForCredential returns every hash that points at this credential.
// Bounded by the per-op index; callers (the Credential.sourceHashes field
// resolver) treat the result as a small list — no pagination.
func (r *hashResolver) SourceHashesForCredential(ctx context.Context, credential *models.Credential) ([]*models.Hash, error) {
	if credential == nil {
		return []*models.Hash{}, nil
	}
	hashes, err := r.hashRepo.FindByCredentialID(ctx, credential.OperationID, credential.CredentialID)
	if err != nil {
		return nil, fmt.Errorf("failed to load source hashes: %w", err)
	}
	out := make([]*models.Hash, len(hashes))
	for i := range hashes {
		cp := hashes[i]
		out[i] = &cp
	}
	return out, nil
}

// --- Helpers ---

func buildHashListFilter(search *string, statuses []models.HashStatus, hashTypes []string, tags []string, hasCredential *bool) repository.HashFilter {
	filter := repository.HashFilter{
		Statuses:      statuses,
		Tags:          normalizeTags(tags),
		HasCredential: hasCredential,
	}
	if search != nil {
		filter.Search = strings.TrimSpace(*search)
	}
	// Normalise each provided type string so callers can pass either canonical
	// names or free-form input. Drops empty entries.
	if len(hashTypes) > 0 {
		out := make([]string, 0, len(hashTypes))
		seen := make(map[string]struct{}, len(hashTypes))
		for _, t := range hashTypes {
			n, _ := models.NormalizeHashType(t)
			if n == "" {
				continue
			}
			if _, dup := seen[n]; dup {
				continue
			}
			seen[n] = struct{}{}
			out = append(out, n)
		}
		filter.HashTypes = out
	}
	return filter
}

func buildHashConnection(hashes []models.Hash, args pagination.Args, total int) *model.HashConnection {
	hasMore := int64(len(hashes)) > args.Limit
	if hasMore {
		hashes = hashes[:args.Limit]
	}
	edges := make([]*model.HashEdge, len(hashes))
	for i := range hashes {
		cursor := pagination.EncodeCursor(hashes[i].CreateAt, hashes[i].Id)
		edges[i] = &model.HashEdge{
			Node:   &hashes[i],
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
	return &model.HashConnection{
		Edges:      edges,
		PageInfo:   &pageInfo,
		TotalCount: total,
	}
}

func normalizeHashProperties(in []*model.HashPropertyInput) ([]models.HashProperty, error) {
	if len(in) == 0 {
		return []models.HashProperty{}, nil
	}
	out := make([]models.HashProperty, 0, len(in))
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
		if len(name) > maxHashPropertyNameLen {
			return nil, fmt.Errorf("property name %q exceeds %d characters", name, maxHashPropertyNameLen)
		}
		if len(value) > maxHashPropertyValLen {
			return nil, fmt.Errorf("property %q value exceeds %d characters", name, maxHashPropertyValLen)
		}
		if _, dup := seen[name]; dup {
			return nil, fmt.Errorf("duplicate property name %q", name)
		}
		seen[name] = struct{}{}
		out = append(out, models.HashProperty{Name: name, Value: value})
	}
	if len(out) > maxHashProperties {
		return nil, fmt.Errorf("too many properties (max %d)", maxHashProperties)
	}
	return out, nil
}

func findHashComment(list []models.HashComment, id uuid.UUID) (models.HashComment, bool) {
	for _, c := range list {
		if c.CommentID == id {
			return c, true
		}
	}
	return models.HashComment{}, false
}

// defaultCredentialName builds the placeholder name used when MarkHashCracked
// auto-creates a credential. Includes the username if known so the credential
// list stays scannable; falls back to the hash type alone otherwise.
func defaultCredentialName(h models.Hash) string {
	user := strings.TrimSpace(h.Username)
	if user != "" {
		return fmt.Sprintf("%s (cracked from %s)", user, h.HashType)
	}
	return fmt.Sprintf("Cracked from %s", h.HashType)
}

func int64ValueOrZero(p *int) int64 {
	if p == nil {
		return 0
	}
	return int64(*p)
}

// parsedHash is the intermediate representation produced by the bulk parsers.
// Stored locally so each parser can return a uniform shape regardless of input
// format.
type parsedHash struct {
	value    string
	hashType string
	username string
	domain   string
}

// parseBulkHashes dispatches to the format-specific parser.
func parseBulkHashes(text string, format model.BulkHashFormat, defaultType string) ([]parsedHash, error) {
	switch format {
	case model.BulkHashFormatRaw:
		return parseRawHashes(text, defaultType), nil
	case model.BulkHashFormatSecretsdump:
		return parseSecretsdump(text), nil
	case model.BulkHashFormatPwdump:
		return parseSecretsdump(text), nil // pwdump and secretsdump share the field layout
	default:
		return nil, fmt.Errorf("unsupported bulk format: %s", format)
	}
}

// parseRawHashes splits on newlines, trims each line, drops blanks. Every
// surviving line becomes a hash of type `defaultType`.
func parseRawHashes(text, defaultType string) []parsedHash {
	out := make([]parsedHash, 0)
	for _, line := range strings.Split(text, "\n") {
		v := strings.TrimSpace(line)
		if v == "" {
			continue
		}
		out = append(out, parsedHash{value: v, hashType: defaultType})
	}
	return out
}

// parseSecretsdump parses the impacket secretsdump / pwdump format:
//
//	user:rid:lmhash:nthash:::
//
// Each line yields one NTLM row using the nthash field. The lmhash field is
// intentionally dropped — almost all modern AD environments disable LM, and
// the empty-LM marker (`aad3b435b51404eeaad3b435b51404ee`) would otherwise
// drown the operator in noise rows. Lines that don't fit the layout are
// silently skipped.
func parseSecretsdump(text string) []parsedHash {
	out := make([]parsedHash, 0)
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.Split(line, ":")
		if len(parts) < 4 {
			continue
		}
		user := strings.TrimSpace(parts[0])
		ntHash := strings.TrimSpace(parts[3])
		if ntHash == "" {
			continue
		}
		// Split DOMAIN\user if present.
		domain := ""
		if idx := strings.Index(user, `\`); idx >= 0 {
			domain = user[:idx]
			user = user[idx+1:]
		}
		out = append(out, parsedHash{
			value:    ntHash,
			hashType: "NTLM",
			username: user,
			domain:   domain,
		})
	}
	return out
}
