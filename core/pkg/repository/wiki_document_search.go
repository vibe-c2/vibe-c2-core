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

// SearchByOperationID is the one true search path. It runs up to four
// independent queries and merges their results:
//
//  1. Anchored prefix match on title_lower (uses the {operation_id, title_lower}
//     index). Catches incremental typing on titles — "sea" finds "search" —
//     which MongoDB $text cannot do because $text matches whole words only.
//  2. Case-insensitive substring regex on title_lower. Catches mid-title
//     matches the anchored prefix misses ("cmg" inside "10.0.0.5_cmg-1",
//     which $text also misses because the Unicode word-breaker keeps "_" as
//     a word character and "5_cmg" indexes as one token). Piggybacks on the
//     {operation_id, title_lower} index.
//  3. Case-insensitive substring regex on content. Catches partial-word body
//     matches — "banan" finds a doc containing "banana". No index (would
//     need an n-gram index); the operation_id + deleted_at filter reduces
//     the scan to one operation's active docs, capped at mergeFetchCap.
//  4. $text phrase search on the title+content text index. Adds scoring
//     (title matches weighted 10x) and surfaces docs where the query
//     appears as an exact tokenized phrase. The query is phrase-quoted
//     before being handed to $text — see buildTextSearchPhrase for why
//     raw user input cannot be passed through ($text treats `-token` as
//     negation and OR-splits on punctuation, which causes noisy queries
//     to return unrelated documents).
//
// Ranking: title-prefix first (strongest "user is typing a title" signal),
// then title-substring, then content-substring, then remaining $text hits.
// Duplicates (same doc matched by multiple branches) are deduped to keep
// their highest-priority position — so a title hit always outranks the same
// doc's content hit.
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

	// Empty query → browse mode: list active documents newest-updated first so
	// the search palette / document picker shows recent docs to choose from
	// before the user types anything. The ranked text-search branches below
	// only make sense once there's a query to rank against.
	if query == "" {
		return r.browseByOperationID(ctx, raw, opID, scopeParentID, offset, limit)
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

	// Run the branches in parallel — they hit the same operation_id pre-filter
	// but otherwise share no state. errgroup cancels siblings if any one fails
	// so we don't waste work; capture results into pre-declared slices to keep
	// the merge order deterministic (title-prefix → title-substring →
	// content-substring → $text).
	g, gctx := errgroup.WithContext(ctx)
	var (
		prefixHits           []WikiDocumentSearchHit
		titleSubstringHits   []WikiDocumentSearchHit
		contentSubstringHits []WikiDocumentSearchHit
		textHits             []WikiDocumentSearchHit
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

	// Branches 2 + 3: substring regex, split by field so title hits outrank
	// content-only hits in the merged list. Title side catches mid-title
	// matches the anchored prefix branch misses (e.g. "cmg" inside
	// "10.0.0.5_cmg-1", which $text also misses because Mongo's Unicode
	// word-breaker keeps "_" as a word character and indexes "5_cmg" as a
	// single token). Content side is the unindexed body scan. Both are
	// bounded by operation_id + deleted_at and capped at mergeFetchCap.
	// Skip for single-char queries — the prefix branch already handles those.
	if len([]rune(query)) >= 2 {
		g.Go(func() error {
			hits, err := r.searchTitleSubstring(gctx, raw, baseFilter, query)
			if err != nil {
				return err
			}
			titleSubstringHits = hits
			return nil
		})
		g.Go(func() error {
			hits, err := r.searchContentSubstring(gctx, raw, baseFilter, query)
			if err != nil {
				return err
			}
			contentSubstringHits = hits
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

	merged := mergeSearchHits(prefixHits, titleSubstringHits, contentSubstringHits, textHits)
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

// browseByOperationID is the empty-query path for SearchByOperationID. It lists
// active documents in the operation (optionally scoped to a subtree) ordered
// newest-updated first, paginated by offset/limit. No snippet/score — there is
// no query to highlight or rank against.
//
// Ordering: last_updated_at is the curated "content was persisted" signal, but
// it's nullable on legacy rows and docs that were created and never edited.
// Sorting on it directly (as the SortByLastUpdatedAt list mode does) would drop
// those docs from the picker entirely. We coalesce to createAt so every doc is
// browsable and stably ordered, with _id as the final tiebreaker.
func (r *wikiDocumentRepository) browseByOperationID(
	ctx context.Context,
	raw *mongo.Collection,
	opID uuid.UUID,
	scopeParentID *uuid.UUID,
	offset, limit int64,
) ([]WikiDocumentSearchHit, int64, error) {
	match := buildWikiBrowseMatch(opID, scopeParentID)

	total, err := raw.CountDocuments(ctx, match)
	if err != nil {
		return nil, 0, fmt.Errorf("browse wiki documents: count: %w", err)
	}
	if offset >= total {
		return nil, total, nil
	}

	cur, err := raw.Aggregate(ctx, buildWikiBrowsePipeline(match, offset, limit))
	if err != nil {
		return nil, 0, fmt.Errorf("browse wiki documents: aggregate: %w", err)
	}
	defer cur.Close(ctx)

	var docs []models.WikiDocument
	if err := cur.All(ctx, &docs); err != nil {
		return nil, 0, fmt.Errorf("browse wiki documents: decode: %w", err)
	}

	hits := make([]WikiDocumentSearchHit, len(docs))
	for i, d := range docs {
		hits[i] = WikiDocumentSearchHit{Doc: d}
	}
	return hits, total, nil
}

// buildWikiBrowseMatch builds the $match / count filter for browse mode: active
// docs in the operation, optionally scoped to a subtree. Same subtree semantics
// as the search path — the scope doc itself plus all descendants via the
// materialized path_ids chain. Extracted as a pure function so the scope
// handling is unit-testable without a live Mongo.
func buildWikiBrowseMatch(opID uuid.UUID, scopeParentID *uuid.UUID) v1bson.M {
	match := v1bson.M{
		"operation_id": opID,
		"deleted_at":   nil,
	}
	if scopeParentID != nil {
		match["$or"] = v1bson.A{
			v1bson.M{"document_id": *scopeParentID},
			v1bson.M{"path_ids": *scopeParentID},
		}
	}
	return match
}

// buildWikiBrowsePipeline builds the aggregation that lists browse-mode docs
// newest-updated first. last_updated_at is coalesced to createAt so docs that
// were never edited (null last_updated_at) stay visible and stably ordered,
// with _id as the final tiebreaker. Content + the synthetic sort key are
// projected away — browse rows never render a snippet.
func buildWikiBrowsePipeline(match v1bson.M, offset, limit int64) mongo.Pipeline {
	return mongo.Pipeline{
		{{Key: "$match", Value: match}},
		{{Key: "$addFields", Value: v1bson.M{
			"effective_updated": v1bson.M{
				"$ifNull": v1bson.A{"$last_updated_at", "$createAt"},
			},
		}}},
		{{Key: "$sort", Value: v1bson.D{
			{Key: "effective_updated", Value: -1},
			{Key: "_id", Value: -1},
		}}},
		{{Key: "$skip", Value: offset}},
		{{Key: "$limit", Value: limit}},
		{{Key: "$project", Value: v1bson.M{
			"content":           0,
			"content_state":     0,
			"effective_updated": 0,
		}}},
	}
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

// buildTextSearchPhrase converts a user query into a $text $search payload
// that searches for the input as a single exact phrase. Returns ("", false)
// when the cleaned query has nothing usable to search for.
//
// Why phrase quoting: $text treats `-token` as a negation operator and
// tokenizes on punctuation, OR'ing the resulting fragments. A noisy query
// like "U-DCuf+kxjESV7%YES&FRx5%4+daZzH..." gets split into many short
// terms (`d`, `4`, `YES`, ...) that broadly OR-match unrelated documents,
// and the stray `-` flips parts of the query into "must NOT contain"
// constraints. Wrapping the whole input in `"..."` collapses that into
// "match this exact phrase", which is the natural search-palette UX —
// title-prefix and content-substring branches already cover partial
// matches that fall outside the phrase.
//
// MongoDB's phrase delimiter is the literal double-quote character with no
// documented backslash escape, so we strip embedded `"` to keep the phrase
// well-formed.
func buildTextSearchPhrase(query string) (string, bool) {
	sanitized := strings.TrimSpace(strings.ReplaceAll(query, `"`, ""))
	if sanitized == "" {
		return "", false
	}
	return `"` + sanitized + `"`, true
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

// searchTitleSubstring runs a case-insensitive substring regex over
// `title_lower`. Catches mid-title matches the anchored title-prefix branch
// can't reach — e.g. "cmg" inside "10.0.0.5_cmg-1". `title_lower` is already
// lowercased at write time, so the regex doesn't need the "i" option and
// piggybacks on the {operation_id, title_lower} index.
//
// The regex is escaped (regexp.QuoteMeta) so user input like "(a+)+" is
// matched literally and cannot trigger catastrophic backtracking.
func (r *wikiDocumentRepository) searchTitleSubstring(
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
		"$regex": regexp.QuoteMeta(strings.ToLower(query)),
	}

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
	search, ok := buildTextSearchPhrase(query)
	if !ok {
		return nil, nil
	}

	filter := v1bson.M{}
	for k, v := range baseFilter {
		filter[k] = v
	}
	filter["$text"] = v1bson.M{"$search": search}

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
