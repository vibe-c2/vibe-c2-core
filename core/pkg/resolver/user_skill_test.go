package resolver

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/mcp/skillchangelog"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// snoozeHarness returns a resolver over one stored user and a pointer to the
// last update map, so each case can assert what was (or was not) persisted.
func snoozeHarness(t *testing.T, stored models.User) (IUserResolver, context.Context, *map[string]interface{}) {
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

func TestSnoozeSkillUpdate_PersistsForCaller(t *testing.T) {
	r, ctx, captured := snoozeHarness(t, models.User{UserID: uuid.New()})

	if _, err := r.SnoozeSkillUpdate(ctx, skillchangelog.Current()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got, ok := (*captured)["skill_update_snoozed_version"].(int)
	if !ok || got != skillchangelog.Current() {
		t.Fatalf("persisted %#v, want skill_update_snoozed_version=%d", *captured, skillchangelog.Current())
	}
}

// A snooze is "I have seen this release". Nobody has seen one that does not
// exist, and accepting it would silence every future prompt.
func TestSnoozeSkillUpdate_RejectsUnknownVersions(t *testing.T) {
	for _, v := range []int{0, -1, skillchangelog.Current() + 1} {
		r, ctx, captured := snoozeHarness(t, models.User{UserID: uuid.New()})
		if _, err := r.SnoozeSkillUpdate(ctx, v); err == nil {
			t.Errorf("version %d: expected an error", v)
		}
		if *captured != nil {
			t.Errorf("version %d: persisted %#v despite the error", v, *captured)
		}
	}
}

// The newest dismissal wins; an older one must not roll it back.
func TestSnoozeSkillUpdate_NeverMovesBackwards(t *testing.T) {
	cur := skillchangelog.Current()
	r, ctx, captured := snoozeHarness(t, models.User{UserID: uuid.New(), SkillUpdateSnoozedVersion: cur})

	user, err := r.SnoozeSkillUpdate(ctx, cur)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if *captured != nil {
		t.Fatalf("re-snoozing the same version wrote %#v", *captured)
	}
	if user.SkillUpdateSnoozedVersion != cur {
		t.Fatalf("returned snoozed version %d, want %d", user.SkillUpdateSnoozedVersion, cur)
	}
}

func TestSnoozeSkillUpdate_InvalidToken(t *testing.T) {
	r := NewUserResolver(&mockUserRepo{}, eventbus.NewNopEventBus())
	ctx := gqlctx.WithAuthInfo(context.Background(), gqlctx.AuthInfo{UserID: "not-a-uuid", Roles: []string{"user"}})
	if _, err := r.SnoozeSkillUpdate(ctx, 1); err == nil {
		t.Fatal("expected error for invalid user ID in token")
	}
}
