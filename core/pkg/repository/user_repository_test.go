package repository

import (
	"testing"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
)

// TestUserSortSortKey verifies the repo→pagination mapping: username is a
// string-keyed column, createAt keeps the time-keyed cursor.
func TestUserSortSortKey(t *testing.T) {
	cases := []struct {
		sort       UserSort
		wantField  string
		wantString bool
		wantAsc    bool
	}{
		{DefaultUserSort(), "createAt", false, false},
		{UserSort{Field: UserSortFieldUsername, Ascending: true}, "username", true, true},
		{UserSort{Field: UserSortFieldUsername, Ascending: false}, "username", true, false},
	}
	for _, tc := range cases {
		key := tc.sort.SortKey()
		if key.Field != tc.wantField || key.String != tc.wantString || key.Ascending != tc.wantAsc {
			t.Fatalf("sort %+v: got key %+v", tc.sort, key)
		}
	}
}

// TestUserSortCursor verifies edge cursors carry the active sort column's
// value: the string slot for username, the timestamp for createAt — and that
// each round-trips through DecodeCursor.
func TestUserSortCursor(t *testing.T) {
	user := &models.User{Username: "operator1"}
	user.CreateAt = time.Date(2026, 6, 1, 10, 0, 0, 0, time.UTC)

	byUsername := UserSort{Field: UserSortFieldUsername, Ascending: true}
	c, err := pagination.DecodeCursor(byUsername.Cursor(user))
	if err != nil {
		t.Fatalf("decode username cursor: %v", err)
	}
	if c.Str == nil || *c.Str != "operator1" {
		t.Fatalf("username cursor should carry the username, got %v", c.Str)
	}

	c, err = pagination.DecodeCursor(DefaultUserSort().Cursor(user))
	if err != nil {
		t.Fatalf("decode createAt cursor: %v", err)
	}
	if c.Str != nil {
		t.Fatalf("createAt cursor should not carry a string key, got %q", *c.Str)
	}
	if !c.CreateAt.Equal(user.CreateAt) {
		t.Fatalf("createAt cursor should carry the timestamp, got %v", c.CreateAt)
	}
}
