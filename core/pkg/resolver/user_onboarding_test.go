package resolver

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// onboardingHarness returns a resolver over one stored user plus a pointer to
// the last update map, so each case can assert what was (or was not) written.
func onboardingHarness(t *testing.T, stored models.User) (IUserResolver, context.Context, *map[string]interface{}) {
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

func TestCompleteOnboarding_StampsTheCaller(t *testing.T) {
	before := time.Now().UTC()
	r, ctx, captured := onboardingHarness(t, models.User{UserID: uuid.New()})

	if _, err := r.CompleteOnboarding(ctx); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	at, ok := (*captured)["onboarding_completed_at"].(time.Time)
	if !ok {
		t.Fatalf("persisted %#v, want onboarding_completed_at as a time.Time", *captured)
	}
	if at.Before(before) || at.After(time.Now().UTC().Add(time.Second)) {
		t.Fatalf("stamped %s, want a timestamp from this call", at)
	}
}

// The stored value is when they *first* got through the guide, so a second
// call must leave it alone rather than sliding it forward.
func TestCompleteOnboarding_IsSetOnce(t *testing.T) {
	first := time.Now().UTC().Add(-48 * time.Hour)
	r, ctx, captured := onboardingHarness(t, models.User{
		UserID:                uuid.New(),
		OnboardingCompletedAt: &first,
	})

	user, err := r.CompleteOnboarding(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if *captured != nil {
		t.Fatalf("re-completing wrote %#v", *captured)
	}
	if user.OnboardingCompletedAt == nil || !user.OnboardingCompletedAt.Equal(first) {
		t.Fatalf("returned %v, want the original %s", user.OnboardingCompletedAt, first)
	}
}

func TestCompleteOnboarding_InvalidToken(t *testing.T) {
	r := NewUserResolver(&mockUserRepo{}, eventbus.NewNopEventBus())
	ctx := gqlctx.WithAuthInfo(context.Background(), gqlctx.AuthInfo{UserID: "not-a-uuid", Roles: []string{"user"}})
	if _, err := r.CompleteOnboarding(ctx); err == nil {
		t.Fatal("expected error for invalid user ID in token")
	}
}
