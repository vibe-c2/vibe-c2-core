package resolver

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// mockOperationEventRepo is a function-field mock of
// IOperationEventRepository — same pattern as the credential mocks above.
type mockOperationEventRepo struct {
	insertFn            func(ctx context.Context, e *models.OperationEvent) error
	findByEventIDFn     func(ctx context.Context, id uuid.UUID) (models.OperationEvent, error)
	updateCustomEventFn func(ctx context.Context, id uuid.UUID, upd repository.CustomEventUpdate) (models.OperationEvent, error)
	deleteCustomEventFn func(ctx context.Context, id uuid.UUID) error
}

func (m *mockOperationEventRepo) Insert(ctx context.Context, e *models.OperationEvent) error {
	return m.insertFn(ctx, e)
}
func (m *mockOperationEventRepo) InsertMany(_ context.Context, _ []*models.OperationEvent) error {
	panic("InsertMany not used")
}
func (m *mockOperationEventRepo) FindByEventID(ctx context.Context, id uuid.UUID) (models.OperationEvent, error) {
	return m.findByEventIDFn(ctx, id)
}
func (m *mockOperationEventRepo) Buckets(_ context.Context, _ repository.BucketQuery) ([]repository.Bucket, error) {
	panic("Buckets not used")
}
func (m *mockOperationEventRepo) ListByDay(_ context.Context, _ repository.DayQuery) ([]models.OperationEvent, pagination.PageInfo, error) {
	panic("ListByDay not used")
}
func (m *mockOperationEventRepo) IsEmpty(_ context.Context) (bool, error) {
	panic("IsEmpty not used")
}
func (m *mockOperationEventRepo) UpdateCustomEvent(ctx context.Context, id uuid.UUID, upd repository.CustomEventUpdate) (models.OperationEvent, error) {
	return m.updateCustomEventFn(ctx, id, upd)
}
func (m *mockOperationEventRepo) DeleteCustomEvent(ctx context.Context, id uuid.UUID) error {
	return m.deleteCustomEventFn(ctx, id)
}

var _ repository.IOperationEventRepository = (*mockOperationEventRepo)(nil)

// newTimelineResolverForTest wires the resolver with a NopEventBus so
// publish calls don't block the test. Caller passes the three mocks they
// need; user repo defaults to a stub since custom-event mutations don't
// resolve actors during the mutation itself.
func newTimelineResolverForTest(
	evRepo repository.IOperationEventRepository,
	opRepo repository.IOperationRepository,
) ITimelineResolver {
	return NewTimelineResolver(evRepo, opRepo, &mockUserRepo{}, eventbus.NewNopEventBus())
}

func ptr[T any](v T) *T { return &v }

// TestCreateCustomTimelineEvent_OperatorSucceeds verifies the happy path:
// an operator can create a row, the row gets the correct subject_kind,
// subject_id == event_id, and description lands in metadata.
func TestCreateCustomTimelineEvent_OperatorSucceeds(t *testing.T) {
	caller := uuid.New()
	opID := uuid.New()

	var inserted *models.OperationEvent
	evRepo := &mockOperationEventRepo{
		insertFn: func(_ context.Context, e *models.OperationEvent) error {
			inserted = e
			return nil
		},
	}
	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			return memberOp(id, caller, models.OperationRoleOperator), nil
		},
	}

	r := newTimelineResolverForTest(evRepo, opRepo)
	ctx := newCallerCtx(caller)

	row, err := r.CreateCustomTimelineEvent(ctx, opID.String(), model.CreateCustomTimelineEventInput{
		Name:        "Phishing campaign launched",
		Description: ptr("Sent 200 emails to target list."),
		OccurredAt:  "2026-05-23T14:30:00Z",
	})
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if row == nil || inserted == nil {
		t.Fatalf("expected an inserted row")
	}
	if row.SubjectKind != models.SubjectKindCustomEvent {
		t.Fatalf("subject_kind: got %q, want custom_event", row.SubjectKind)
	}
	if row.SubjectID != row.EventID {
		t.Fatalf("subject_id must equal event_id for custom events")
	}
	if row.SubjectName != "Phishing campaign launched" {
		t.Fatalf("subject_name: got %q", row.SubjectName)
	}
	if row.Metadata["description"] != "Sent 200 emails to target list." {
		t.Fatalf("description not stored in metadata: %v", row.Metadata)
	}
	if row.ActorID == nil || *row.ActorID != caller {
		t.Fatalf("actor_id: got %v, want %v", row.ActorID, caller)
	}
	wantTime := time.Date(2026, 5, 23, 14, 30, 0, 0, time.UTC)
	if !row.OccurredAt.Equal(wantTime) {
		t.Fatalf("occurred_at: got %v, want %v", row.OccurredAt, wantTime)
	}
}

// TestCreateCustomTimelineEvent_ViewerForbidden — a viewer cannot annotate.
func TestCreateCustomTimelineEvent_ViewerForbidden(t *testing.T) {
	caller := uuid.New()
	opID := uuid.New()

	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			return memberOp(id, caller, models.OperationRoleViewer), nil
		},
	}
	r := newTimelineResolverForTest(&mockOperationEventRepo{}, opRepo)
	ctx := newCallerCtx(caller)

	_, err := r.CreateCustomTimelineEvent(ctx, opID.String(), model.CreateCustomTimelineEventInput{
		Name:       "test",
		OccurredAt: "2026-05-23T14:30:00Z",
	})
	if err == nil {
		t.Fatalf("expected forbidden, got nil")
	}
	if !strings.Contains(err.Error(), "operator") {
		t.Fatalf("expected operator-role error, got %v", err)
	}
}

// TestCreateCustomTimelineEvent_BlankName rejects an empty title.
func TestCreateCustomTimelineEvent_BlankName(t *testing.T) {
	caller := uuid.New()
	opID := uuid.New()

	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			return memberOp(id, caller, models.OperationRoleOperator), nil
		},
	}
	r := newTimelineResolverForTest(&mockOperationEventRepo{}, opRepo)
	ctx := newCallerCtx(caller)

	_, err := r.CreateCustomTimelineEvent(ctx, opID.String(), model.CreateCustomTimelineEventInput{
		Name:       "   ",
		OccurredAt: "2026-05-23T14:30:00Z",
	})
	if err == nil || !strings.Contains(err.Error(), "name") {
		t.Fatalf("expected name-required error, got %v", err)
	}
}

// TestCreateCustomTimelineEvent_InvalidDate rejects junk timestamps so the
// frontend hears about a bad form value instead of writing a zero time.
func TestCreateCustomTimelineEvent_InvalidDate(t *testing.T) {
	caller := uuid.New()
	opID := uuid.New()

	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			return memberOp(id, caller, models.OperationRoleOperator), nil
		},
	}
	r := newTimelineResolverForTest(&mockOperationEventRepo{}, opRepo)
	ctx := newCallerCtx(caller)

	_, err := r.CreateCustomTimelineEvent(ctx, opID.String(), model.CreateCustomTimelineEventInput{
		Name:       "ok",
		OccurredAt: "not-a-date",
	})
	if err == nil || !strings.Contains(err.Error(), "occurredAt") {
		t.Fatalf("expected occurredAt error, got %v", err)
	}
}

// TestUpdateCustomTimelineEvent_AuthorEditsOwn — author can edit their row.
func TestUpdateCustomTimelineEvent_AuthorEditsOwn(t *testing.T) {
	caller := uuid.New()
	opID := uuid.New()
	eventID := uuid.New()

	existing := models.OperationEvent{
		EventID:     eventID,
		OperationID: opID,
		Topic:       customEventTopic,
		SubjectKind: models.SubjectKindCustomEvent,
		SubjectID:   eventID,
		SubjectName: "old",
		ActorType:   models.EventActorUser,
		ActorID:     &caller,
	}
	var capturedUpd repository.CustomEventUpdate
	evRepo := &mockOperationEventRepo{
		findByEventIDFn: func(_ context.Context, _ uuid.UUID) (models.OperationEvent, error) {
			return existing, nil
		},
		updateCustomEventFn: func(_ context.Context, _ uuid.UUID, upd repository.CustomEventUpdate) (models.OperationEvent, error) {
			capturedUpd = upd
			out := existing
			if upd.Name != nil {
				out.SubjectName = *upd.Name
			}
			return out, nil
		},
	}
	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			return memberOp(id, caller, models.OperationRoleOperator), nil
		},
	}

	r := newTimelineResolverForTest(evRepo, opRepo)
	ctx := newCallerCtx(caller)

	updated, err := r.UpdateCustomTimelineEvent(ctx, eventID.String(), model.UpdateCustomTimelineEventInput{
		Name: ptr("new title"),
	})
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if updated.SubjectName != "new title" {
		t.Fatalf("subject_name not updated: %q", updated.SubjectName)
	}
	if capturedUpd.Name == nil || *capturedUpd.Name != "new title" {
		t.Fatalf("name not passed to repo: %+v", capturedUpd)
	}
}

// TestUpdateCustomTimelineEvent_NonAuthorForbidden — a peer operator can't
// rewrite someone else's annotation.
func TestUpdateCustomTimelineEvent_NonAuthorForbidden(t *testing.T) {
	caller := uuid.New()
	otherAuthor := uuid.New()
	opID := uuid.New()
	eventID := uuid.New()

	evRepo := &mockOperationEventRepo{
		findByEventIDFn: func(_ context.Context, _ uuid.UUID) (models.OperationEvent, error) {
			return models.OperationEvent{
				EventID:     eventID,
				OperationID: opID,
				SubjectKind: models.SubjectKindCustomEvent,
				ActorID:     &otherAuthor,
			}, nil
		},
	}
	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			return memberOp(id, caller, models.OperationRoleOperator), nil
		},
	}

	r := newTimelineResolverForTest(evRepo, opRepo)
	ctx := newCallerCtx(caller)

	_, err := r.UpdateCustomTimelineEvent(ctx, eventID.String(), model.UpdateCustomTimelineEventInput{
		Name: ptr("hijack"),
	})
	if err == nil || !strings.Contains(err.Error(), "author or an admin") {
		t.Fatalf("expected author-or-admin error, got %v", err)
	}
}

// TestUpdateCustomTimelineEvent_AppAdminBypassesAuthor — app admins can
// edit any custom event regardless of authorship (matches the rest of
// the codebase's app-admin bypass).
func TestUpdateCustomTimelineEvent_AppAdminBypassesAuthor(t *testing.T) {
	admin := uuid.New()
	otherAuthor := uuid.New()
	opID := uuid.New()
	eventID := uuid.New()

	evRepo := &mockOperationEventRepo{
		findByEventIDFn: func(_ context.Context, _ uuid.UUID) (models.OperationEvent, error) {
			return models.OperationEvent{
				EventID:     eventID,
				OperationID: opID,
				SubjectKind: models.SubjectKindCustomEvent,
				ActorID:     &otherAuthor,
			}, nil
		},
		updateCustomEventFn: func(_ context.Context, _ uuid.UUID, _ repository.CustomEventUpdate) (models.OperationEvent, error) {
			return models.OperationEvent{EventID: eventID, OperationID: opID, SubjectKind: models.SubjectKindCustomEvent}, nil
		},
	}
	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			// Admin isn't a member, but app-admin role short-circuits.
			return strangerOp(id), nil
		},
	}

	r := newTimelineResolverForTest(evRepo, opRepo)
	ctx := newCallerCtx(admin, "admin")

	if _, err := r.UpdateCustomTimelineEvent(ctx, eventID.String(), model.UpdateCustomTimelineEventInput{
		Name: ptr("admin override"),
	}); err != nil {
		t.Fatalf("admin should bypass authorship, got %v", err)
	}
}

// TestUpdateCustomTimelineEvent_RejectsSystemEvent — guarded against
// forged ids that resolve to a credential.created row.
func TestUpdateCustomTimelineEvent_RejectsSystemEvent(t *testing.T) {
	caller := uuid.New()
	opID := uuid.New()
	eventID := uuid.New()

	evRepo := &mockOperationEventRepo{
		findByEventIDFn: func(_ context.Context, _ uuid.UUID) (models.OperationEvent, error) {
			return models.OperationEvent{
				EventID:     eventID,
				OperationID: opID,
				SubjectKind: models.SubjectKindCredential, // not editable
				ActorID:     &caller,
			}, nil
		},
	}

	r := newTimelineResolverForTest(evRepo, &mockOpRepo{})
	ctx := newCallerCtx(caller)

	_, err := r.UpdateCustomTimelineEvent(ctx, eventID.String(), model.UpdateCustomTimelineEventInput{
		Name: ptr("nope"),
	})
	if err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("expected not-found masking, got %v", err)
	}
}

// TestDeleteCustomTimelineEvent_AuthorOK — author can delete their event.
func TestDeleteCustomTimelineEvent_AuthorOK(t *testing.T) {
	caller := uuid.New()
	opID := uuid.New()
	eventID := uuid.New()

	deleteCalled := false
	evRepo := &mockOperationEventRepo{
		findByEventIDFn: func(_ context.Context, _ uuid.UUID) (models.OperationEvent, error) {
			return models.OperationEvent{
				EventID:     eventID,
				OperationID: opID,
				SubjectKind: models.SubjectKindCustomEvent,
				ActorID:     &caller,
			}, nil
		},
		deleteCustomEventFn: func(_ context.Context, id uuid.UUID) error {
			if id != eventID {
				return errors.New("wrong id")
			}
			deleteCalled = true
			return nil
		},
	}
	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			return memberOp(id, caller, models.OperationRoleOperator), nil
		},
	}

	r := newTimelineResolverForTest(evRepo, opRepo)
	ctx := newCallerCtx(caller)

	ok, err := r.DeleteCustomTimelineEvent(ctx, eventID.String())
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if !ok || !deleteCalled {
		t.Fatalf("delete did not reach repo")
	}
}
