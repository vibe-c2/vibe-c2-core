package repository

import (
	"context"
	"regexp"
	"time"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const wikiDocumentCollection = "wiki_documents"

// WikiDocumentFilter controls which documents are returned by list queries.
type WikiDocumentFilter struct {
	ParentDocumentID *uuid.UUID // set = children of that doc
	RootsOnly        bool       // true = only root documents (parentDocumentID is nil)
	Search           string
	Trashed          bool // true = only soft-deleted docs, false = only active docs
}

// IWikiDocumentRepository defines the interface for WikiDocument database operations.
type IWikiDocumentRepository interface {
	Create(ctx context.Context, doc *models.WikiDocument) error
	FindByID(ctx context.Context, id uuid.UUID) (models.WikiDocument, error)
	FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter WikiDocumentFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.WikiDocument, error)
	// FindTrashedByOperationIDWithCursor lists soft-deleted documents ordered by
	// deleted_at (most recently deleted first). Cursor encodes deleted_at +
	// _id so concurrent restores/permanent-deletes don't perturb pagination.
	FindTrashedByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, cursor *pagination.Cursor, limit int64, forward bool) ([]models.WikiDocument, error)
	CountByOperationID(ctx context.Context, opID uuid.UUID, filter WikiDocumentFilter) (int64, error)
	FindChildDocuments(ctx context.Context, parentID uuid.UUID) ([]models.WikiDocument, error)
	FindAllByOperationID(ctx context.Context, opID uuid.UUID) ([]models.WikiDocument, error)
	CountChildDocuments(ctx context.Context, parentID uuid.UUID) (int64, error)
	// FindChildDocumentsWithCounts returns active children of `parentID` (or
	// root documents in opID when parentID is nil), sorted by sort_order with
	// -createAt as tiebreaker (so newer docs surface above older ones when
	// sortOrder is unset), alongside a map of grandchild counts keyed by each
	// returned document's id. The grandchild counts are computed in one
	// aggregation, so the entire call is two Mongo round trips regardless of
	// the result size. Used by the lazy tree path to render expand carets
	// without an N+1 Count storm.
	FindChildDocumentsWithCounts(ctx context.Context, opID uuid.UUID, parentID *uuid.UUID) ([]models.WikiDocument, map[uuid.UUID]int, error)
	// FindDocumentsForRevealPath returns every active document needed to
	// render the sidebar tree expanded down to a target document: root
	// documents in opID plus the direct children of each id in `parentIDs`
	// (typically the target's ancestor chain). One Find + one count
	// aggregation. Counts cover every returned row.
	FindDocumentsForRevealPath(ctx context.Context, opID uuid.UUID, parentIDs []uuid.UUID) ([]models.WikiDocument, map[uuid.UUID]int, error)
	FindDescendants(ctx context.Context, docID uuid.UUID) ([]models.WikiDocument, error)
	// FindTrashedDescendants returns soft-deleted descendants of docID. Walks
	// downward through parent_document_id, only following children whose
	// deleted_at is set. Used for cascade-restore prompts.
	FindTrashedDescendants(ctx context.Context, docID uuid.UUID) ([]models.WikiDocument, error)
	FindAncestors(ctx context.Context, id uuid.UUID) ([]models.WikiDocument, error)
	NestingDepth(ctx context.Context, parentID uuid.UUID) (int, error)
	SoftDelete(ctx context.Context, doc *models.WikiDocument, deletedByID uuid.UUID) error
	SoftDeleteBatch(ctx context.Context, docIDs []uuid.UUID, deletedByID uuid.UUID) error
	Restore(ctx context.Context, doc *models.WikiDocument) error
	// RestoreBatch clears deleted_at/deleted_by_id on the given doc IDs and
	// stamps last_updated to the restorer in one round-trip. No-op for an
	// empty slice.
	RestoreBatch(ctx context.Context, docIDs []uuid.UUID, restorerID uuid.UUID) error
	Update(ctx context.Context, doc *models.WikiDocument, updates map[string]interface{}) error
	HardDelete(ctx context.Context, doc *models.WikiDocument) error
	HardDeleteByOperationID(ctx context.Context, opID uuid.UUID) error
	HardDeleteTrashed(ctx context.Context, opID uuid.UUID) error
	FindChangedSinceLastBackup(ctx context.Context, batchSize int64) ([]models.WikiDocument, error)
	RestoreFromBackup(ctx context.Context, docID uuid.UUID, content string, contentState []byte) error
	SearchByOperationID(ctx context.Context, opID uuid.UUID, scopeParentID *uuid.UUID, query string, offset, limit int64) (hits []WikiDocumentSearchHit, total int64, err error)
	// FindReferrers returns active documents in opID whose References array
	// contains documentID. Self-references are excluded. Trashed referrers are
	// excluded. Ordered by most recently updated; capped at limit (caller
	// supplies a sane cap, e.g. 200).
	FindReferrers(ctx context.Context, opID, documentID uuid.UUID, limit int64) ([]models.WikiDocument, error)
}

type wikiDocumentRepository struct {
	coll database.Collection
}

func NewWikiDocumentRepository(db database.Database) IWikiDocumentRepository {
	coll := db.Collection(wikiDocumentCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"document_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"operation_id", "deleted_at"}},
		{Key: []string{"operation_id", "parent_document_id", "deleted_at"}},
		{Key: []string{"-createAt", "-_id"}},
		{Key: []string{"last_backup_at", "updateAt"}},
		// Anchored prefix search on title ("find doc by name" palette UX).
		// $text can't do prefix; regex on a pre-lowercased field uses the
		// index as long as the pattern is anchored and does NOT use $options:"i".
		{Key: []string{"operation_id", "title_lower"}},
		{Key: []string{"operation_id", "parent_document_id", "title_lower"}},
		// Backlinks: "documents in this operation that reference doc X".
		// Multikey index on the References array; deleted_at trails so the
		// resolver can both match and filter trashed referrers in one scan.
		{Key: []string{"operation_id", "references", "deleted_at"}},
	})

	setupWikiSearchIndexes(coll)

	return &wikiDocumentRepository{coll: coll}
}

func (r *wikiDocumentRepository) Create(ctx context.Context, doc *models.WikiDocument) error {
	_, err := r.coll.InsertOne(ctx, doc)
	return err
}

func (r *wikiDocumentRepository) FindByID(ctx context.Context, id uuid.UUID) (models.WikiDocument, error) {
	var doc models.WikiDocument
	err := r.coll.FindOne(ctx, bson.M{"document_id": id}).One(&doc)
	return doc, err
}

func (r *wikiDocumentRepository) FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter WikiDocumentFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.WikiDocument, error) {
	mongoFilter := buildWikiDocumentFilter(opID, filter)

	if cursorFilter := pagination.BuildCursorFilter(cursor, forward); len(cursorFilter) > 0 {
		for k, v := range cursorFilter {
			mongoFilter[k] = v
		}
	}

	var docs []models.WikiDocument
	err := r.coll.Find(ctx, mongoFilter).
		Sort(pagination.SortFields(forward)...).
		Limit(limit).
		All(&docs)

	if !forward && len(docs) > 0 {
		for i, j := 0, len(docs)-1; i < j; i, j = i+1, j-1 {
			docs[i], docs[j] = docs[j], docs[i]
		}
	}

	return docs, err
}

// FindTrashedByOperationIDWithCursor sorts trash entries by:
//
//	1. deleted_at DESC — most recently trashed item first. Within a single
//	   cascade delete, the root is trashed after its descendants (see
//	   DeleteWikiDocument), so the user-facing root sits above its subtree.
//	2. _id ASC — tie-breaker within a cascade batch. All descendants share a
//	   single deleted_at from SoftDeleteBatch; _id roughly reflects creation
//	   order, so direct children (created first) appear above grandchildren.
//
// Mixed sort direction means the cursor filter is hand-built rather than
// reusing pagination.BuildCursorFilterOn, which assumes both fields go the
// same way.
func (r *wikiDocumentRepository) FindTrashedByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, cursor *pagination.Cursor, limit int64, forward bool) ([]models.WikiDocument, error) {
	mongoFilter := bson.M{
		"operation_id": opID,
		"deleted_at":   bson.M{"$ne": nil},
	}

	if cursor != nil {
		// Forward = descending deleted_at + ascending _id.
		// (older deleted_at) OR (same deleted_at AND larger _id)
		timeOp, idOp := "$lt", "$gt"
		if !forward {
			timeOp, idOp = "$gt", "$lt"
		}
		mongoFilter["$or"] = bson.A{
			bson.M{"deleted_at": bson.M{timeOp: cursor.CreateAt}},
			bson.M{
				"deleted_at": cursor.CreateAt,
				"_id":        bson.M{idOp: cursor.ID},
			},
		}
	}

	sort := []string{"-deleted_at", "_id"}
	if !forward {
		sort = []string{"deleted_at", "-_id"}
	}

	var docs []models.WikiDocument
	err := r.coll.Find(ctx, mongoFilter).
		Sort(sort...).
		Limit(limit).
		All(&docs)

	if !forward && len(docs) > 0 {
		for i, j := 0, len(docs)-1; i < j; i, j = i+1, j-1 {
			docs[i], docs[j] = docs[j], docs[i]
		}
	}

	return docs, err
}

func (r *wikiDocumentRepository) CountByOperationID(ctx context.Context, opID uuid.UUID, filter WikiDocumentFilter) (int64, error) {
	return r.coll.Count(ctx, buildWikiDocumentFilter(opID, filter))
}

func (r *wikiDocumentRepository) FindChildDocuments(ctx context.Context, parentID uuid.UUID) ([]models.WikiDocument, error) {
	var docs []models.WikiDocument
	err := r.coll.Find(ctx, bson.M{
		"parent_document_id": parentID,
		"deleted_at":         nil,
	}).Sort("sort_order", "-createAt").All(&docs)
	return docs, err
}

func (r *wikiDocumentRepository) FindAllByOperationID(ctx context.Context, opID uuid.UUID) ([]models.WikiDocument, error) {
	var docs []models.WikiDocument
	err := r.coll.Find(ctx, bson.M{
		"operation_id": opID,
		"deleted_at":   nil,
	}).Sort("sort_order", "-createAt").All(&docs)
	return docs, err
}

func (r *wikiDocumentRepository) CountChildDocuments(ctx context.Context, parentID uuid.UUID) (int64, error) {
	return r.coll.Count(ctx, bson.M{
		"parent_document_id": parentID,
		"deleted_at":         nil,
	})
}

func (r *wikiDocumentRepository) FindChildDocumentsWithCounts(ctx context.Context, opID uuid.UUID, parentID *uuid.UUID) ([]models.WikiDocument, map[uuid.UUID]int, error) {
	filter := bson.M{"operation_id": opID, "deleted_at": nil}
	if parentID != nil {
		filter["parent_document_id"] = *parentID
	} else {
		filter["parent_document_id"] = nil
	}

	var docs []models.WikiDocument
	if err := r.coll.Find(ctx, filter).Sort("sort_order", "-createAt").All(&docs); err != nil {
		return nil, nil, err
	}
	if len(docs) == 0 {
		return docs, map[uuid.UUID]int{}, nil
	}

	ids := make([]uuid.UUID, len(docs))
	for i, d := range docs {
		ids[i] = d.DocumentID
	}
	counts, err := r.aggregateChildCounts(ctx, ids)
	if err != nil {
		return nil, nil, err
	}
	return docs, counts, nil
}

func (r *wikiDocumentRepository) FindDocumentsForRevealPath(ctx context.Context, opID uuid.UUID, parentIDs []uuid.UUID) ([]models.WikiDocument, map[uuid.UUID]int, error) {
	// Roots are always part of the reveal: even for a deeply-nested target,
	// the sidebar starts at top-level documents. When `parentIDs` is empty
	// (target is itself a root) the result is just the roots.
	filter := bson.M{"operation_id": opID, "deleted_at": nil}
	if len(parentIDs) > 0 {
		filter["$or"] = bson.A{
			bson.M{"parent_document_id": nil},
			bson.M{"parent_document_id": bson.M{"$in": parentIDs}},
		}
	} else {
		filter["parent_document_id"] = nil
	}

	var docs []models.WikiDocument
	if err := r.coll.Find(ctx, filter).Sort("sort_order", "-createAt").All(&docs); err != nil {
		return nil, nil, err
	}
	if len(docs) == 0 {
		return docs, map[uuid.UUID]int{}, nil
	}

	ids := make([]uuid.UUID, len(docs))
	for i, d := range docs {
		ids[i] = d.DocumentID
	}
	counts, err := r.aggregateChildCounts(ctx, ids)
	if err != nil {
		return nil, nil, err
	}
	return docs, counts, nil
}

// aggregateChildCounts groups active documents by parent_document_id where the
// parent is in `parentIDs`, returning a map of parent → direct child count.
// Parents with zero children are absent from the map. Used by tree-shaped
// queries to populate the per-row childCount field without an N+1 storm.
func (r *wikiDocumentRepository) aggregateChildCounts(ctx context.Context, parentIDs []uuid.UUID) (map[uuid.UUID]int, error) {
	if len(parentIDs) == 0 {
		return map[uuid.UUID]int{}, nil
	}
	pipeline := bson.A{
		bson.M{"$match": bson.M{
			"parent_document_id": bson.M{"$in": parentIDs},
			"deleted_at":         nil,
		}},
		bson.M{"$group": bson.M{
			"_id":   "$parent_document_id",
			"count": bson.M{"$sum": 1},
		}},
	}
	var rows []struct {
		ID    uuid.UUID `bson:"_id"`
		Count int       `bson:"count"`
	}
	if err := r.coll.Aggregate(ctx, pipeline).All(&rows); err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]int, len(rows))
	for _, row := range rows {
		out[row.ID] = row.Count
	}
	return out, nil
}

// FindDescendants returns all descendants of a document (children, grandchildren, etc.)
// for cascading soft-delete. Uses iterative breadth-first traversal.
func (r *wikiDocumentRepository) FindDescendants(ctx context.Context, docID uuid.UUID) ([]models.WikiDocument, error) {
	return r.findDescendantsBFS(ctx, docID, false)
}

// FindTrashedDescendants is the trash-only counterpart of FindDescendants:
// it walks the parent chain downward but only follows children whose
// deleted_at is set. Cycle-safe via a visited set.
func (r *wikiDocumentRepository) FindTrashedDescendants(ctx context.Context, docID uuid.UUID) ([]models.WikiDocument, error) {
	return r.findDescendantsBFS(ctx, docID, true)
}

// findDescendantsBFS is the shared BFS walker. trashed=false matches active
// children (deleted_at == nil); trashed=true matches soft-deleted children
// (deleted_at != nil). The starting docID itself is never included.
func (r *wikiDocumentRepository) findDescendantsBFS(ctx context.Context, docID uuid.UUID, trashed bool) ([]models.WikiDocument, error) {
	var allDescendants []models.WikiDocument
	queue := []uuid.UUID{docID}
	visited := map[uuid.UUID]struct{}{docID: {}}

	var deletedAtFilter interface{} // matches `deleted_at: null` for the active path
	if trashed {
		deletedAtFilter = bson.M{"$ne": nil}
	}

	for len(queue) > 0 {
		parentID := queue[0]
		queue = queue[1:]

		var children []models.WikiDocument
		err := r.coll.Find(ctx, bson.M{
			"parent_document_id": parentID,
			"deleted_at":         deletedAtFilter,
		}).All(&children)
		if err != nil {
			return nil, err
		}

		for _, child := range children {
			if _, seen := visited[child.DocumentID]; seen {
				continue // defensive cycle guard
			}
			visited[child.DocumentID] = struct{}{}
			allDescendants = append(allDescendants, child)
			queue = append(queue, child.DocumentID)
		}
	}

	return allDescendants, nil
}

// maxAncestorDepth caps the walk defensively. Real chains are shallow; this
// only exists so corrupt data (cycles, unexpectedly deep trees) can't spin
// the process.
const maxAncestorDepth = 100

// FindAncestors walks parent_document_id upward from the given document and
// returns the chain root→leaf, excluding the document itself. Reads through
// soft-deleted ancestors (FindByID does not filter on deleted_at) so the
// caller can still render trashed parents. Stops — without error — when an
// ancestor is missing, when a cycle is detected, or when maxAncestorDepth
// is reached.
func (r *wikiDocumentRepository) FindAncestors(ctx context.Context, id uuid.UUID) ([]models.WikiDocument, error) {
	return walkAncestorChain(id, func(id uuid.UUID) (models.WikiDocument, bool) {
		doc, err := r.FindByID(ctx, id)
		if err != nil {
			return models.WikiDocument{}, false
		}
		return doc, true
	}), nil
}

// walkAncestorChain is the pure core of FindAncestors — separated from Mongo
// so the walk semantics (cycle guard, depth cap, ordering) can be unit-tested
// against an in-memory lookup.
func walkAncestorChain(startID uuid.UUID, lookup func(uuid.UUID) (models.WikiDocument, bool)) []models.WikiDocument {
	chain := make([]models.WikiDocument, 0, 4)
	visited := make(map[uuid.UUID]struct{}, 4)
	currentID := startID

	for i := 0; i < maxAncestorDepth; i++ {
		if _, seen := visited[currentID]; seen {
			break // cycle guard
		}
		visited[currentID] = struct{}{}

		doc, ok := lookup(currentID)
		if !ok {
			break // broken link — return partial path
		}
		chain = append(chain, doc)
		if doc.ParentDocumentID == nil {
			break
		}
		currentID = *doc.ParentDocumentID
	}

	// Collected leaf→root; reverse for root→leaf.
	for i, j := 0, len(chain)-1; i < j; i, j = i+1, j-1 {
		chain[i], chain[j] = chain[j], chain[i]
	}
	return chain
}

// NestingDepth returns the depth of the given document by walking up the tree.
// A root document has depth 0, its direct child has depth 1, etc.
func (r *wikiDocumentRepository) NestingDepth(ctx context.Context, parentID uuid.UUID) (int, error) {
	depth := 0
	currentID := parentID

	for {
		var doc models.WikiDocument
		err := r.coll.FindOne(ctx, bson.M{"document_id": currentID}).One(&doc)
		if err != nil {
			return 0, err
		}
		depth++
		if doc.ParentDocumentID == nil {
			return depth, nil
		}
		currentID = *doc.ParentDocumentID
	}
}

func (r *wikiDocumentRepository) SoftDelete(ctx context.Context, doc *models.WikiDocument, deletedByID uuid.UUID) error {
	now := time.Now().UTC()
	return r.coll.UpdateOne(ctx,
		bson.M{"document_id": doc.DocumentID},
		bson.M{"$set": bson.M{
			"deleted_at":    now,
			"deleted_by_id": deletedByID,
		}},
	)
}

func (r *wikiDocumentRepository) SoftDeleteBatch(ctx context.Context, docIDs []uuid.UUID, deletedByID uuid.UUID) error {
	if len(docIDs) == 0 {
		return nil
	}
	now := time.Now().UTC()
	_, err := r.coll.UpdateAll(ctx,
		bson.M{"document_id": bson.M{"$in": docIDs}},
		bson.M{"$set": bson.M{
			"deleted_at":    now,
			"deleted_by_id": deletedByID,
		}},
	)
	return err
}

func (r *wikiDocumentRepository) Restore(ctx context.Context, doc *models.WikiDocument) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"document_id": doc.DocumentID},
		bson.M{"$set": bson.M{
			"deleted_at":    nil,
			"deleted_by_id": nil,
		}},
	)
}

// RestoreBatch clears deleted_at/deleted_by_id and stamps last_updated for a
// set of doc IDs in a single Mongo round-trip — used by cascade restore.
// Skips reparenting on purpose: the caller already restored the subtree root
// (with its own re-home logic), so descendant parent_document_id values can
// stay pointing at IDs that are now alive again.
func (r *wikiDocumentRepository) RestoreBatch(ctx context.Context, docIDs []uuid.UUID, restorerID uuid.UUID) error {
	if len(docIDs) == 0 {
		return nil
	}
	now := time.Now().UTC()
	_, err := r.coll.UpdateAll(ctx,
		bson.M{"document_id": bson.M{"$in": docIDs}},
		bson.M{"$set": bson.M{
			"deleted_at":         nil,
			"deleted_by_id":      nil,
			"last_updated_at":    now,
			"last_updated_by_id": restorerID,
		}},
	)
	return err
}

func (r *wikiDocumentRepository) Update(ctx context.Context, doc *models.WikiDocument, updates map[string]interface{}) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"document_id": doc.DocumentID, "operation_id": doc.OperationID},
		bson.M{"$set": updates},
	)
}

func (r *wikiDocumentRepository) HardDelete(ctx context.Context, doc *models.WikiDocument) error {
	return r.coll.Remove(ctx, bson.M{"document_id": doc.DocumentID})
}

func (r *wikiDocumentRepository) HardDeleteByOperationID(ctx context.Context, opID uuid.UUID) error {
	_, err := r.coll.RemoveAll(ctx, bson.M{"operation_id": opID})
	return err
}

func (r *wikiDocumentRepository) HardDeleteTrashed(ctx context.Context, opID uuid.UUID) error {
	_, err := r.coll.RemoveAll(ctx, bson.M{
		"operation_id": opID,
		"deleted_at":   bson.M{"$ne": nil},
	})
	return err
}

// FindChangedSinceLastBackup finds documents that have been updated since their
// last backup (or have never been backed up). Used by the auto-backup scheduler.
func (r *wikiDocumentRepository) FindChangedSinceLastBackup(ctx context.Context, batchSize int64) ([]models.WikiDocument, error) {
	var docs []models.WikiDocument
	// Documents where: no last_backup_at, OR updateAt > last_backup_at. Active docs only.
	err := r.coll.Find(ctx, bson.M{
		"deleted_at": nil,
		"$or": bson.A{
			bson.M{"last_backup_at": nil},
			bson.M{"$expr": bson.M{"$gt": bson.A{"$updateAt", "$last_backup_at"}}},
		},
	}).Limit(batchSize).All(&docs)
	return docs, err
}

// RestoreFromBackup writes backup content (and optionally content_state) back to the document.
// If contentState is nil, it clears content_state so Hocuspocus reinitializes from Markdown.
func (r *wikiDocumentRepository) RestoreFromBackup(ctx context.Context, docID uuid.UUID, content string, contentState []byte) error {
	updates := bson.M{
		"content": content,
	}
	if contentState != nil {
		updates["content_state"] = contentState
	} else {
		updates["content_state"] = nil
		updates["content_state_at"] = nil
	}
	return r.coll.UpdateOne(ctx,
		bson.M{"document_id": docID},
		bson.M{"$set": updates},
	)
}

// FindReferrers lists active documents in opID whose References array contains
// documentID — the inverse of the inline /doc reference. Self-references are
// excluded server-side so a doc that cites itself never appears in its own
// backlinks list. Sorted by most recently updated.
func (r *wikiDocumentRepository) FindReferrers(ctx context.Context, opID, documentID uuid.UUID, limit int64) ([]models.WikiDocument, error) {
	var docs []models.WikiDocument
	err := r.coll.Find(ctx, bson.M{
		"operation_id": opID,
		"references":   documentID,
		"deleted_at":   nil,
		"document_id":  bson.M{"$ne": documentID},
	}).Sort("-updateAt", "-_id").Limit(limit).All(&docs)
	return docs, err
}

func buildWikiDocumentFilter(opID uuid.UUID, filter WikiDocumentFilter) bson.M {
	f := bson.M{"operation_id": opID}

	if filter.Trashed {
		f["deleted_at"] = bson.M{"$ne": nil}
	} else {
		f["deleted_at"] = nil
	}

	if filter.ParentDocumentID != nil {
		f["parent_document_id"] = *filter.ParentDocumentID
	} else if filter.RootsOnly {
		f["parent_document_id"] = nil
	}

	if filter.Search != "" {
		// Escape user input so regex metacharacters are treated literally.
		// Protects against ReDoS (e.g. `(a+)+$`) and unintended broad matches (`.*`).
		regex := bson.M{"$regex": regexp.QuoteMeta(filter.Search), "$options": "i"}
		f["$or"] = bson.A{
			bson.M{"title": regex},
			bson.M{"content": regex},
		}
	}

	return f
}
