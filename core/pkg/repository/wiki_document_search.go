package repository

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	v1bson "go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/sync/errgroup"
)

// MaxSearchOffset caps how deep the search result set is paginable. Past this,
// MongoDB `skip` degrades sharply and the user should refine the query.
const MaxSearchOffset int64 = 500

// mergeFetchCap bounds how many rows we pull from each branch before merging
// + paginating in Go. Large enough for typical wiki corpora (hundreds of docs);
// past this we'd need a smarter backend pagination scheme. Keeping this finite
// avoids runaway memory on pathological queries.
const mergeFetchCap int64 = 200

// WikiDocumentSearchHit is a search result carrying the document plus the
// bits the frontend needs to render a rich result card (highlighted snippet,
// relevance score).
type WikiDocumentSearchHit struct {
	Doc         models.WikiDocument
	Score       *float64
	Snippet     string
	MatchRanges [][2]int // rune-offset (start, end-exclusive) pairs inside Snippet
}

// searchScoredDoc is the shape returned by the $text aggregation pipeline —
// the embedded WikiDocument plus a projected `score` field.
type searchScoredDoc struct {
	models.WikiDocument `bson:",inline"`
	Score               float64 `bson:"score"`
}

// SearchByOperationID is the one true search path. It runs up to three
// independent queries and merges their results:
//
//  1. Anchored prefix match on title_lower (uses the {operation_id, title_lower}
//     index). Catches incremental typing on titles — "sea" finds "search" —
//     which MongoDB $text cannot do because $text matches whole words only.
//  2. Case-insensitive substring regex on content. Catches partial-word
//     matches in document bodies — "banan" finds a doc containing "banana".
//     No index (would need an n-gram index); the operation_id + deleted_at
//     filter reduces the scan to one operation's active docs, capped at
//     mergeFetchCap results.
//  3. $text search on the title+content text index. Adds scoring (title
//     matches weighted 10x) and multi-word AND matching. Redundant with (2)
//     for single-word queries but catches e.g. "search index" semantics
//     that a naive substring regex does not.
//
// Ranking: title-prefix hits first (strongest "user is typing a title"
// signal), then content-substring hits, then remaining $text hits. Duplicates
// (same doc matched by multiple paths) are deduped to keep their
// highest-priority position.
//
// `total` reflects the merged, deduped result count. Offset/limit apply after
// the merge.
func (r *wikiDocumentRepository) SearchByOperationID(
	ctx context.Context,
	opID uuid.UUID,
	scopeParentID *uuid.UUID,
	query string,
	offset, limit int64,
) ([]WikiDocumentSearchHit, int64, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, 0, nil
	}

	if offset < 0 {
		offset = 0
	}
	if offset > MaxSearchOffset {
		return nil, 0, nil
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	raw, err := r.coll.RawCollection()
	if err != nil {
		return nil, 0, err
	}

	baseFilter := v1bson.M{
		"operation_id": opID,
		"deleted_at":   nil,
	}
	// Subtree scope: match the scope doc and all its descendants, not just
	// direct children. PathIDs is the materialized ancestor chain (root → …
	// → immediate-parent) populated at Create and maintained by
	// RebuildPathIDsCascade on every reparent. The {operation_id, path_ids}
	// multikey index turns the scope filter into a single index probe —
	// replacing the previous O(depth) FindDescendants BFS that shipped full
	// documents just to extract IDs.
	if scopeParentID != nil {
		baseFilter["$or"] = v1bson.A{
			v1bson.M{"document_id": *scopeParentID},
			v1bson.M{"path_ids": *scopeParentID},
		}
	}

	// Run the three branches in parallel — they hit the same operation_id
	// pre-filter but otherwise share no state. errgroup cancels siblings if
	// any one fails so we don't waste work; capture results into pre-declared
	// slices to keep the merge order deterministic (title-prefix outranks
	// content-substring outranks $text).
	g, gctx := errgroup.WithContext(ctx)
	var (
		prefixHits  []WikiDocumentSearchHit
		contentHits []WikiDocumentSearchHit
		textHits    []WikiDocumentSearchHit
	)

	// Branch 1: title-prefix (always runs, always cheap).
	g.Go(func() error {
		hits, err := r.searchTitlePrefix(gctx, raw, baseFilter, query)
		if err != nil {
			return err
		}
		prefixHits = hits
		return nil
	})

	// Branch 2: content substring regex. Catches partial-word matches inside
	// bodies that $text cannot. Unindexed but scoped to one operation's
	// active docs and capped at mergeFetchCap. Skip for single-char queries
	// where a substring scan returns noise — use the title prefix instead.
	if len([]rune(query)) >= 2 {
		g.Go(func() error {
			hits, err := r.searchContentSubstring(gctx, raw, baseFilter, query)
			if err != nil {
				return err
			}
			contentHits = hits
			return nil
		})
	}

	// Branch 3: $text. Only useful once the user has typed something that
	// can tokenize to at least one whole word of length ≥ 2 — MongoDB's
	// tokenizer drops single-character tokens.
	if hasSearchableWord(query) {
		g.Go(func() error {
			hits, err := r.searchFullText(gctx, raw, baseFilter, query)
			if err != nil {
				return err
			}
			textHits = hits
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, 0, err
	}

	merged := mergeSearchHits(prefixHits, contentHits, textHits)
	total := int64(len(merged))

	// Slice by offset/limit.
	if offset >= total {
		return nil, total, nil
	}
	end := offset + limit
	if end > total {
		end = total
	}
	page := merged[offset:end]

	// The three branches each project away `content` to keep the merge
	// payload small. Snippet extraction needs the body, so re-fetch content
	// only for the docs that actually land on the page — at most `limit`
	// docs (default 20) per request.
	if err := r.hydratePageContent(ctx, page); err != nil {
		return nil, 0, err
	}

	// Generate snippets lazily for the page only — snippet extraction scans
	// full content per doc, so scoping to the page bounds the cost.
	for i := range page {
		if page[i].Snippet == "" {
			page[i].Snippet, page[i].MatchRanges = extractSnippet(page[i].Doc.Content, query)
		}
	}

	return page, total, nil
}

// hydratePageContent fetches the `content` field for the documents on the
// current result page and populates page[i].Doc.Content in place. Search
// branches project content away to avoid shipping ~30 KB × mergeFetchCap of
// markdown that's only read for the page's snippets. One indexed Find by
// document_id; the order of `page` is preserved.
func (r *wikiDocumentRepository) hydratePageContent(ctx context.Context, page []WikiDocumentSearchHit) error {
	if len(page) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, len(page))
	for i, h := range page {
		ids[i] = h.Doc.DocumentID
	}

	raw, err := r.coll.RawCollection()
	if err != nil {
		return err
	}
	opt := options.Find().SetProjection(v1bson.M{
		"document_id": 1,
		"content":     1,
		"_id":         0,
	})
	cur, err := raw.Find(ctx, v1bson.M{"document_id": v1bson.M{"$in": ids}}, opt)
	if err != nil {
		return fmt.Errorf("hydrate page content: %w", err)
	}
	type contentRow struct {
		DocumentID uuid.UUID `bson:"document_id"`
		Content    string    `bson:"content"`
	}
	var rows []contentRow
	if err := cur.All(ctx, &rows); err != nil {
		return fmt.Errorf("hydrate page content: decode: %w", err)
	}
	byID := make(map[uuid.UUID]string, len(rows))
	for _, row := range rows {
		byID[row.DocumentID] = row.Content
	}
	for i := range page {
		page[i].Doc.Content = byID[page[i].Doc.DocumentID]
	}
	return nil
}

// hasSearchableWord returns true if at least one whitespace-separated token
// in the query is ≥2 characters. MongoDB $text tokenizes on whitespace and
// ignores single-char terms, so a query like "a" cannot possibly match and
// we skip the round-trip.
func hasSearchableWord(query string) bool {
	for _, tok := range strings.Fields(query) {
		if len([]rune(tok)) >= 2 {
			return true
		}
	}
	return false
}

// mergeSearchHits concatenates hit lists in the provided order, deduping on
// document ID so the first occurrence wins. Callers pass higher-signal branches
// first (title-prefix before content-substring before $text).
func mergeSearchHits(branches ...[]WikiDocumentSearchHit) []WikiDocumentSearchHit {
	total := 0
	for _, b := range branches {
		total += len(b)
	}
	out := make([]WikiDocumentSearchHit, 0, total)
	seen := make(map[uuid.UUID]struct{}, total)
	for _, b := range branches {
		for _, h := range b {
			if _, dup := seen[h.Doc.DocumentID]; dup {
				continue
			}
			seen[h.Doc.DocumentID] = struct{}{}
			out = append(out, h)
		}
	}
	return out
}

// searchTitlePrefix uses the {operation_id, title_lower} compound index with
// an anchored, non-case-insensitive regex. Works because title_lower is
// already lowercased at write time, so anchored `^hello` matches via IXSCAN.
// Snippets are not generated here — the caller fills them in for the final
// page only, after merge + slice.
func (r *wikiDocumentRepository) searchTitlePrefix(
	ctx context.Context,
	raw *mongo.Collection,
	baseFilter v1bson.M,
	query string,
) ([]WikiDocumentSearchHit, error) {
	filter := v1bson.M{}
	for k, v := range baseFilter {
		filter[k] = v
	}
	filter["title_lower"] = v1bson.M{
		"$regex": "^" + regexp.QuoteMeta(strings.ToLower(query)),
	}

	// Project away `content` — snippets only render for the final page, and
	// the page hydrates content separately. Shipping content for up to
	// mergeFetchCap candidates was the dominant payload before this fix.
	opt := options.Find().
		SetSort(v1bson.D{{Key: "title_lower", Value: 1}}).
		SetLimit(mergeFetchCap).
		SetProjection(v1bson.M{"content": 0, "content_state": 0})

	cur, err := raw.Find(ctx, filter, opt)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var docs []models.WikiDocument
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}

	hits := make([]WikiDocumentSearchHit, len(docs))
	for i, d := range docs {
		hits[i] = WikiDocumentSearchHit{Doc: d}
	}
	return hits, nil
}

// searchContentSubstring runs a case-insensitive regex over the content field.
// No index — content is too large and variable to index sensibly (an n-gram
// index would explode in size for long docs). The operation_id + deleted_at
// pre-filter uses the {operation_id, deleted_at} index, so the scan is bounded
// to one operation's active docs. Capped at mergeFetchCap.
//
// The regex is escaped (regexp.QuoteMeta) so user input like "(a+)+" is
// matched literally and cannot trigger catastrophic backtracking.
func (r *wikiDocumentRepository) searchContentSubstring(
	ctx context.Context,
	raw *mongo.Collection,
	baseFilter v1bson.M,
	query string,
) ([]WikiDocumentSearchHit, error) {
	filter := v1bson.M{}
	for k, v := range baseFilter {
		filter[k] = v
	}
	filter["content"] = v1bson.M{
		"$regex":   regexp.QuoteMeta(query),
		"$options": "i",
	}

	// Project away `content` from the response — the regex still has to scan
	// content server-side (that's the match condition) but Mongo can return
	// just the metadata. Saves the per-doc payload on the wire and in Go GC.
	opt := options.Find().
		SetSort(v1bson.D{{Key: "createAt", Value: -1}}).
		SetLimit(mergeFetchCap).
		SetProjection(v1bson.M{"content": 0, "content_state": 0})

	cur, err := raw.Find(ctx, filter, opt)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var docs []models.WikiDocument
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}

	hits := make([]WikiDocumentSearchHit, len(docs))
	for i, d := range docs {
		hits[i] = WikiDocumentSearchHit{Doc: d}
	}
	return hits, nil
}

// searchFullText uses the MongoDB text index ($text operator) with a text-score
// projection. Sort is by score desc then by createAt desc as a tiebreaker so
// equal-score results are deterministic.
//
// $text matches whole tokens only — a query of "sear" cannot match the indexed
// term "search". That limitation is why the caller also runs searchTitlePrefix.
func (r *wikiDocumentRepository) searchFullText(
	ctx context.Context,
	raw *mongo.Collection,
	baseFilter v1bson.M,
	query string,
) ([]WikiDocumentSearchHit, error) {
	filter := v1bson.M{}
	for k, v := range baseFilter {
		filter[k] = v
	}
	filter["$text"] = v1bson.M{"$search": query}

	// Exclusion projection — keeps `content`/`content_state` off the wire while
	// auto-including any future WikiDocument fields (no drift vs the other two
	// branches which also exclude content). `$meta` may be combined with an
	// exclusion projection since MongoDB 4.4.
	opt := options.Find().
		SetProjection(v1bson.M{
			"content":       0,
			"content_state": 0,
			"score":         v1bson.M{"$meta": "textScore"},
		}).
		SetSort(v1bson.D{
			{Key: "score", Value: v1bson.M{"$meta": "textScore"}},
			{Key: "createAt", Value: -1},
		}).
		SetLimit(mergeFetchCap)

	cur, err := raw.Find(ctx, filter, opt)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var rows []searchScoredDoc
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}

	hits := make([]WikiDocumentSearchHit, len(rows))
	for i, row := range rows {
		score := row.Score
		hits[i] = WikiDocumentSearchHit{
			Doc:   row.WikiDocument,
			Score: &score,
		}
	}
	return hits, nil
}
