package repository

import (
	"context"
	"errors"
	"regexp"
	"time"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const hashCollection = "hashes"

// ErrHashDuplicate is returned by Create / BulkCreate when a hash with the
// same Value already exists in the operation. Callers convert this into the
// "skipped" count of a bulk import or surface it as a friendly error on the
// single-add path.
var ErrHashDuplicate = errors.New("hash already exists in this operation")

// HashFilter bundles optional list filters for hashes. Fields are independent
// (AND-combined at the Mongo level) and mirror CredentialFilter.
type HashFilter struct {
	// Search matches case-insensitively against value, username, source, and
	// property values. Property names are excluded — same reasoning as
	// CredentialFilter.Search.
	Search string
	// Statuses, if non-empty, restricts to hashes whose status is in the set.
	Statuses []models.HashStatus
	// HashTypes, if non-empty, restricts to hashes whose canonical type is in
	// the set. Matches the stored HashType field (already normalised).
	HashTypes []string
	// Tags, if non-empty, requires every listed tag to be present ($all).
	Tags []string
	// HasCredential: nil = both, true = linked credential only, false = unlinked only.
	HasCredential *bool
}

// IHashRepository defines the interface for Hash database operations.
type IHashRepository interface {
	Create(ctx context.Context, h *models.Hash) error
	// BulkCreate inserts many hashes in one round-trip. Returns the inserted
	// rows (with _id populated) and the count of rows skipped due to per-op
	// duplicate values. An empty input slice is a no-op (nil, 0, nil).
	// `inserted` carries the rows that actually landed (in input order), with
	// _id and DefaultField timestamps populated by qmgo on success. Duplicates
	// counted in `skipped` are dropped from the returned slice. A non-dup error
	// aborts the batch and returns whatever made it in before the failure.
	BulkCreate(ctx context.Context, hashes []*models.Hash) (inserted []*models.Hash, skipped int, err error)
	FindByID(ctx context.Context, id uuid.UUID) (models.Hash, error)
	FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter HashFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Hash, error)
	CountByOperationID(ctx context.Context, opID uuid.UUID, filter HashFilter) (int64, error)
	DistinctTagsByOperationID(ctx context.Context, opID uuid.UUID) ([]string, error)

	// Multi-operation variants — power the global Findings view. An empty
	// opIDs slice short-circuits to an empty result without hitting the DB.
	FindByOperationIDsWithCursor(ctx context.Context, opIDs []uuid.UUID, filter HashFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Hash, error)
	CountByOperationIDs(ctx context.Context, opIDs []uuid.UUID, filter HashFilter) (int64, error)
	DistinctTagsByOperationIDs(ctx context.Context, opIDs []uuid.UUID) ([]string, error)

	// FindByCredentialID returns every hash linked to the given credential.
	// Used by the Credential.sourceHashes field resolver — one credential may
	// have been cracked from several hashes (e.g. NTLM + NetNTLMv2 for the
	// same user). Bounded by per-operation indexing; not paginated because
	// the realistic upper bound is tiny.
	FindByCredentialID(ctx context.Context, opID uuid.UUID, credentialID uuid.UUID) ([]models.Hash, error)

	Update(ctx context.Context, h *models.Hash, updates map[string]interface{}) error
	Delete(ctx context.Context, h *models.Hash) error
	DeleteByOperationID(ctx context.Context, operationID uuid.UUID) error
	// ClearCredentialReference removes the credential link from every hash
	// pointing at the given credentialID inside the operation. Called when a
	// Credential is deleted so the source-hash chip stops pointing at a dead
	// row. Best-effort cleanup — a failure here leaves a stale pointer that
	// the Credential field resolver tolerates.
	ClearCredentialReference(ctx context.Context, opID uuid.UUID, credentialID uuid.UUID) error

	// Embedded comment operations — same shape as ICredentialRepository.
	AddComment(ctx context.Context, hashID uuid.UUID, comment models.HashComment) error
	UpdateComment(ctx context.Context, hashID, commentID uuid.UUID, text string, updatedAt time.Time) error
	RemoveComment(ctx context.Context, hashID, commentID uuid.UUID) error
}

type hashRepository struct {
	coll database.Collection
}

func NewHashRepository(db database.Database) IHashRepository {
	coll := db.Collection(hashCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"hash_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"operation_id"}},
		// Unique per-operation hash value — the dedupe guarantee for bulk import.
		{Key: []string{"operation_id", "value"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"operation_id", "status"}},
		{Key: []string{"operation_id", "hash_type"}},
		{Key: []string{"operation_id", "credential_id"}},
		{Key: []string{"operation_id", "tags"}},
		{Key: []string{"operation_id", "-createAt", "-_id"}}, // Supports cursor-based pagination
	})

	return &hashRepository{coll: coll}
}

func (r *hashRepository) Create(ctx context.Context, h *models.Hash) error {
	_, err := r.coll.InsertOne(ctx, h)
	if mongo.IsDuplicateKeyError(err) {
		return ErrHashDuplicate
	}
	return err
}

// BulkCreate inserts each hash one-by-one rather than via InsertMany. The
// per-row insert lets us count duplicates without aborting the whole batch
// (InsertMany stops on the first error under default ordered=true; switching
// to unordered would still return only one error wrapper for the whole batch
// and we'd have to parse the bulk write exception to get per-row results).
// Pet-scale: even a 5000-row paste finishes well inside a request timeout.
func (r *hashRepository) BulkCreate(ctx context.Context, hashes []*models.Hash) ([]*models.Hash, int, error) {
	if len(hashes) == 0 {
		return nil, 0, nil
	}
	inserted := make([]*models.Hash, 0, len(hashes))
	skipped := 0
	for _, h := range hashes {
		if err := r.Create(ctx, h); err != nil {
			if errors.Is(err, ErrHashDuplicate) {
				skipped++
				continue
			}
			return inserted, skipped, err
		}
		// qmgo's InsertOne populates _id and DefaultField timestamps on the
		// passed struct, so `h` is now the full row — no re-fetch needed.
		inserted = append(inserted, h)
	}
	return inserted, skipped, nil
}

func (r *hashRepository) FindByID(ctx context.Context, id uuid.UUID) (models.Hash, error) {
	var h models.Hash
	err := r.coll.FindOne(ctx, bson.M{"hash_id": id}).One(&h)
	return h, err
}

func (r *hashRepository) FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter HashFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Hash, error) {
	q := buildHashFilter(opID, filter)

	if cursorFilter := pagination.BuildCursorFilter(cursor, forward); len(cursorFilter) > 0 {
		for k, v := range cursorFilter {
			q[k] = v
		}
	}

	var hashes []models.Hash
	err := r.coll.Find(ctx, q).
		Sort(pagination.SortFields(forward)...).
		Limit(limit).
		All(&hashes)

	if !forward && len(hashes) > 0 {
		for i, j := 0, len(hashes)-1; i < j; i, j = i+1, j-1 {
			hashes[i], hashes[j] = hashes[j], hashes[i]
		}
	}

	return hashes, err
}

func (r *hashRepository) CountByOperationID(ctx context.Context, opID uuid.UUID, filter HashFilter) (int64, error) {
	return r.coll.Count(ctx, buildHashFilter(opID, filter))
}

func (r *hashRepository) DistinctTagsByOperationID(ctx context.Context, opID uuid.UUID) ([]string, error) {
	var tags []string
	err := r.coll.Find(ctx, bson.M{"operation_id": opID}).Distinct("tags", &tags)
	if err != nil {
		return nil, err
	}
	return tags, nil
}

func (r *hashRepository) FindByOperationIDsWithCursor(ctx context.Context, opIDs []uuid.UUID, filter HashFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Hash, error) {
	if len(opIDs) == 0 {
		return []models.Hash{}, nil
	}

	q := buildHashFilterMulti(opIDs, filter)

	if cursorFilter := pagination.BuildCursorFilter(cursor, forward); len(cursorFilter) > 0 {
		for k, v := range cursorFilter {
			q[k] = v
		}
	}

	var hashes []models.Hash
	err := r.coll.Find(ctx, q).
		Sort(pagination.SortFields(forward)...).
		Limit(limit).
		All(&hashes)

	if !forward && len(hashes) > 0 {
		for i, j := 0, len(hashes)-1; i < j; i, j = i+1, j-1 {
			hashes[i], hashes[j] = hashes[j], hashes[i]
		}
	}

	return hashes, err
}

func (r *hashRepository) CountByOperationIDs(ctx context.Context, opIDs []uuid.UUID, filter HashFilter) (int64, error) {
	if len(opIDs) == 0 {
		return 0, nil
	}
	return r.coll.Count(ctx, buildHashFilterMulti(opIDs, filter))
}

func (r *hashRepository) DistinctTagsByOperationIDs(ctx context.Context, opIDs []uuid.UUID) ([]string, error) {
	if len(opIDs) == 0 {
		return []string{}, nil
	}
	var tags []string
	err := r.coll.Find(ctx, bson.M{"operation_id": bson.M{"$in": opIDs}}).Distinct("tags", &tags)
	if err != nil {
		return nil, err
	}
	return tags, nil
}

func (r *hashRepository) FindByCredentialID(ctx context.Context, opID uuid.UUID, credentialID uuid.UUID) ([]models.Hash, error) {
	var hashes []models.Hash
	err := r.coll.Find(ctx, bson.M{
		"operation_id":  opID,
		"credential_id": credentialID,
	}).Sort("-createAt", "-_id").All(&hashes)
	if err != nil {
		return nil, err
	}
	return hashes, nil
}

func (r *hashRepository) Update(ctx context.Context, h *models.Hash, updates map[string]interface{}) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"hash_id": h.HashID, "operation_id": h.OperationID},
		bson.M{"$set": updates},
	)
}

func (r *hashRepository) Delete(ctx context.Context, h *models.Hash) error {
	return r.coll.Remove(ctx,
		bson.M{"hash_id": h.HashID, "operation_id": h.OperationID},
	)
}

func (r *hashRepository) DeleteByOperationID(ctx context.Context, operationID uuid.UUID) error {
	_, err := r.coll.RemoveAll(ctx, bson.M{"operation_id": operationID})
	return err
}

func (r *hashRepository) ClearCredentialReference(ctx context.Context, opID uuid.UUID, credentialID uuid.UUID) error {
	_, err := r.coll.UpdateAll(ctx,
		bson.M{"operation_id": opID, "credential_id": credentialID},
		bson.M{"$unset": bson.M{"credential_id": "", "cracking_meta": ""}},
	)
	return err
}

func (r *hashRepository) AddComment(ctx context.Context, hashID uuid.UUID, comment models.HashComment) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"hash_id": hashID},
		bson.M{"$push": bson.M{"comments": comment}},
	)
}

func (r *hashRepository) UpdateComment(ctx context.Context, hashID, commentID uuid.UUID, text string, updatedAt time.Time) error {
	return r.coll.UpdateOne(ctx,
		bson.M{
			"hash_id":             hashID,
			"comments.comment_id": commentID,
		},
		bson.M{"$set": bson.M{
			"comments.$.text":       text,
			"comments.$.updated_at": updatedAt,
		}},
	)
}

func (r *hashRepository) RemoveComment(ctx context.Context, hashID, commentID uuid.UUID) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"hash_id": hashID},
		bson.M{"$pull": bson.M{"comments": bson.M{"comment_id": commentID}}},
	)
}

func buildHashFilter(opID uuid.UUID, f HashFilter) bson.M {
	return applyHashFilter(bson.M{"operation_id": opID}, f)
}

func buildHashFilterMulti(opIDs []uuid.UUID, f HashFilter) bson.M {
	return applyHashFilter(bson.M{"operation_id": bson.M{"$in": opIDs}}, f)
}

func applyHashFilter(q bson.M, f HashFilter) bson.M {
	if len(f.Statuses) > 0 {
		q["status"] = bson.M{"$in": f.Statuses}
	}
	if len(f.HashTypes) > 0 {
		q["hash_type"] = bson.M{"$in": f.HashTypes}
	}
	if len(f.Tags) > 0 {
		q["tags"] = bson.M{"$all": f.Tags}
	}
	if f.HasCredential != nil {
		if *f.HasCredential {
			q["credential_id"] = bson.M{"$ne": nil}
		} else {
			// Two encodings of "not linked" can land in Mongo: the field is
			// absent (omitempty stripped it on insert), or it was $unset by
			// ClearCredentialReference. Both must match.
			q["credential_id"] = nil
		}
	}
	if f.Search != "" {
		escaped := regexp.QuoteMeta(f.Search)
		rx := bson.M{"$regex": escaped, "$options": "i"}
		q["$or"] = bson.A{
			bson.M{"value": rx},
			bson.M{"username": rx},
			bson.M{"source": rx},
			bson.M{"properties.value": rx},
		}
	}
	return q
}
