package repository

import (
	"testing"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
)

// TestOperationSortSortKey verifies the repo→pagination mapping: name is a
// string-keyed column, createAt keeps the time-keyed cursor.
func TestOperationSortSortKey(t *testing.T) {
	cases := []struct {
		sort       OperationSort
		wantField  string
		wantString bool
		wantAsc    bool
	}{
		{DefaultOperationSort(), "createAt", false, false},
		{OperationSort{Field: OperationSortFieldName, Ascending: true}, "name", true, true},
		{OperationSort{Field: OperationSortFieldName, Ascending: false}, "name", true, false},
	}
	for _, tc := range cases {
		key := tc.sort.SortKey()
		if key.Field != tc.wantField || key.String != tc.wantString || key.Ascending != tc.wantAsc {
			t.Fatalf("sort %+v: got key %+v", tc.sort, key)
		}
	}
}

// TestOperationSortCursor verifies edge cursors carry the active sort
// column's value: the string slot for name, the timestamp for createAt — and
// that each round-trips through DecodeCursor.
func TestOperationSortCursor(t *testing.T) {
	op := &models.Operation{Name: "Red Phoenix"}
	op.CreateAt = time.Date(2026, 6, 1, 10, 0, 0, 0, time.UTC)

	byName := OperationSort{Field: OperationSortFieldName, Ascending: true}
	c, err := pagination.DecodeCursor(byName.Cursor(op))
	if err != nil {
		t.Fatalf("decode name cursor: %v", err)
	}
	if c.Str == nil || *c.Str != "Red Phoenix" {
		t.Fatalf("name cursor should carry the name, got %v", c.Str)
	}

	c, err = pagination.DecodeCursor(DefaultOperationSort().Cursor(op))
	if err != nil {
		t.Fatalf("decode createAt cursor: %v", err)
	}
	if c.Str != nil {
		t.Fatalf("createAt cursor should not carry a string key, got %q", *c.Str)
	}
	if !c.CreateAt.Equal(op.CreateAt) {
		t.Fatalf("createAt cursor should carry the timestamp, got %v", c.CreateAt)
	}
}
