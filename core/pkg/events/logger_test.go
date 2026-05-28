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

// taskEvent is a test helper that wraps a topic + payload in a bus Event.
func taskEvent(topic eventbus.Topic, p eventbus.TaskEventPayload) eventbus.Event {
	return eventbus.NewEvent(topic, eventbus.UserActor(uuid.NewString()), p)
}

// TestToTaskRow_CreatedBasics confirms that a task.created bus event lands
// in the timeline as a row with the right subject kind, snapshotted name,
// and no metadata.
func TestToTaskRow_CreatedBasics(t *testing.T) {
	l := &Logger{}
	taskID := uuid.New()
	opID := uuid.New()

	row, err := l.toTaskRow(
		taskEvent(eventbus.TopicTaskCreated, eventbus.TaskEventPayload{
			TaskID:      taskID.String(),
			OperationID: opID.String(),
			Name:        "Recon north subnet",
			Stage:       "BACKLOG",
			Status:      "UNDEFINED",
		}),
		models.EventActorUser,
		nil,
	)
	if err != nil {
		t.Fatalf("toTaskRow: unexpected error %v", err)
	}
	if row.SubjectKind != models.SubjectKindTask {
		t.Fatalf("subject_kind: got %v want %v", row.SubjectKind, models.SubjectKindTask)
	}
	if row.SubjectID != taskID {
		t.Fatalf("subject_id: got %v want %v", row.SubjectID, taskID)
	}
	if row.SubjectName != "Recon north subnet" {
		t.Fatalf("subject_name: got %q want %q", row.SubjectName, "Recon north subnet")
	}
	if row.Topic != string(eventbus.TopicTaskCreated) {
		t.Fatalf("topic: got %v want %v", row.Topic, eventbus.TopicTaskCreated)
	}
	if row.Metadata != nil {
		t.Fatalf("expected no metadata on created row, got %v", row.Metadata)
	}
}

// TestToTaskRow_StageChangedCarriesTransition locks in the contract the
// timeline summary depends on — both old_stage and new_stage must be on
// the row so the summary can render "Moved from X to Y" without a
// follow-up lookup.
func TestToTaskRow_StageChangedCarriesTransition(t *testing.T) {
	l := &Logger{}

	row, err := l.toTaskRow(
		taskEvent(eventbus.TopicTaskStageChanged, eventbus.TaskEventPayload{
			TaskID:      uuid.New().String(),
			OperationID: uuid.New().String(),
			Name:        "Privilege escalation path",
			Stage:       "IN_PROCESS",
			Status:      "UNDEFINED",
			OldStage:    "TODO",
		}),
		models.EventActorUser,
		nil,
	)
	if err != nil {
		t.Fatalf("toTaskRow: unexpected error %v", err)
	}
	if row.Metadata["old_stage"] != "TODO" {
		t.Fatalf("metadata.old_stage: got %v want TODO", row.Metadata["old_stage"])
	}
	if row.Metadata["new_stage"] != "IN_PROCESS" {
		t.Fatalf("metadata.new_stage: got %v want IN_PROCESS", row.Metadata["new_stage"])
	}
}

// TestToTaskRow_StatusSetCarriesStatusAndStage locks in that a status-set
// row carries both the chosen status and the stage at which it was set,
// so the timeline can render "Marked SUCCESS while in Done" with full
// context.
func TestToTaskRow_StatusSetCarriesStatusAndStage(t *testing.T) {
	l := &Logger{}

	row, err := l.toTaskRow(
		taskEvent(eventbus.TopicTaskStatusSet, eventbus.TaskEventPayload{
			TaskID:      uuid.New().String(),
			OperationID: uuid.New().String(),
			Name:        "Data exfil dry run",
			Stage:       "DONE",
			Status:      "SUCCESS",
		}),
		models.EventActorUser,
		nil,
	)
	if err != nil {
		t.Fatalf("toTaskRow: unexpected error %v", err)
	}
	if row.Metadata["status"] != "SUCCESS" {
		t.Fatalf("metadata.status: got %v want SUCCESS", row.Metadata["status"])
	}
	if row.Metadata["stage"] != "DONE" {
		t.Fatalf("metadata.stage: got %v want DONE", row.Metadata["stage"])
	}
}

// TestToTaskRow_RejectsWrongPayload guards the type assertion — a non-task
// payload on a task topic must return an error instead of producing a
// garbage row. Defends against future bus refactors crossing the streams.
func TestToTaskRow_RejectsWrongPayload(t *testing.T) {
	l := &Logger{}

	_, err := l.toTaskRow(
		eventbus.NewEvent(eventbus.TopicTaskCreated, eventbus.UserActor(uuid.NewString()),
			eventbus.CredentialEventPayload{
				CredentialID: uuid.NewString(),
				OperationID:  uuid.NewString(),
			}),
		models.EventActorUser,
		nil,
	)
	if err == nil {
		t.Fatalf("expected error on wrong payload type")
	}
}

// TestLogger_TopicsIncludesTaskCoverage is a contract check: every task
// topic in the persisted set must appear in Topics() so the subscriber
// actually receives them at startup. Catches drift between the switch
// arm in toRow and the subscription list.
func TestLogger_TopicsIncludesTaskCoverage(t *testing.T) {
	want := []eventbus.Topic{
		eventbus.TopicTaskCreated,
		eventbus.TopicTaskStageChanged,
		eventbus.TopicTaskStatusSet,
		eventbus.TopicTaskSoftDeleted,
		eventbus.TopicTaskRestored,
		eventbus.TopicTaskHardDeleted,
	}
	got := (&Logger{}).Topics()
	gotSet := make(map[eventbus.Topic]struct{}, len(got))
	for _, t := range got {
		gotSet[t] = struct{}{}
	}
	for _, w := range want {
		if _, ok := gotSet[w]; !ok {
			t.Fatalf("Topics() missing %q — Subscribe will not receive it", w)
		}
	}
}
