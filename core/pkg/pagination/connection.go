package pagination

// Relay connection assembly.
//
// pkg/pagination already owned cursor encoding, filter construction and sort
// fields, but not the last step — turning an over-fetched result slice into
// edges plus PageInfo. Eleven resolvers each wrote that step out by hand,
// including this expression:
//
//	HasPreviousPage: (!args.Forward && hasMore) || (args.Forward && args.Cursor != nil)
//
// which is the part worth having in one place. It is not self-evident, it is
// wrong in a way no test would obviously catch (a stuck or skipped page at a
// boundary), and eleven copies is eleven chances to fix it in ten of them.
//
// Only cursor pagination driven by Args belongs here. Two other pagination
// shapes exist and deliberately keep their own assembly: the day-bucketed
// timeline in operation_event_repository is forward-only with no Args, and the
// wiki visit history is offset/limit. Routing them through this helper would
// mean materialising a cursor slice for a four-line tail, which is more code
// at the call site, not less.

// BuildEdges turns an over-fetched result slice into GraphQL edges and the
// matching PageInfo.
//
// Callers fetch args.Limit+1 rows so that one surplus row signals another
// page; BuildEdges trims it back off before building edges. mkEdge is handed a
// pointer into that trimmed slice, so edge nodes alias the caller's rows
// rather than copies of them — the same aliasing the hand-written loops had.
//
// cursorOf is separate from mkEdge because the cursor is needed twice: once on
// the edge and once for the page bounds. Sort-aware callers pass their
// SortSpec's Cursor method; time-ordered ones pass a closure over EncodeCursor.
func BuildEdges[T any, E any](
	items []T,
	args Args,
	cursorOf func(node *T) string,
	mkEdge func(node *T, cursor string) E,
) ([]E, PageInfo) {
	hasMore := int64(len(items)) > args.Limit
	if hasMore {
		items = items[:args.Limit]
	}

	edges := make([]E, len(items))
	cursors := make([]string, len(items))
	for i := range items {
		cursors[i] = cursorOf(&items[i])
		edges[i] = mkEdge(&items[i], cursors[i])
	}

	info := PageInfo{
		// Forward paging can only report a next page, backward only a
		// previous one; the surplus row is what proves the page exists.
		HasNextPage: args.Forward && hasMore,
		// Backward: a surplus row means more rows behind. Forward: having
		// been given a cursor is itself the proof that a previous page
		// exists, since the caller had to page forward to obtain it.
		HasPreviousPage: (!args.Forward && hasMore) || (args.Forward && args.Cursor != nil),
	}
	info.setBounds(cursors)
	return edges, info
}

// setBounds fills StartCursor and EndCursor from a page's cursors, leaving
// both nil for an empty page — a cursor pointing at nothing would be a
// position the client cannot resume from.
func (p *PageInfo) setBounds(cursors []string) {
	if len(cursors) == 0 {
		p.StartCursor = nil
		p.EndCursor = nil
		return
	}
	p.StartCursor = &cursors[0]
	p.EndCursor = &cursors[len(cursors)-1]
}
