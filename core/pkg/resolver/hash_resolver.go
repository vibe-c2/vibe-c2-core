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

// Caps and limits intentionally mirror the credential resolver.
const (
	myHashesOpCap = 100
	// bulkImportCap bounds a single bulkImportHashes call. Above this the
	// request becomes a latency hazard (each row triggers an index lookup for
	// dedupe). Operators with bigger pastes split them by hand.
	bulkImportCap = 5000
)

// IHashResolver defines the business logic methods for the Hash entity.
type IHashResolver interface {
	// Mutations
	CreateHash(ctx context.Context, operationID string, input model.CreateHashInput) (*models.Hash, error)
	UpdateHash(ctx context.Context, id string, input model.UpdateHashInput) (*models.Hash, error)
	DeleteHash(ctx context.Context, id string) (bool, error)
	BulkImportHashes(ctx context.Context, operationID string, input model.BulkImportHashesInput) (*model.BulkImportHashesResult, error)
	MarkHashCracked(ctx context.Context, id string, input model.MarkHashCrackedInput) (*models.Hash, error)

	// Queries
	Hash(ctx context.Context, id string) (*models.Hash, error)
	Hashes(ctx context.Context, operationID string, search *string, statuses []models.HashStatus, tags []string, hasCredential *bool, first *int, after *string, last *int, before *string) (*model.HashConnection, error)
	HashTags(ctx context.Context, operationID string) ([]string, error)
	MyHashes(ctx context.Context, operationIDs []string, search *string, statuses []models.HashStatus, tags []string, hasCredential *bool, first *int, after *string, last *int, before *string) (*model.HashConnection, error)
	MyHashTags(ctx context.Context, operationIDs []string) ([]string, error)

	// Field resolvers for Hash
	ID(ctx context.Context, obj *models.Hash) (string, error)
	OperationIDField(ctx context.Context, obj *models.Hash) (string, error)
	Operation(ctx context.Context, obj *models.Hash) (*models.Operation, error)
	CredentialID(ctx context.Context, obj *models.Hash) (*string, error)
	Credential(ctx context.Context, obj *models.Hash) (*models.Credential, error)
	CreatedBy(ctx context.Context, obj *models.Hash) (*models.User, error)
	CreatedAt(ctx context.Context, obj *models.Hash) (string, error)
	UpdatedAt(ctx context.Context, obj *models.Hash) (string, error)
	// Backlinks / BacklinkCount: wiki documents that cite this hash inline via
	// the /hash chip. Delegated to the wiki resolver where the inverse index
	// lives. Mirrors Credential.backlinks.
	BacklinkCount(ctx context.Context, obj *models.Hash) (int, error)
	Backlinks(ctx context.Context, obj *models.Hash) ([]*models.WikiDocument, error)

	// Cross-domain: backlinks from a credential to the hashes that produced it.
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
	// publishing.
	credResolver ICredentialResolver
	// wikiDocRes owns the wiki side of the hash backlinks join. Hash.backlinks /
	// Hash.backlinkCount delegate to it, and DeleteHash uses it to strip the
	// dead hash id from the inverse index. Mirrors credentialResolver.wikiDocRes.
	// Optional: nil is acceptable for tests that don't exercise backlinks.
	wikiDocRes IWikiDocumentResolver
	eventBus   eventbus.IEventBus
}

// NewHashResolver wires dependencies. credResolver is required for the
// "create credential inline" branch of MarkHashCracked. wikiDocRes powers the
// hash backlinks field resolvers and may be nil in tests.
func NewHashResolver(
	hashRepo repository.IHashRepository,
	credRepo repository.ICredentialRepository,
	operationRepo repository.IOperationRepository,
	userRepo repository.IUserRepository,
	credResolver ICredentialResolver,
	wikiDocRes IWikiDocumentResolver,
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
		wikiDocRes:    wikiDocRes,
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

// resolveCredentialLink parses an incoming credentialId pointer and returns:
//   - (nil, false, nil) when the field was omitted (no change)
//   - (nil, true, nil)  when the field was an empty string (clear the link)
//   - (&uid, true, nil) when a UUID was supplied (set or replace)
// The same-operation check is enforced on the set path.
func (r *hashResolver) resolveCredentialLink(ctx context.Context, raw *string, operationID uuid.UUID) (*uuid.UUID, bool, error) {
	if raw == nil {
		return nil, false, nil
	}
	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return nil, true, nil
	}
	credUID, err := uuid.Parse(trimmed)
	if err != nil {
		return nil, false, fmt.Errorf("invalid credentialId: %w", err)
	}
	existing, err := r.credRepo.FindByID(ctx, credUID)
	if err != nil {
		return nil, false, fmt.Errorf("credential not found: %w", err)
	}
	if existing.OperationID != operationID {
		return nil, false, fmt.Errorf("credential belongs to a different operation")
	}
	return &credUID, true, nil
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

	credUID, _, err := r.resolveCredentialLink(ctx, input.CredentialID, opUID)
	if err != nil {
		return nil, err
	}

	h := &models.Hash{
		HashID:       uuid.New(),
		OperationID:  opUID,
		Value:        value,
		Status:       status,
		Comment:      strings.TrimSpace(strDeref(input.Comment)),
		Tags:         normalizeTags(input.Tags),
		CredentialID: credUID,
		CreatedByID:  callerUID,
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
	if input.Status != nil {
		if !input.Status.IsValid() {
			return nil, fmt.Errorf("invalid status: %s", *input.Status)
		}
		// CRACKED transitions are gated to markHashCracked so the credential
		// link is always set together with the status.
		if *input.Status == models.HashStatusCracked && h.Status != models.HashStatusCracked {
			return nil, fmt.Errorf("transition to CRACKED must go through markHashCracked")
		}
		updates["status"] = *input.Status
	}
	if input.Comment != nil {
		updates["comment"] = strings.TrimSpace(*input.Comment)
	}
	if input.Tags != nil {
		updates["tags"] = normalizeTags(input.Tags)
	}
	credUID, credChanged, err := r.resolveCredentialLink(ctx, input.CredentialID, h.OperationID)
	if err != nil {
		return nil, err
	}
	if credChanged {
		if credUID == nil {
			updates["credential_id"] = nil
		} else {
			updates["credential_id"] = *credUID
		}
	}
	// Leaving CRACKED drops the credential link automatically. The credential
	// itself is preserved — only the link stops making sense once the hash is
	// no longer cracked. Applied last so it overrides any explicit credentialId
	// the same input might have set.
	if input.Status != nil &&
		h.Status == models.HashStatusCracked &&
		*input.Status != models.HashStatusCracked {
		updates["credential_id"] = nil
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

	// Strip this hash id from hash_references on every wiki doc in the
	// operation so the inverse index doesn't carry dangling UUIDs. Best-effort,
	// same rationale as the credential delete path — the chip render handles
	// "hash not found" gracefully.
	if r.wikiDocRes != nil {
		if err := r.wikiDocRes.CleanupHashReferences(ctx, h.OperationID, h.HashID); err != nil {
			logger.From(ctx).Warn("cleanup of hash backlinks failed",
				zap.String("hash_id", h.HashID.String()),
				zap.Error(err),
			)
		}
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

// BulkImportHashes parses `input.Text` as one hash value per line, dedupes
// against existing hashes, and inserts the survivors. Emits one summary event
// per call regardless of batch size.
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

	values := parseRawHashLines(input.Text)
	if len(values) == 0 {
		return &model.BulkImportHashesResult{
			Added:   0,
			Skipped: 0,
			Hashes:  []*models.Hash{},
		}, nil
	}
	if len(values) > bulkImportCap {
		return nil, fmt.Errorf("bulk import exceeds cap of %d rows (got %d)", bulkImportCap, len(values))
	}

	tags := normalizeTags(input.Tags)
	comment := strings.TrimSpace(strDeref(input.Comment))

	// Dedupe within the same paste — two identical hashes in one batch would
	// blow the unique index on the second insert; one survives.
	seen := make(map[string]struct{}, len(values))
	rows := make([]*models.Hash, 0, len(values))
	intraBatchSkipped := 0
	for _, v := range values {
		if _, dup := seen[v]; dup {
			intraBatchSkipped++
			continue
		}
		seen[v] = struct{}{}
		rows = append(rows, &models.Hash{
			HashID:      uuid.New(),
			OperationID: opUID,
			Value:       v,
			Status:      models.HashStatusNotProcessed,
			Comment:     comment,
			Tags:        tags,
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
// (create inline).
//
// Ordering: credential first, then hash. If the hash update fails after a new
// credential was created, the credential remains as an orphan — easier to
// recover than the inverse risk of double-crediting a hash that was already
// linked.
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
	} else {
		// Create inline. Default type to PASSWORD if omitted.
		newInput := *input.NewCredential
		if !newInput.Type.IsValid() {
			newInput.Type = models.CredentialTypePassword
		}
		if strings.TrimSpace(newInput.Name) == "" {
			newInput.Name = "Cracked credential"
		}
		cred, err := r.credResolver.CreateCredential(ctx, h.OperationID.String(), newInput)
		if err != nil {
			return nil, fmt.Errorf("failed to create credential: %w", err)
		}
		credUID = cred.CredentialID
	}

	updates := map[string]interface{}{
		"status":        models.HashStatusCracked,
		"credential_id": credUID,
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

func (r *hashResolver) Hashes(ctx context.Context, operationID string, search *string, statuses []models.HashStatus, tags []string, hasCredential *bool, first *int, after *string, last *int, before *string) (*model.HashConnection, error) {
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
	filter := buildHashListFilter(search, statuses, tags, hasCredential)

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

func (r *hashResolver) MyHashes(ctx context.Context, operationIDs []string, search *string, statuses []models.HashStatus, tags []string, hasCredential *bool, first *int, after *string, last *int, before *string) (*model.HashConnection, error) {
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
	filter := buildHashListFilter(search, statuses, tags, hasCredential)

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

// resolveAccessibleOperationIDs is the hash-resolver twin of the credential
// resolver's same-named helper.
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

// BacklinkCount resolves the cheap count form of Hash.backlinks. Delegates to
// the wiki resolver so the query lives in the package that owns the inverse
// index. Mirrors credentialResolver.BacklinkCount.
func (r *hashResolver) BacklinkCount(ctx context.Context, obj *models.Hash) (int, error) {
	if r.wikiDocRes == nil || obj == nil {
		return 0, nil
	}
	return r.wikiDocRes.HashBacklinkCount(ctx, obj)
}

// Backlinks resolves the full Hash.backlinks list, loaded on demand by the
// hash details dialog. Delegates to the wiki resolver.
func (r *hashResolver) Backlinks(ctx context.Context, obj *models.Hash) ([]*models.WikiDocument, error) {
	if r.wikiDocRes == nil || obj == nil {
		return []*models.WikiDocument{}, nil
	}
	return r.wikiDocRes.HashBacklinks(ctx, obj)
}

func (r *hashResolver) UpdatedAt(_ context.Context, obj *models.Hash) (string, error) {
	return obj.UpdateAt.Format(time.RFC3339), nil
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

func buildHashListFilter(search *string, statuses []models.HashStatus, tags []string, hasCredential *bool) repository.HashFilter {
	filter := repository.HashFilter{
		Statuses:      statuses,
		Tags:          normalizeTags(tags),
		HasCredential: hasCredential,
	}
	if search != nil {
		filter.Search = strings.TrimSpace(*search)
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

// parseRawHashLines splits on newlines, trims each line, drops blanks.
func parseRawHashLines(text string) []string {
	out := make([]string, 0)
	for _, line := range strings.Split(text, "\n") {
		v := strings.TrimSpace(line)
		if v == "" {
			continue
		}
		out = append(out, v)
	}
	return out
}
