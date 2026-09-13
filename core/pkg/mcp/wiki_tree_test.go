package mcp

import (
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// A small wiki: two roots, one with a child that has a grandchild.
//
//	A
//	├── A1
//	│   └── A1a
//	└── A2
//	B
func fixtureTree() (docs []models.WikiDocument, ids map[string]uuid.UUID) {
	ids = map[string]uuid.UUID{}
	for _, name := range []string{"A", "A1", "A1a", "A2", "B"} {
		ids[name] = uuid.New()
	}
	mk := func(name string, parents ...string) models.WikiDocument {
		d := models.WikiDocument{DocumentID: ids[name], Title: name}
		for _, p := range parents {
			d.PathIDs = append(d.PathIDs, ids[p])
		}
		if len(parents) > 0 {
			last := ids[parents[len(parents)-1]]
			d.ParentDocumentID = &last
		}
		return d
	}
	// Repository order is sibling order, not tree order.
	docs = []models.WikiDocument{mk("B"), mk("A"), mk("A2", "A"), mk("A1a", "A", "A1"), mk("A1", "A")}
	return docs, ids
}

func titles(rows []treeRow) string {
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.Title)
	}
	return strings.Join(out, " ")
}

func TestFlattenTree_DepthFirstWithChildCounts(t *testing.T) {
	docs, _ := fixtureTree()
	rows, beyond := flattenTree(docs, nil, 0)

	if got := titles(rows); got != "B A A2 A1 A1a" {
		t.Fatalf("order = %q", got)
	}
	if beyond != 0 {
		t.Fatalf("nothing should be cut at depth 0, got %d", beyond)
	}
	byTitle := map[string]treeRow{}
	for _, r := range rows {
		byTitle[r.Title] = r
	}
	if byTitle["A"].ChildCount != 2 || byTitle["A1"].ChildCount != 1 || byTitle["B"].ChildCount != 0 {
		t.Fatalf("child counts wrong: %+v", byTitle)
	}
	if byTitle["A1a"].Depth != 2 {
		t.Fatalf("A1a depth = %d, want 2", byTitle["A1a"].Depth)
	}
}

func TestFlattenTree_DepthLimitReportsWhatItHid(t *testing.T) {
	docs, _ := fixtureTree()
	rows, beyond := flattenTree(docs, nil, 2)
	if got := titles(rows); got != "B A A2 A1" {
		t.Fatalf("order = %q", got)
	}
	if beyond != 1 {
		t.Fatalf("beyond = %d, want 1 (A1a)", beyond)
	}
}

func TestFlattenTree_Subtree(t *testing.T) {
	docs, ids := fixtureTree()
	root := ids["A"]
	rows, _ := flattenTree(docs, &root, 0)
	if got := titles(rows); got != "A2 A1 A1a" {
		t.Fatalf("order = %q", got)
	}
}

func TestTreeCursor_RoundTripsAndRefusesForeign(t *testing.T) {
	for _, n := range []int{0, 7, 1234} {
		got, err := decodeTreeCursor(encodeTreeCursor(n))
		if err != nil || got != n {
			t.Fatalf("cursor %d: got %d, %v", n, got, err)
		}
	}
	if _, err := decodeTreeCursor("bm90LWEtdHJlZS1jdXJzb3I"); err == nil {
		t.Fatal("a foreign cursor was accepted")
	}
}

func TestTreePage_CursorContinuesFromWhatWasShown(t *testing.T) {
	docs, _ := fixtureTree()
	rows, _ := flattenTree(docs, nil, 0)

	first, err := treePage(rows, 0, 2)
	if err != nil {
		t.Fatal(err)
	}
	if first.Returned != 2 || first.NextCursor == "" {
		t.Fatalf("first page: %+v", first)
	}
	offset, _ := decodeTreeCursor(first.NextCursor)
	second, err := treePage(rows, offset, 10)
	if err != nil {
		t.Fatal(err)
	}
	if got := titles(second.Items); got != "A2 A1 A1a" || second.NextCursor != "" {
		t.Fatalf("second page = %q, cursor %q", got, second.NextCursor)
	}
}
