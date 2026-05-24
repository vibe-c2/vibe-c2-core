package events

import (
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// TestDeterministicEventID_StableForSameInputs guards the backfill
// idempotency promise: a re-run with the same (topic, subject_id) must
// produce the same event id, so a unique index on event_id collapses
// duplicate inserts into no-ops.
func TestDeterministicEventID_StableForSameInputs(t *testing.T) {
	id := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	a := deterministicEventID("credential.created", id)
	b := deterministicEventID("credential.created", id)
	if a != b {
		t.Fatalf("expected stable id for same inputs, got %v vs %v", a, b)
	}
}

// TestDeterministicEventID_DifferentTopicsDiffer protects against accidental
// collision between the credential and wiki document seed passes when an
// operator ever shares a UUID between subjects (impossible in practice, but
// the algorithm must guarantee separation regardless).
func TestDeterministicEventID_DifferentTopicsDiffer(t *testing.T) {
	id := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	a := deterministicEventID("credential.created", id)
	b := deterministicEventID("wiki.document.created", id)
	if a == b {
		t.Fatalf("expected different ids for different topics, both = %v", a)
	}
}

// TestTranslateActor covers the three actor flavours: user with a parseable
// id round-trips, malformed user id falls back to a nil id with the user
// type retained, system actors yield nil id.
func TestTranslateActor(t *testing.T) {
	uid := uuid.New()

	cases := []struct {
		name      string
		in        eventbus.Actor
		wantType  models.EventActorType
		wantHasID bool
	}{
		{
			name:      "user with valid id",
			in:        eventbus.UserActor(uid.String()),
			wantType:  models.EventActorUser,
			wantHasID: true,
		},
		{
			name:      "user with malformed id",
			in:        eventbus.UserActor("not-a-uuid"),
			wantType:  models.EventActorUser,
			wantHasID: false,
		},
		{
			name:      "service",
			in:        eventbus.ServiceActor("setupmanager"),
			wantType:  models.EventActorService,
			wantHasID: false,
		},
		{
			name:      "system",
			in:        eventbus.SystemActor(),
			wantType:  models.EventActorSystem,
			wantHasID: false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotType, gotID := translateActor(tc.in)
			if gotType != tc.wantType {
				t.Fatalf("type: got %v want %v", gotType, tc.wantType)
			}
			if (gotID != nil) != tc.wantHasID {
				t.Fatalf("hasID: got %v want %v", gotID != nil, tc.wantHasID)
			}
		})
	}
}

// TestUserActorPtr_NilUUIDBecomesNil prevents writing the all-zero UUID as
// a phantom actor id when the seed source has no recorded creator.
func TestUserActorPtr_NilUUIDBecomesNil(t *testing.T) {
	if got := userActorPtr(uuid.Nil); got != nil {
		t.Fatalf("expected nil for uuid.Nil, got %v", *got)
	}
	uid := uuid.New()
	if got := userActorPtr(uid); got == nil || *got != uid {
		t.Fatalf("expected pointer to %v, got %v", uid, got)
	}
}
