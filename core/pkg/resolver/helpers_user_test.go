package resolver

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

type stubUserFinder struct {
	user models.User
	err  error
}

func (s stubUserFinder) FindByID(_ context.Context, _ uuid.UUID) (models.User, error) {
	return s.user, s.err
}

// TestLoadNullableUser is the regression test for the bug behind the
// ErrNotFound sentinel: every nullable user reference used to return null for
// any error, so a database that did not answer was indistinguishable from an
// account that was deleted. Under load — exactly when queries time out — a
// page of rows would quietly lose its names with nothing logged or returned.
func TestLoadNullableUser(t *testing.T) {
	id := uuid.New()

	t.Run("nil id resolves to null without a lookup", func(t *testing.T) {
		// A nil reference is absence by definition; hitting the DB for it
		// would be a wasted query per row.
		finder := stubUserFinder{err: errors.New("must not be called")}
		got, err := loadNullableUser(context.Background(), finder, uuid.Nil, "creator")
		if err != nil || got != nil {
			t.Fatalf("got (%v, %v), want (nil, nil)", got, err)
		}
	})

	t.Run("deleted account resolves to null", func(t *testing.T) {
		for name, missErr := range map[string]error{
			"repository sentinel": repository.ErrNotFound,
			"qmgo miss":           qmgo.ErrNoSuchDocuments,
		} {
			t.Run(name, func(t *testing.T) {
				finder := stubUserFinder{err: missErr}
				got, err := loadNullableUser(context.Background(), finder, id, "creator")
				if err != nil {
					t.Fatalf("a deleted account must not be an error, got %v", err)
				}
				if got != nil {
					t.Fatalf("expected null, got %+v", got)
				}
			})
		}
	})

	t.Run("database failure surfaces as an error", func(t *testing.T) {
		// The whole point: this must not render as a deleted account.
		finder := stubUserFinder{err: errors.New("context deadline exceeded")}
		got, err := loadNullableUser(context.Background(), finder, id, "task creator")
		if err == nil {
			t.Fatal("a timeout must surface, not render as a deleted account")
		}
		if got != nil {
			t.Fatalf("expected no user on error, got %+v", got)
		}
		if !strings.Contains(err.Error(), "task creator") {
			t.Errorf("error should name the reference, got: %v", err)
		}
		if !strings.Contains(err.Error(), "context deadline exceeded") {
			t.Errorf("error should wrap the cause, got: %v", err)
		}
	})

	t.Run("present user resolves", func(t *testing.T) {
		finder := stubUserFinder{user: models.User{UserID: id, Username: "alice"}}
		got, err := loadNullableUser(context.Background(), finder, id, "creator")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got == nil || got.Username != "alice" {
			t.Fatalf("got %+v, want alice", got)
		}
	})
}
