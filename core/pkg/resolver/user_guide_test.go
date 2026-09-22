package resolver

import (
	"context"
	"slices"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// guideHarness returns a resolver over one stored user plus a pointer to the
// last update map, so each case can assert what was (or was not) written.
func guideHarness(t *testing.T, stored models.User) (IUserResolver, context.Context, *map[string]interface{}) {
	t.Helper()
	var captured map[string]interface{}
	repo := &mockUserRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.User, error) {
			if id != stored.UserID {
				t.Fatalf("FindByID(%s), want caller %s", id, stored.UserID)
			}
			return stored, nil
		},
		updateFn: func(_ context.Context, _ *models.User, updates map[string]interface{}) error {
			captured = updates
			return nil
		},
	}
	return NewUserResolver(repo, eventbus.NewNopEventBus()), newCallerCtx(stored.UserID, "user"), &captured
}

func TestCompleteGuide_RecordsForCaller(t *testing.T) {
	r, ctx, captured := guideHarness(t, models.User{UserID: uuid.New()})

	if _, err := r.CompleteGuide(ctx, "welcome"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got, ok := (*captured)["completed_guides"].([]string)
	if !ok || !slices.Equal(got, []string{"welcome"}) {
		t.Fatalf("persisted %#v, want completed_guides=[welcome]", *captured)
	}
}

// Each guide is tracked independently: finishing one must not suppress another.
func TestCompleteGuide_AppendsWithoutDisturbingOthers(t *testing.T) {
	r, ctx, captured := guideHarness(t, models.User{
		UserID:          uuid.New(),
		CompletedGuides: []string{"welcome"},
	})

	if _, err := r.CompleteGuide(ctx, "slash-menu"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := (*captured)["completed_guides"].([]string)
	if !slices.Equal(got, []string{"welcome", "slash-menu"}) {
		t.Fatalf("persisted %v, want both guides", got)
	}
}

// Two tabs finishing one guide at the same moment is normal, not an error.
func TestCompleteGuide_IsIdempotent(t *testing.T) {
	r, ctx, captured := guideHarness(t, models.User{
		UserID:          uuid.New(),
		CompletedGuides: []string{"welcome"},
	})

	user, err := r.CompleteGuide(ctx, "welcome")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if *captured != nil {
		t.Fatalf("re-completing wrote %#v", *captured)
	}
	if !slices.Equal(user.CompletedGuides, []string{"welcome"}) {
		t.Fatalf("returned %v, want the list unchanged", user.CompletedGuides)
	}
}

// A typo in the SPA would otherwise store an id nothing reads, suppressing no
// guide at all — a bug that only ever surfaces as "why does it keep coming
// back".
func TestCompleteGuide_RejectsUnknownIDs(t *testing.T) {
	for _, id := range []string{"", "Welcome", "slash_menu", "made-up"} {
		r, ctx, captured := guideHarness(t, models.User{UserID: uuid.New()})
		if _, err := r.CompleteGuide(ctx, id); err == nil {
			t.Errorf("guide %q: expected an error", id)
		}
		if *captured != nil {
			t.Errorf("guide %q: persisted %#v despite the error", id, *captured)
		}
	}
}

func TestCompleteGuide_InvalidToken(t *testing.T) {
	r := NewUserResolver(&mockUserRepo{}, eventbus.NewNopEventBus())
	ctx := gqlctx.WithAuthInfo(context.Background(), gqlctx.AuthInfo{UserID: "not-a-uuid", Roles: []string{"user"}})
	if _, err := r.CompleteGuide(ctx, "welcome"); err == nil {
		t.Fatal("expected error for invalid user ID in token")
	}
}
