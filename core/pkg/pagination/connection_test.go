package pagination

import (
	"fmt"
	"testing"
)

type row struct{ n int }

type edge struct {
	Node   *row
	Cursor string
}

func rows(n int) []row {
	out := make([]row, n)
	for i := range out {
		out[i] = row{n: i}
	}
	return out
}

func cursorOf(r *row) string { return fmt.Sprintf("c%d", r.n) }

func mkEdge(r *row, c string) *edge { return &edge{Node: r, Cursor: c} }

// referencePageInfo is the expression the eleven resolvers each wrote by hand,
// kept here verbatim so the helper is checked against what it replaced rather
// than against a restatement of itself.
func referencePageInfo(args Args, hasMore bool) (next, prev bool) {
	return args.Forward && hasMore,
		(!args.Forward && hasMore) || (args.Forward && args.Cursor != nil)
}

func TestBuildEdges_MatchesTheHandWrittenLogic(t *testing.T) {
	cursor := &Cursor{}
	for _, forward := range []bool{true, false} {
		for _, withCursor := range []bool{true, false} {
			for _, fetched := range []int{0, 1, 3, 4} { // limit 3: 4 = surplus row
				args := Args{Limit: 3, Forward: forward}
				if withCursor {
					args.Cursor = cursor
				}
				name := fmt.Sprintf("forward=%v cursor=%v fetched=%d", forward, withCursor, fetched)
				t.Run(name, func(t *testing.T) {
					edges, info := BuildEdges(rows(fetched), args, cursorOf, mkEdge)

					hasMore := int64(fetched) > args.Limit
					wantNext, wantPrev := referencePageInfo(args, hasMore)
					if info.HasNextPage != wantNext {
						t.Errorf("HasNextPage = %v, want %v", info.HasNextPage, wantNext)
					}
					if info.HasPreviousPage != wantPrev {
						t.Errorf("HasPreviousPage = %v, want %v", info.HasPreviousPage, wantPrev)
					}

					// The surplus row is trimmed, never returned.
					wantLen := fetched
					if hasMore {
						wantLen = int(args.Limit)
					}
					if len(edges) != wantLen {
						t.Fatalf("len(edges) = %d, want %d", len(edges), wantLen)
					}
				})
			}
		}
	}
}

func TestBuildEdges_TrimsTheSurplusRow(t *testing.T) {
	args := Args{Limit: 2, Forward: true}
	edges, info := BuildEdges(rows(3), args, cursorOf, mkEdge)

	if len(edges) != 2 {
		t.Fatalf("len(edges) = %d, want 2", len(edges))
	}
	if !info.HasNextPage {
		t.Error("a surplus row should report HasNextPage")
	}
	// The trimmed row must not leak through the bounds either.
	if *info.EndCursor != "c1" {
		t.Errorf("EndCursor = %q, want c1 (the surplus row must not set the bound)", *info.EndCursor)
	}
}

func TestBuildEdges_NodesAliasTheCallerRows(t *testing.T) {
	// The hand-written loops all did &items[i]; edges must point at the
	// caller's rows, not at copies, and each edge at a distinct row.
	src := rows(3)
	edges, _ := BuildEdges(src, Args{Limit: 10, Forward: true}, cursorOf, mkEdge)

	for i := range edges {
		if edges[i].Node != &src[i] {
			t.Fatalf("edge %d node does not alias src[%d]", i, i)
		}
	}
	src[1].n = 99
	if edges[1].Node.n != 99 {
		t.Error("edge node is a copy, not an alias")
	}
}

func TestBuildEdges_EmptyPageHasNoBounds(t *testing.T) {
	edges, info := BuildEdges(rows(0), Args{Limit: 5, Forward: true}, cursorOf, mkEdge)

	if len(edges) != 0 {
		t.Fatalf("len(edges) = %d, want 0", len(edges))
	}
	// A cursor pointing at nothing is not a position a client can resume from.
	if info.StartCursor != nil || info.EndCursor != nil {
		t.Errorf("empty page should have nil bounds, got start=%v end=%v", info.StartCursor, info.EndCursor)
	}
}

func TestBuildEdges_CursorsComeFromTheReturnedPage(t *testing.T) {
	edges, info := BuildEdges(rows(3), Args{Limit: 3, Forward: true}, cursorOf, mkEdge)

	if *info.StartCursor != edges[0].Cursor {
		t.Errorf("StartCursor %q != first edge cursor %q", *info.StartCursor, edges[0].Cursor)
	}
	if *info.EndCursor != edges[len(edges)-1].Cursor {
		t.Errorf("EndCursor %q != last edge cursor %q", *info.EndCursor, edges[len(edges)-1].Cursor)
	}
}

func TestSetBounds(t *testing.T) {
	var p PageInfo
	p.setBounds([]string{"a", "b", "c"})
	if *p.StartCursor != "a" || *p.EndCursor != "c" {
		t.Errorf("got start=%q end=%q, want a/c", *p.StartCursor, *p.EndCursor)
	}

	p.setBounds([]string{"solo"})
	if *p.StartCursor != "solo" || *p.EndCursor != "solo" {
		t.Error("a single-row page should bound to itself on both sides")
	}

	// Must clear, not retain, when re-applied to an empty page.
	p.setBounds(nil)
	if p.StartCursor != nil || p.EndCursor != nil {
		t.Error("SetBounds(nil) should clear both bounds")
	}
}
