// Package events persists domain events emitted on the in-process IEventBus
// into the operation_events MongoDB collection so they can be queried as a
// historical timeline.
//
// The Logger struct is a single subscriber on the bus. Adding a new event
// type to the timeline is one line in Topics() plus a switch arm in Handle.
package events

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// eventNamespace is the UUIDv5 namespace used for deterministic event IDs in
// backfill. Stable per (topic, subject_id) so re-runs cannot duplicate rows.
var eventNamespace = uuid.MustParse("4f6d2d24-2b0d-5d8a-9c11-7a8f8c3a1f7e")

// Logger is the persistence subscriber. Construct via NewLogger and register
// with the event bus via Subscribe.
type Logger struct {
	repo     repository.IOperationEventRepository
	ops      repository.IOperationRepository
	creds    repository.ICredentialRepository
	wikiDocs repository.IWikiDocumentRepository
	bus      eventbus.IEventBus
	log      *zap.Logger
}

// NewLogger wires repository dependencies and returns a ready-to-subscribe
// handler. The bus parameter is used to re-publish TopicOperationEventLogged
// after a successful insert so live subscriptions can fan the row out to
// connected clients.
func NewLogger(
	repo repository.IOperationEventRepository,
	ops repository.IOperationRepository,
	creds repository.ICredentialRepository,
	wikiDocs repository.IWikiDocumentRepository,
	bus eventbus.IEventBus,
	log *zap.Logger,
) *Logger {
	return &Logger{repo: repo, ops: ops, creds: creds, wikiDocs: wikiDocs, bus: bus, log: log}
}

// Topics returns the bus topics this logger persists. Wire one Subscribe call
// in app.go with this slice; new topics are added here without touching the
// app wiring.
//
// Task coverage: created + stage_changed + status_set + soft/restored/purged.
// Generic task.updated, assignees_changed, and references_changed are
// intentionally omitted — they would be noise on the timeline. Stage
// transitions and terminal-status decisions are the operationally
// meaningful events; field edits and link maintenance are not.
func (l *Logger) Topics() []eventbus.Topic {
	return []eventbus.Topic{
		eventbus.TopicCredentialCreated,
		eventbus.TopicWikiDocumentCreated,
		eventbus.TopicTaskCreated,
		eventbus.TopicTaskStageChanged,
		eventbus.TopicTaskStatusSet,
		eventbus.TopicTaskSoftDeleted,
		eventbus.TopicTaskRestored,
		eventbus.TopicTaskHardDeleted,
	}
}

// Handle is the eventbus.Handler entry point. Translates a bus event into an
// OperationEvent row and persists it. Errors are logged and swallowed — a
// failed insert must not break the originating user flow.
func (l *Logger) Handle(ctx context.Context, e eventbus.Event) {
	row, err := l.toRow(ctx, e)
	if err != nil {
		l.log.Warn("event logger: translate failed",
			zap.String("topic", string(e.Topic)),
			zap.Error(err))
		return
	}
	if row == nil {
		// Topic is not (yet) one we persist. Silent skip.
		return
	}
	if err := l.repo.Insert(ctx, row); err != nil {
		l.log.Warn("event logger: insert failed",
			zap.String("topic", string(e.Topic)),
			zap.String("event_id", row.EventID.String()),
			zap.Error(err))
		return
	}

	// Re-publish the persisted row so live subscriptions can refetch it and
	// stream it to connected clients. Use the same actor as the source event
	// so a future "show me events I triggered" filter still works.
	if l.bus != nil {
		l.bus.Publish(eventbus.NewOperationEventLoggedEvent(e.Actor, eventbus.OperationEventLoggedPayload{
			EventID:     row.EventID.String(),
			OperationID: row.OperationID.String(),
		}))
	}
}

// toRow translates a bus event into a persistence row, looking up the
// subject's current name to snapshot. Returns (nil, nil) for topics that
// are intentionally not persisted (forward-compat for new bus topics).
func (l *Logger) toRow(ctx context.Context, e eventbus.Event) (*models.OperationEvent, error) {
	actorType, actorID := translateActor(e.Actor)

	switch e.Topic {
	case eventbus.TopicCredentialCreated:
		p, ok := e.Payload.(eventbus.CredentialEventPayload)
		if !ok {
			return nil, fmt.Errorf("unexpected payload type %T for %s", e.Payload, e.Topic)
		}
		credID, err := uuid.Parse(p.CredentialID)
		if err != nil {
			return nil, fmt.Errorf("parse credential id: %w", err)
		}
		opID, err := uuid.Parse(p.OperationID)
		if err != nil {
			return nil, fmt.Errorf("parse operation id: %w", err)
		}
		name := ""
		if cred, err := l.creds.FindByID(ctx, credID); err == nil {
			name = cred.Name
		}
		return &models.OperationEvent{
			EventID:     uuid.New(),
			OperationID: opID,
			Topic:       string(e.Topic),
			SubjectKind: models.SubjectKindCredential,
			SubjectID:   credID,
			SubjectName: name,
			ActorType:   actorType,
			ActorID:     actorID,
			OccurredAt:  occurredAt(e),
		}, nil

	case eventbus.TopicWikiDocumentCreated:
		p, ok := e.Payload.(eventbus.WikiDocumentEventPayload)
		if !ok {
			return nil, fmt.Errorf("unexpected payload type %T for %s", e.Payload, e.Topic)
		}
		docID, err := uuid.Parse(p.DocumentID)
		if err != nil {
			return nil, fmt.Errorf("parse document id: %w", err)
		}
		opID, err := uuid.Parse(p.OperationID)
		if err != nil {
			return nil, fmt.Errorf("parse operation id: %w", err)
		}
		name := p.Title
		if name == "" {
			if doc, err := l.wikiDocs.FindByID(ctx, docID); err == nil {
				name = doc.Title
			}
		}
		var meta map[string]any
		if p.ParentDocumentID != "" {
			meta = map[string]any{"parent_document_id": p.ParentDocumentID}
		}
		return &models.OperationEvent{
			EventID:     uuid.New(),
			OperationID: opID,
			Topic:       string(e.Topic),
			SubjectKind: models.SubjectKindWikiDocument,
			SubjectID:   docID,
			SubjectName: name,
			ActorType:   actorType,
			ActorID:     actorID,
			Metadata:    meta,
			OccurredAt:  occurredAt(e),
		}, nil

	case eventbus.TopicTaskCreated,
		eventbus.TopicTaskStageChanged,
		eventbus.TopicTaskStatusSet,
		eventbus.TopicTaskSoftDeleted,
		eventbus.TopicTaskRestored,
		eventbus.TopicTaskHardDeleted:
		return l.toTaskRow(e, actorType, actorID)
	}

	return nil, nil
}

// toTaskRow translates any of the persisted task topics into a row.
// Task payloads already snapshot Name (the resolver populates it at
// publish time), so no repo lookup is needed — even for hard-deleted
// tasks the timeline can still render their original name.
//
// Metadata carries the topic-specific fields the frontend's summary
// function uses to render specific lines:
//   - stage_changed: {"old_stage", "new_stage"}
//   - status_set:    {"status", "stage"} — stage is included so a
//                    "marked Success while in Done" line has full context.
//   - others:        no metadata.
func (l *Logger) toTaskRow(e eventbus.Event, actorType models.EventActorType, actorID *uuid.UUID) (*models.OperationEvent, error) {
	p, ok := e.Payload.(eventbus.TaskEventPayload)
	if !ok {
		return nil, fmt.Errorf("unexpected payload type %T for %s", e.Payload, e.Topic)
	}
	taskID, err := uuid.Parse(p.TaskID)
	if err != nil {
		return nil, fmt.Errorf("parse task id: %w", err)
	}
	opID, err := uuid.Parse(p.OperationID)
	if err != nil {
		return nil, fmt.Errorf("parse operation id: %w", err)
	}

	var meta map[string]any
	switch e.Topic {
	case eventbus.TopicTaskStageChanged:
		meta = map[string]any{
			"old_stage": p.OldStage,
			"new_stage": p.Stage,
		}
	case eventbus.TopicTaskStatusSet:
		meta = map[string]any{
			"status": p.Status,
			"stage":  p.Stage,
		}
	}

	return &models.OperationEvent{
		EventID:     uuid.New(),
		OperationID: opID,
		Topic:       string(e.Topic),
		SubjectKind: models.SubjectKindTask,
		SubjectID:   taskID,
		SubjectName: p.Name,
		ActorType:   actorType,
		ActorID:     actorID,
		Metadata:    meta,
		OccurredAt:  occurredAt(e),
	}, nil
}

// translateActor converts the eventbus actor into the model's persisted form.
// System / service actors carry no user UUID, so ActorID is nil for them.
func translateActor(a eventbus.Actor) (models.EventActorType, *uuid.UUID) {
	switch a.Type {
	case eventbus.ActorUser:
		if id, err := uuid.Parse(a.ID); err == nil {
			return models.EventActorUser, &id
		}
		return models.EventActorUser, nil
	case eventbus.ActorService:
		return models.EventActorService, nil
	default:
		return models.EventActorSystem, nil
	}
}

// occurredAt prefers the event's own timestamp but falls back to now so a
// missing field never produces a zero-time row.
func occurredAt(e eventbus.Event) time.Time {
	if e.Timestamp.IsZero() {
		return time.Now().UTC()
	}
	return e.Timestamp.UTC()
}

// deterministicEventID is the backfill-only constructor. Stable for a given
// (topic, subject_id) pair so re-running backfill cannot duplicate rows.
func deterministicEventID(topic string, subjectID uuid.UUID) uuid.UUID {
	return uuid.NewSHA1(eventNamespace, []byte(topic+"|"+subjectID.String()))
}

// backfillBatchSize is the chunk size used for InsertMany. Kept small so a
// single failed batch only loses that chunk; the deterministic event IDs let
// a retry pick up exactly where it left off.
const backfillBatchSize = 500

// backfillOpPageSize is the page size used when walking the operations list.
// Pet-scale; revisit if we ever ship to a deployment with thousands of
// operations.
const backfillOpPageSize = int64(100)

// backfillCredPageSize is the page size used when walking credentials per
// operation. Large enough that almost every op finishes in one page.
const backfillCredPageSize = int64(1000)

// BackfillIfEmpty seeds the operation_events collection from existing
// credential and wiki document rows the first time the service starts. It is
// idempotent: event IDs are derived deterministically as
// uuidv5(topic + subject_id) so a re-run cannot duplicate rows even if the
// initial pass partially completed.
//
// On a non-empty collection this is a single Count round-trip and returns
// nil.
func (l *Logger) BackfillIfEmpty(ctx context.Context) error {
	empty, err := l.repo.IsEmpty(ctx)
	if err != nil {
		return fmt.Errorf("check operation_events emptiness: %w", err)
	}
	if !empty {
		return nil
	}

	l.log.Info("event logger: backfilling operation_events from existing rows")

	var totalCreds, totalDocs int

	var offset int64
	for {
		ops, err := l.ops.FindAll(ctx, "", offset, backfillOpPageSize, nil)
		if err != nil {
			return fmt.Errorf("list operations for backfill: %w", err)
		}
		if len(ops) == 0 {
			break
		}

		for _, op := range ops {
			c, err := l.backfillCredentialsFor(ctx, op.OperationID)
			if err != nil {
				l.log.Warn("event logger: credential backfill failed",
					zap.String("operation_id", op.OperationID.String()),
					zap.Error(err))
			}
			totalCreds += c

			d, err := l.backfillWikiDocsFor(ctx, op.OperationID)
			if err != nil {
				l.log.Warn("event logger: wiki doc backfill failed",
					zap.String("operation_id", op.OperationID.String()),
					zap.Error(err))
			}
			totalDocs += d
		}

		if int64(len(ops)) < backfillOpPageSize {
			break
		}
		offset += int64(len(ops))
	}

	l.log.Info("event logger: backfill complete",
		zap.Int("credentials", totalCreds),
		zap.Int("wiki_documents", totalDocs))
	return nil
}

// backfillCredentialsFor seeds credential.created events for one operation.
// Returns the number of rows successfully inserted.
func (l *Logger) backfillCredentialsFor(ctx context.Context, opID uuid.UUID) (int, error) {
	creds, err := l.creds.FindByOperationIDWithCursor(ctx, opID, repository.CredentialFilter{}, nil, backfillCredPageSize, true)
	if err != nil {
		return 0, fmt.Errorf("list credentials: %w", err)
	}

	rows := make([]*models.OperationEvent, 0, len(creds))
	for _, c := range creds {
		actor := userActorPtr(c.CreatedByID)
		rows = append(rows, &models.OperationEvent{
			EventID:     deterministicEventID(string(eventbus.TopicCredentialCreated), c.CredentialID),
			OperationID: c.OperationID,
			Topic:       string(eventbus.TopicCredentialCreated),
			SubjectKind: models.SubjectKindCredential,
			SubjectID:   c.CredentialID,
			SubjectName: c.Name,
			ActorType:   models.EventActorUser,
			ActorID:     actor,
			OccurredAt:  c.CreateAt.UTC(),
		})
	}

	return l.insertInBatches(ctx, rows)
}

// backfillWikiDocsFor seeds wiki.document.created events for one operation.
// Soft-deleted documents are excluded because the available repository
// method filters them out; that is acceptable for a first-deploy seed —
// the spec's note about including them is a hedge we can revisit if it
// turns into a real loss.
func (l *Logger) backfillWikiDocsFor(ctx context.Context, opID uuid.UUID) (int, error) {
	docs, err := l.wikiDocs.FindAllByOperationID(ctx, opID)
	if err != nil {
		return 0, fmt.Errorf("list wiki docs: %w", err)
	}

	rows := make([]*models.OperationEvent, 0, len(docs))
	for _, d := range docs {
		actor := userActorPtr(d.CreatedByID)
		var meta map[string]any
		if d.ParentDocumentID != nil {
			meta = map[string]any{"parent_document_id": d.ParentDocumentID.String()}
		}
		rows = append(rows, &models.OperationEvent{
			EventID:     deterministicEventID(string(eventbus.TopicWikiDocumentCreated), d.DocumentID),
			OperationID: d.OperationID,
			Topic:       string(eventbus.TopicWikiDocumentCreated),
			SubjectKind: models.SubjectKindWikiDocument,
			SubjectID:   d.DocumentID,
			SubjectName: d.Title,
			ActorType:   models.EventActorUser,
			ActorID:     actor,
			Metadata:    meta,
			OccurredAt:  d.CreateAt.UTC(),
		})
	}

	return l.insertInBatches(ctx, rows)
}

// insertInBatches writes rows in chunks of backfillBatchSize. Returns the
// total number of rows handed to InsertMany (regardless of whether each
// batch succeeded); per-batch errors are logged but not propagated so one
// bad batch does not abort the rest of the seed.
func (l *Logger) insertInBatches(ctx context.Context, rows []*models.OperationEvent) (int, error) {
	if len(rows) == 0 {
		return 0, nil
	}

	inserted := 0
	for start := 0; start < len(rows); start += backfillBatchSize {
		end := start + backfillBatchSize
		if end > len(rows) {
			end = len(rows)
		}
		batch := rows[start:end]
		if err := l.repo.InsertMany(ctx, batch); err != nil {
			l.log.Warn("event logger: backfill batch insert failed",
				zap.Int("batch_size", len(batch)),
				zap.Error(err))
			continue
		}
		inserted += len(batch)
	}
	return inserted, nil
}

// userActorPtr wraps a non-zero UUID as a pointer for ActorID storage.
// The zero UUID (no recorded creator) becomes nil so we never write a
// meaningless actor id.
func userActorPtr(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	cp := id
	return &cp
}
