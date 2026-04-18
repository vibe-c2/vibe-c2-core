package repository

import (
	"context"
	"errors"
	"log"

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
