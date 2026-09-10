package resolver

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// Actor is what every existing timeline render site reads. It returned nil for
// anything but a plain user, so agent rows fell through to "System" in the UI —
// while the schema documented that they resolve to the key's owner. The code
// and the contract disagreed, and the contract was the honest one.
func TestTimelineActor_ResolvesForAgentRows(t *testing.T) {
	owner := uuid.New()
	// Reuses the package's existing IUserRepository mock rather than adding a
	// second fake that would have to track the interface separately.
	users := &mockUserRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.User, error) {
			if id != owner {
				return models.User{}, errNotFoundStub
			}
			return models.User{UserID: owner, Username: "alice"}, nil
		},
	}
	r := &timelineResolver{userRepo: users}

	cases := []struct {
		name      string
		row       models.OperationEvent
		wantUser  string
		wantKind  string
		wantLabel string
	}{
		{
			name:      "a person",
			row:       models.OperationEvent{ActorType: models.EventActorUser, ActorID: &owner},
			wantUser:  "alice",
			wantKind:  "user",
			wantLabel: "alice",
		},
		{
			// The owner, so actor filters and avatars keep working, with the
			// agent named alongside so the two are still distinguishable.
			name: "an agent acting for that person",
			row: models.OperationEvent{
				ActorType: models.EventActorAgent,
				ActorID:   &owner,
				ActorName: "Claude",
			},
			wantUser:  "alice",
			wantKind:  "agent",
			wantLabel: "Claude (via alice)",
		},
		{
			name:      "a service",
			row:       models.OperationEvent{ActorType: models.EventActorService, ActorName: "hocuspocus"},
			wantUser:  "",
			wantKind:  "service",
			wantLabel: "hocuspocus",
		},
		{
			name:     "the system",
			row:      models.OperationEvent{ActorType: models.EventActorSystem},
			wantUser: "",
			wantKind: "system",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			row := tc.row

			user, err := r.Actor(context.Background(), &row)
			if err != nil {
				t.Fatalf("Actor: %v", err)
			}
			got := ""
			if user != nil {
				got = user.Username
			}
			if got != tc.wantUser {
				t.Errorf("Actor username = %q, want %q", got, tc.wantUser)
			}

			kind, err := r.ActorKind(context.Background(), &row)
			if err != nil {
				t.Fatalf("ActorKind: %v", err)
			}
			if kind != tc.wantKind {
				t.Errorf("ActorKind = %q, want %q", kind, tc.wantKind)
			}

			label, err := r.ActorLabel(context.Background(), &row)
			if err != nil {
				t.Fatalf("ActorLabel: %v", err)
			}
			if label != tc.wantLabel {
				t.Errorf("ActorLabel = %q, want %q", label, tc.wantLabel)
			}
		})
	}
}

// A marker an agent created must not read as one the operator typed. Claiming
// on a shared timeline that a person did something they did not do is worse
// than the anonymous "System" it used to render as elsewhere.
func TestCustomEventActor(t *testing.T) {
	human := gqlctx.AuthInfo{UserID: uuid.New().String(), Username: "alice"}
	agent := human
	agent.Agent = &gqlctx.AgentInfo{Name: "Claude", MaxRole: models.OperationRoleOperator}

	if got := customEventActorType(human); got != models.EventActorUser {
		t.Errorf("human actor type = %q, want user", got)
	}
	if got := customEventActorName(human); got != "" {
		t.Errorf("human actor name = %q, want empty", got)
	}

	if got := customEventActorType(agent); got != models.EventActorAgent {
		t.Errorf("agent actor type = %q, want agent — a marker an agent made "+
			"would otherwise be indistinguishable from a hand-typed one", got)
	}
	if got := customEventActorName(agent); got != "Claude" {
		t.Errorf("agent actor name = %q, want Claude", got)
	}
}
