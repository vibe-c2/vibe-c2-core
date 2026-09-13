package mcp

import (
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// Tree listing.
//
// A wiki is a tree, and an agent asks about it the way a person opens a
// folder: what is at the top, then what is under the thing that looked
// relevant. The listing therefore takes a subtree root and a depth, returns
// rows in depth-first order so children follow their parent, and pages with
// a cursor — so a large wiki is reachable in full rather than halved to fit
// the response budget with no way to see the rest.

const (
	// treeDefaultDepth is how many levels a listing shows when not asked:
	// the roots and their children. Deeper pages are reachable through
	// parent_id, or depth:0 for everything.
	treeDefaultDepth = 2
	// treeDefaultPageSize and treeMaxPageSize are larger than the list
	// defaults because a tree row is a title and a few ids, a fraction of a
	// finding.
	treeDefaultPageSize = 100
	treeMaxPageSize     = 250
)

// treeRow is one page in the listing, with how many children it has so the
// agent knows where descending is worth a call.
type treeRow struct {
	wikiDocView
	ChildCount int `json:"childCount,omitempty"`
}

// flattenTree orders docs depth-first under root (nil for the whole wiki),
// down to maxDepth levels below it (0 for all). Docs are expected in the
// repository's sibling order; that order is kept within each parent.
//
// Returns the rows and how many pages were cut off by the depth limit.
func flattenTree(docs []models.WikiDocument, root *uuid.UUID, maxDepth int) (rows []treeRow, beyondDepth int) {
	children := map[uuid.UUID][]int{}
	var roots []int
	for i, d := range docs {
		if d.ParentDocumentID == nil {
			roots = append(roots, i)
			continue
		}
		children[*d.ParentDocumentID] = append(children[*d.ParentDocumentID], i)
	}

	start := roots
	if root != nil {
		start = children[*root]
	}

	var walk func(indexes []int, level int)
	walk = func(indexes []int, level int) {
		for _, i := range indexes {
			d := docs[i]
			if maxDepth > 0 && level > maxDepth {
				beyondDepth += 1 + countSubtree(children, docs, d.DocumentID)
				continue
			}
			view := toWikiDocView(&d)
			view.Depth = len(d.PathIDs)
			rows = append(rows, treeRow{wikiDocView: view, ChildCount: len(children[d.DocumentID])})
			walk(children[d.DocumentID], level+1)
		}
	}
	walk(start, 1)
	return rows, beyondDepth
}

// countSubtree counts every page below id, at any depth.
func countSubtree(children map[uuid.UUID][]int, docs []models.WikiDocument, id uuid.UUID) int {
	total := 0
	for _, i := range children[id] {
		total += 1 + countSubtree(children, docs, docs[i].DocumentID)
	}
	return total
}

// Offset cursor: the listing is computed in memory from one query, so a plain
// position is exact and stable for the duration of a session.
const treeCursorPrefix = "tree:"

func encodeTreeCursor(offset int) string {
	return base64.RawURLEncoding.EncodeToString([]byte(treeCursorPrefix + strconv.Itoa(offset)))
}

func decodeTreeCursor(cursor string) (int, error) {
	if cursor == "" {
		return 0, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil || !strings.HasPrefix(string(raw), treeCursorPrefix) {
		return 0, refuse("cursor %q is not from list_wiki_tree.", cursor)
	}
	offset, err := strconv.Atoi(strings.TrimPrefix(string(raw), treeCursorPrefix))
	if err != nil || offset < 0 {
		return 0, refuse("cursor %q is not from list_wiki_tree.", cursor)
	}
	return offset, nil
}

func clampTreePageSize(requested int) int {
	if requested <= 0 {
		return treeDefaultPageSize
	}
	if requested > treeMaxPageSize {
		return treeMaxPageSize
	}
	return requested
}

// treePage slices the flattened rows and fits them to the budget, then sets
// the cursor from what actually went out — the fit may have trimmed the page,
// and the cursor has to continue from the last row shown.
func treePage(rows []treeRow, offset, limit int) (page[treeRow], error) {
	if offset > len(rows) {
		offset = len(rows)
	}
	end := offset + limit
	if end > len(rows) {
		end = len(rows)
	}
	result, err := fit(page[treeRow]{Items: rows[offset:end]})
	if err != nil {
		return result, err
	}
	shown := offset + result.Returned
	if shown < len(rows) {
		result.NextCursor = encodeTreeCursor(shown)
		result.Notes = append(result.Notes, fmt.Sprintf(
			"%d of %d pages shown. Continue with the cursor.", result.Returned, len(rows)))
	}
	return result, nil
}
