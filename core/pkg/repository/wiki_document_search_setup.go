package repository

import (
	"context"
	"errors"
	"log"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	v1bson "go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// These helpers run once at repository construction. They:
//   - drop the historical bogus compound index that was mistakenly created as
//     a text-index substitute (literal field names "$text:title",
//     "$text:content") — safe no-op if it isn't there.
//   - create the real MongoDB text index on title+content with weights.
//   - backfill the title_lower field on any document missing it, so the
//     new {operation_id, title_lower} index has full coverage.
//
// All failures are logged but never fatal: startup must not block on best-
// effort index maintenance. The regex search path still works without these.

const (
	// Name MongoDB would have assigned to the broken index from before the fix.
	legacyBrokenTextIndexName = "operation_id_1_$text:title_1_$text:content_1"
	wikiTextIndexName         = "wiki_text_idx"
)

func setupWikiSearchIndexes(coll database.Collection) {
	raw, err := coll.RawCollection()
	if err != nil {
		log.Printf("wiki search setup: RawCollection failed, skipping text-index creation: %v", err)
		return
	}

	ctx := context.Background()

	dropLegacyBrokenIndex(ctx, raw)
	createWikiTextIndex(ctx, raw)
	backfillTitleLower(ctx, raw)
	backfillPathIDs(ctx, raw)
}

func dropLegacyBrokenIndex(ctx context.Context, raw *mongo.Collection) {
	_, err := raw.Indexes().DropOne(ctx, legacyBrokenTextIndexName)
	if err == nil {
		log.Printf("wiki search setup: dropped legacy broken index %q", legacyBrokenTextIndexName)
		return
	}
	// "IndexNotFound" is the expected steady-state — most environments never had it.
	if isIndexNotFound(err) {
		return
	}
	log.Printf("wiki search setup: failed to drop legacy index %q: %v", legacyBrokenTextIndexName, err)
}

func createWikiTextIndex(ctx context.Context, raw *mongo.Collection) {
	_, err := raw.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: v1bson.D{
			{Key: "title", Value: "text"},
			{Key: "content", Value: "text"},
		},
		Options: options.Index().
			SetName(wikiTextIndexName).
			// Weight title matches 10x vs content — a query matching the title
			// should rank above a query matching only the body.
			SetWeights(v1bson.M{"title": 10, "content": 1}).
			// "none" disables English stemming & stop-words. Better for wiki
			// content that contains code identifiers and mixed language.
			SetDefaultLanguage("none"),
	})
	if err == nil {
		return
	}
	// Idempotent creation: "IndexOptionsConflict" means an index with the same
	// name already exists with different options — log and move on so operators
	// can decide whether to drop+recreate.
	log.Printf("wiki search setup: create text index (may already exist): %v", err)
}

// backfillTitleLower runs an aggregation update to populate title_lower on any
// document where it is missing. Runs once at startup, cheap after first run
// (filter matches zero docs). Uses UpdateMany — no driver-level limits that
// would silently truncate.
func backfillTitleLower(ctx context.Context, raw *mongo.Collection) {
	filter := v1bson.M{"title_lower": v1bson.M{"$exists": false}}
	update := v1bson.A{
		v1bson.M{"$set": v1bson.M{"title_lower": v1bson.M{"$toLower": "$title"}}},
	}
	res, err := raw.UpdateMany(ctx, filter, update)
	if err != nil {
		log.Printf("wiki search setup: title_lower backfill failed: %v", err)
		return
	}
	if res != nil && res.ModifiedCount > 0 {
		log.Printf("wiki search setup: backfilled title_lower on %d documents", res.ModifiedCount)
	}
}

func isIndexNotFound(err error) bool {
	var cmdErr mongo.CommandError
	if errors.As(err, &cmdErr) {
		// 27 = IndexNotFound, per MongoDB server error codes.
		return cmdErr.Code == 27
	}
	return false
}

// backfillPathIDs populates path_ids on every wiki document that does not
// already have it. Runs once at startup after deploy; no-op thereafter.
//
// Strategy: enumerate the operation_ids that contain at least one un-backfilled
// doc, then for each such operation load the minimal metadata for ALL of its
// docs (active + trashed — path_ids reflects structural ancestry regardless of
// soft-delete) and rewrite path_ids top-down from the root. One BulkWrite per
// operation. Per-operation memory is O(N_docs) of minimal metadata; far smaller
// than reading content.
//
// Failure semantics: any failure for one operation is logged and the next is
// attempted. We never block startup on this — the regex/text search paths still
// work without the index; only scoped search degrades to "ignores scope" until
// the backfill finishes on a subsequent boot.
func backfillPathIDs(ctx context.Context, raw *mongo.Collection) {
	cur, err := raw.Aggregate(ctx, []v1bson.M{
		{"$match": v1bson.M{"path_ids": v1bson.M{"$exists": false}}},
		{"$group": v1bson.M{"_id": "$operation_id"}},
	})
	if err != nil {
		log.Printf("wiki search setup: path_ids backfill: list ops failed: %v", err)
		return
	}
	var ops []struct {
		ID uuid.UUID `bson:"_id"`
	}
	if err := cur.All(ctx, &ops); err != nil {
		log.Printf("wiki search setup: path_ids backfill: decode ops failed: %v", err)
		return
	}
	if len(ops) == 0 {
		return
	}

	var total int64
	for _, op := range ops {
		n, err := backfillPathIDsForOperation(ctx, raw, op.ID)
		if err != nil {
			log.Printf("wiki search setup: path_ids backfill op %s failed: %v", op.ID, err)
			continue
		}
		total += n
	}
	if total > 0 {
		log.Printf("wiki search setup: backfilled path_ids on %d documents across %d operations", total, len(ops))
	}
}

// pathDocMeta is the minimal projection we need to rebuild path_ids without
// hauling document content into memory.
type pathDocMeta struct {
	DocumentID       uuid.UUID   `bson:"document_id"`
	ParentDocumentID *uuid.UUID  `bson:"parent_document_id"`
	PathIDs          []uuid.UUID `bson:"path_ids"`
}

func backfillPathIDsForOperation(ctx context.Context, raw *mongo.Collection, opID uuid.UUID) (int64, error) {
	opt := options.Find().SetProjection(v1bson.M{
		"document_id":        1,
		"parent_document_id": 1,
		"path_ids":           1,
		"_id":                0,
	})
	cur, err := raw.Find(ctx, v1bson.M{"operation_id": opID}, opt)
	if err != nil {
		return 0, err
	}
	var docs []pathDocMeta
	if err := cur.All(ctx, &docs); err != nil {
		return 0, err
	}
	if len(docs) == 0 {
		return 0, nil
	}

	// Build adjacency: parent → children. We BFS from each root and stamp
	// each node with its computed path; orphans (parent missing from the
	// operation) fall through to an empty path so the doc still indexes.
	childrenOf := make(map[uuid.UUID][]uuid.UUID, len(docs))
	for _, d := range docs {
		if d.ParentDocumentID != nil {
			childrenOf[*d.ParentDocumentID] = append(childrenOf[*d.ParentDocumentID], d.DocumentID)
		}
	}

	type frontier struct {
		id   uuid.UUID
		path []uuid.UUID
	}
	pathByID := make(map[uuid.UUID][]uuid.UUID, len(docs))
	var queue []frontier
	for _, d := range docs {
		if d.ParentDocumentID == nil {
			queue = append(queue, frontier{id: d.DocumentID, path: []uuid.UUID{}})
		}
	}
	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]
		if _, seen := pathByID[node.id]; seen {
			continue // cycle guard for corrupt data
		}
		pathByID[node.id] = node.path
		childPath := ComposePathIDs(node.path, node.id)
		for _, childID := range childrenOf[node.id] {
			queue = append(queue, frontier{id: childID, path: childPath})
		}
	}

	var writes []mongo.WriteModel
	for _, d := range docs {
		newPath, ok := pathByID[d.DocumentID]
		if !ok {
			// Orphan or in a cycle: store empty path so the field exists and
			// future scoped-search queries don't have to special-case missing.
			newPath = []uuid.UUID{}
		}
		if pathSliceEqual(d.PathIDs, newPath) {
			continue
		}
		writes = append(writes, mongo.NewUpdateOneModel().
			SetFilter(v1bson.M{"document_id": d.DocumentID}).
			SetUpdate(v1bson.M{"$set": v1bson.M{"path_ids": newPath}}))
	}
	if len(writes) == 0 {
		return 0, nil
	}
	res, err := raw.BulkWrite(ctx, writes, options.BulkWrite().SetOrdered(false))
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}
