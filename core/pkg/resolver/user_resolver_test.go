package resolver

import (
	"context"
	"reflect"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// normalizeHiddenIdentities is the canonicalizer the SetHiddenIdentities
// mutation applies before persisting — trim, lowercase, dedupe (first-seen
// order), drop empties, cap length. The frontend relies on stored names being
// normalized so it can match case-insensitively without re-normalizing.
func TestNormalizeHiddenIdentities(t *testing.T) {
	tests := []struct {
		name string
		in   []string
		want []string
	}{
		{
			name: "trims and lowercases",
			in:   []string{"  Default ", "ROOT"},
			want: []string{"default", "root"},
		},
		{
			name: "dedupes case-insensitively, first-seen order wins",
			in:   []string{"default", "Default", "svc", "DEFAULT"},
			want: []string{"default", "svc"},
		},
		{
			name: "drops empties and whitespace-only",
			in:   []string{"", "   ", "default"},
			want: []string{"default"},
		},
		{
			name: "empty input yields non-nil empty slice",
			in:   []string{},
			want: []string{},
		},
		{
			name: "nil input yields non-nil empty slice",
			in:   nil,
			want: []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeHiddenIdentities(tt.in)
			if got == nil {
				t.Fatal("expected non-nil slice, got nil")
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("normalizeHiddenIdentities(%v) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestNormalizeHiddenIdentitiesCap(t *testing.T) {
	in := make([]string, maxHiddenIdentities+50)
	for i := range in {
		in[i] = "user-" + uuid.NewString() // all unique, so none are deduped away
	}
	got := normalizeHiddenIdentities(in)
	if len(got) != maxHiddenIdentities {
		t.Fatalf("expected length capped at %d, got %d", maxHiddenIdentities, len(got))
	}
}

// SetHiddenIdentities must target the user from the JWT, never anything in the
// client payload, and must persist the normalized list under hidden_identities.
func TestSetHiddenIdentities(t *testing.T) {
	callerID := uuid.New()
	caller := models.User{UserID: callerID, Username: "operator"}

	var (
		findByIDCalls   []uuid.UUID
		capturedUpdates map[string]interface{}
	)

	repo := &mockUserRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.User, error) {
			findByIDCalls = append(findByIDCalls, id)
			return caller, nil
		},
		updateFn: func(_ context.Context, _ *models.User, updates map[string]interface{}) error {
			capturedUpdates = updates
			return nil
		},
	}

	r := NewUserResolver(repo, eventbus.NewNopEventBus())
	ctx := newCallerCtx(callerID, "user")

	got, err := r.SetHiddenIdentities(ctx, []string{" Default ", "ROOT", "default"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got == nil {
		t.Fatal("expected updated user, got nil")
	}

	// Targeted the JWT user, not a client-supplied id.
	for _, id := range findByIDCalls {
		if id != callerID {
			t.Fatalf("FindByID called with %s, want caller %s", id, callerID)
		}
	}

	// Persisted the normalized list under the right bson field.
	stored, ok := capturedUpdates["hidden_identities"].([]string)
	if !ok {
		t.Fatalf("hidden_identities not set as []string in update map: %#v", capturedUpdates)
	}
	want := []string{"default", "root"}
	if !reflect.DeepEqual(stored, want) {
		t.Fatalf("stored = %v, want %v", stored, want)
	}
}

func TestSetHiddenIdentitiesInvalidToken(t *testing.T) {
	repo := &mockUserRepo{}
	r := NewUserResolver(repo, eventbus.NewNopEventBus())
	ctx := gqlctx.WithAuthInfo(context.Background(), gqlctx.AuthInfo{
		UserID: "not-a-uuid",
		Roles:  []string{"user"},
	})

	if _, err := r.SetHiddenIdentities(ctx, []string{"x"}); err == nil {
		t.Fatal("expected error for invalid user ID in token, got nil")
	}
}
