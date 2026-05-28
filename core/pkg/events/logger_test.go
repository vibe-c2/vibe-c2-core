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

// TestToTaskRow_StageChangedToDoneCarriesTransition locks in the contract
// the timeline summary depends on — a closure event must carry both
// old_stage and new_stage so the summary can render "Closed from X"
// without a follow-up lookup.
func TestToTaskRow_StageChangedToDoneCarriesTransition(t *testing.T) {
	l := &Logger{}
	taskID := uuid.New()

	row, err := l.toTaskRow(
		taskEvent(eventbus.TopicTaskStageChanged, eventbus.TaskEventPayload{
			TaskID:      taskID.String(),
			OperationID: uuid.New().String(),
			Name:        "Privilege escalation path",
			Stage:       string(models.TaskStageDone),
			Status:      "SUCCESS",
			OldStage:    "IN_PROCESS",
		}),
		models.EventActorUser,
		nil,
	)
	if err != nil {
		t.Fatalf("toTaskRow: unexpected error %v", err)
	}
	if row == nil {
		t.Fatalf("toTaskRow: expected row for DONE transition, got nil")
	}
	if row.SubjectKind != models.SubjectKindTask {
		t.Fatalf("subject_kind: got %v want %v", row.SubjectKind, models.SubjectKindTask)
	}
	if row.SubjectID != taskID {
		t.Fatalf("subject_id: got %v want %v", row.SubjectID, taskID)
	}
	if row.SubjectName != "Privilege escalation path" {
		t.Fatalf("subject_name: got %q", row.SubjectName)
	}
	if row.Metadata["old_stage"] != "IN_PROCESS" {
		t.Fatalf("metadata.old_stage: got %v want IN_PROCESS", row.Metadata["old_stage"])
	}
	if row.Metadata["new_stage"] != string(models.TaskStageDone) {
		t.Fatalf("metadata.new_stage: got %v want DONE", row.Metadata["new_stage"])
	}
}

// TestToTaskRow_StageChangedAwayFromDoneIsDropped guards the closure-only
// invariant: only transitions whose new stage is DONE land on the timeline.
// Re-opening a task (DONE → IN_PROCESS) is intentionally silent.
func TestToTaskRow_StageChangedAwayFromDoneIsDropped(t *testing.T) {
	l := &Logger{}

	for _, newStage := range []string{"BACKLOG", "TODO", "IN_PROCESS"} {
		row, err := l.toTaskRow(
			taskEvent(eventbus.TopicTaskStageChanged, eventbus.TaskEventPayload{
				TaskID:      uuid.New().String(),
				OperationID: uuid.New().String(),
				Name:        "noise",
				Stage:       newStage,
				OldStage:    "DONE",
			}),
			models.EventActorUser,
			nil,
		)
		if err != nil {
			t.Fatalf("toTaskRow(%s): unexpected error %v", newStage, err)
		}
		if row != nil {
			t.Fatalf("toTaskRow(%s): expected nil row (non-DONE transition), got %+v", newStage, row)
		}
	}
}

// TestToTaskRow_RejectsWrongPayload guards the type assertion — a non-task
// payload on a task topic must return an error instead of producing a
// garbage row. Defends against future bus refactors crossing the streams.
func TestToTaskRow_RejectsWrongPayload(t *testing.T) {
	l := &Logger{}

	_, err := l.toTaskRow(
		eventbus.NewEvent(eventbus.TopicTaskStageChanged, eventbus.UserActor(uuid.NewString()),
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

// TestLogger_TopicsClosureOnly is a contract check: the timeline persists
// only task.stage_changed (further narrowed to DONE inside toTaskRow). The
// previously-persisted task creation, status-set, and soft/restore/hard
// delete topics must NOT appear in Topics(). Wiki document creation is
// also no longer persisted.
func TestLogger_TopicsClosureOnly(t *testing.T) {
	got := (&Logger{}).Topics()
	gotSet := make(map[eventbus.Topic]struct{}, len(got))
	for _, topic := range got {
		gotSet[topic] = struct{}{}
	}
	if _, ok := gotSet[eventbus.TopicTaskStageChanged]; !ok {
		t.Fatalf("Topics() missing TopicTaskStageChanged — closures will not persist")
	}
	forbidden := []eventbus.Topic{
		eventbus.TopicTaskCreated,
		eventbus.TopicTaskStatusSet,
		eventbus.TopicTaskSoftDeleted,
		eventbus.TopicTaskRestored,
		eventbus.TopicTaskHardDeleted,
		eventbus.TopicWikiDocumentCreated,
	}
	for _, f := range forbidden {
		if _, ok := gotSet[f]; ok {
			t.Fatalf("Topics() unexpectedly includes %q — timeline would re-receive dropped event", f)
		}
	}
}
