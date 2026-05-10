package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	v1bson "go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const wikiDocumentVisitCollection = "wiki_document_visits"

// IWikiDocumentVisitRepository is the per-user wiki history backing store.
// One row per (user_id, operation_id, document_id) triple — dedup is enforced
// by a unique compound index, not by application code. Revisits are an upsert
// that bumps visited_at; the resolver prunes older rows beyond a fixed cap so
// the list never grows unbounded.
type IWikiDocumentVisitRepository interface {
	// Upsert records or refreshes a visit. Atomic dedup-and-bump: an existing
	// (user, operation, document) row gets its visited_at refreshed; a missing
	// one is inserted. Returns the resulting row.
	Upsert(ctx context.Context, userID, operationID, documentID uuid.UUID, visitedAt time.Time) (models.WikiDocumentVisit, error)

	// PruneToLimit deletes rows beyond `limit` for the given user+operation,
	// keeping the `limit` most recent. No-op when the user is under the cap.
	PruneToLimit(ctx context.Context, userID, operationID uuid.UUID, limit int64) error

	// FindByUserOperationActive returns visits for the user in the operation,
	// most-recent-first, restricted to the supplied active document IDs (so
	// soft-deleted docs vanish from history). The slice is capped at `limit`
	// rows starting from `offset`.
	FindByUserOperationActive(ctx context.Context, userID, operationID uuid.UUID, activeDocIDs []uuid.UUID, offset, limit int64) ([]models.WikiDocumentVisit, error)

	// CountByUserOperationActive counts visit rows for the user in the
	// operation that point at one of the active doc IDs.
	CountByUserOperationActive(ctx context.Context, userID, operationID uuid.UUID, activeDocIDs []uuid.UUID) (int64, error)

	// DeleteByDocumentID removes every visit row pointing at a document.
	// Called from the permanent-delete path so freshly-purged docs do not
	// linger as ghost entries in any user's history.
	DeleteByDocumentID(ctx context.Context, documentID uuid.UUID) error

	// DeleteByDocumentIDs is the batch version of DeleteByDocumentID,
	// used by EmptyWikiDocumentTrash.
	DeleteByDocumentIDs(ctx context.Context, documentIDs []uuid.UUID) error

	// DeleteByOperationID removes every visit row in an operation. Called
	// when an operation is hard-deleted.
	DeleteByOperationID(ctx context.Context, operationID uuid.UUID) error
}

type wikiDocumentVisitRepository struct {
	coll database.Collection
}

// NewWikiDocumentVisitRepository creates the wiki visit history repository.
func NewWikiDocumentVisitRepository(db database.Database) IWikiDocumentVisitRepository {
	coll := db.Collection(wikiDocumentVisitCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		// Unique dedup invariant — at most one row per (user, operation, document).
		{
			Key:          []string{"user_id", "operation_id", "document_id"},
			IndexOptions: new(options.IndexOptions).SetUnique(true),
		},
		// Pagination + pruning by visited_at desc within a user's history.
		{Key: []string{"user_id", "operation_id", "-visited_at", "-_id"}},
		// Cascade delete on permanent doc removal.
		{Key: []string{"document_id"}},
	})

	return &wikiDocumentVisitRepository{coll: coll}
}

func (r *wikiDocumentVisitRepository) Upsert(ctx context.Context, userID, operationID, documentID uuid.UUID, visitedAt time.Time) (models.WikiDocumentVisit, error) {
	raw, err := r.coll.RawCollection()
	if err != nil {
		return models.WikiDocumentVisit{}, fmt.Errorf("raw collection: %w", err)
	}

	filter := v1bson.M{
		"user_id":      userID,
		"operation_id": operationID,
		"document_id":  documentID,
	}
	update := v1bson.M{
		"$set": v1bson.M{
			"visited_at": visitedAt,
			"updateAt":   visitedAt,
		},
		"$setOnInsert": v1bson.M{
			"_id":      primitive.NewObjectID(),
			"createAt": visitedAt,
		},
	}

	if _, err := raw.UpdateOne(ctx, filter, update, options.Update().SetUpsert(true)); err != nil {
		return models.WikiDocumentVisit{}, fmt.Errorf("upsert visit: %w", err)
	}

	var v models.WikiDocumentVisit
	if err := r.coll.FindOne(ctx, bson.M{
		"user_id":      userID,
		"operation_id": operationID,
		"document_id":  documentID,
	}).One(&v); err != nil {
		return models.WikiDocumentVisit{}, fmt.Errorf("read upserted visit: %w", err)
	}
	return v, nil
}

func (r *wikiDocumentVisitRepository) PruneToLimit(ctx context.Context, userID, operationID uuid.UUID, limit int64) error {
	if limit <= 0 {
		return nil
	}

	// Find the cutoff: the visited_at of the row at index `limit-1` (0-based).
	// Any row older than this — with a tie-break on _id — gets pruned. Using
	// the (user_id, operation_id, -visited_at, -_id) index, this is one
	// indexed read + one indexed delete.
	var cutoff models.WikiDocumentVisit
	err := r.coll.Find(ctx, bson.M{
		"user_id":      userID,
		"operation_id": operationID,
	}).Sort("-visited_at", "-_id").Skip(limit - 1).Limit(1).One(&cutoff)
	if err != nil {
		// No row at the cutoff position means the user is under the cap.
		// qmgo returns mongo.ErrNoDocuments-style errors here; we just no-op.
		return nil
	}

	// Delete everything strictly older than the cutoff row.
	// (visited_at < cutoff.visited_at) OR (visited_at == cutoff AND _id < cutoff._id).
	_, err = r.coll.RemoveAll(ctx, bson.M{
		"user_id":      userID,
		"operation_id": operationID,
		"$or": bson.A{
			bson.M{"visited_at": bson.M{"$lt": cutoff.VisitedAt}},
			bson.M{
				"visited_at": cutoff.VisitedAt,
				"_id":        bson.M{"$lt": cutoff.Id},
			},
		},
	})
	if err != nil {
		return fmt.Errorf("prune visits: %w", err)
	}
	return nil
}

func (r *wikiDocumentVisitRepository) FindByUserOperationActive(ctx context.Context, userID, operationID uuid.UUID, activeDocIDs []uuid.UUID, offset, limit int64) ([]models.WikiDocumentVisit, error) {
	if len(activeDocIDs) == 0 {
		return nil, nil
	}
	if limit <= 0 {
		return nil, nil
	}

	var visits []models.WikiDocumentVisit
	err := r.coll.Find(ctx, bson.M{
		"user_id":      userID,
		"operation_id": operationID,
		"document_id":  bson.M{"$in": activeDocIDs},
	}).Sort("-visited_at", "-_id").Skip(offset).Limit(limit).All(&visits)
	if err != nil {
		return nil, fmt.Errorf("list visits: %w", err)
	}
	return visits, nil
}

func (r *wikiDocumentVisitRepository) CountByUserOperationActive(ctx context.Context, userID, operationID uuid.UUID, activeDocIDs []uuid.UUID) (int64, error) {
	if len(activeDocIDs) == 0 {
		return 0, nil
	}
	return r.coll.Count(ctx, bson.M{
		"user_id":      userID,
		"operation_id": operationID,
		"document_id":  bson.M{"$in": activeDocIDs},
	})
}

func (r *wikiDocumentVisitRepository) DeleteByDocumentID(ctx context.Context, documentID uuid.UUID) error {
	_, err := r.coll.RemoveAll(ctx, bson.M{"document_id": documentID})
	return err
}

func (r *wikiDocumentVisitRepository) DeleteByDocumentIDs(ctx context.Context, documentIDs []uuid.UUID) error {
	if len(documentIDs) == 0 {
		return nil
	}
	_, err := r.coll.RemoveAll(ctx, bson.M{"document_id": bson.M{"$in": documentIDs}})
	return err
}

func (r *wikiDocumentVisitRepository) DeleteByOperationID(ctx context.Context, operationID uuid.UUID) error {
	_, err := r.coll.RemoveAll(ctx, bson.M{"operation_id": operationID})
	return err
}
