package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// SubjectKind classifies the domain entity an event is about.
// String-based so new kinds can be added by the persistence subscriber
// without coordinating a Go enum bump.
type SubjectKind string

const (
	SubjectKindCredential   SubjectKind = "credential"
	SubjectKindWikiDocument SubjectKind = "wiki_document"
	SubjectKindTask         SubjectKind = "task"
	// SubjectKindCustomEvent is a user-authored timeline annotation. Unlike
	// the other kinds, the row IS its own subject — there is no backing
	// entity — so event_id and subject_id are equal. Description lives in
	// metadata["description"].
	SubjectKindCustomEvent SubjectKind = "custom_event"
)

// EventActorType identifies who originated an event. Mirrors
// eventbus.ActorType but lives in models so the persisted row does
// not import the bus package.
type EventActorType string

const (
	EventActorUser    EventActorType = "user"
	EventActorSystem  EventActorType = "system"
	EventActorService EventActorType = "service"
)

// OperationEvent is one persisted row in the operation timeline log.
//
// Two important denormalisations:
//
//   - SubjectName is snapshotted at write time so that events survive
//     deletion of their subject (a credential removed six months ago
//     still renders with its original name on the timeline).
//   - ActorID is *uuid.UUID — system/service actors have no user id
//     and must be representable.
//
// Metadata is a free-form bag of topic-specific fields (e.g. parent
// document id for wiki moves). The frontend reads it through a
// pure summary function and does not depend on any individual field
// being present.
type OperationEvent struct {
	field.DefaultField `bson:",inline"`

	EventID     uuid.UUID      `bson:"event_id"     json:"event_id"`
	OperationID uuid.UUID      `bson:"operation_id" json:"operation_id"`
	Topic       string         `bson:"topic"        json:"topic"`
	SubjectKind SubjectKind    `bson:"subject_kind" json:"subject_kind"`
	SubjectID   uuid.UUID      `bson:"subject_id"   json:"subject_id"`
	SubjectName string         `bson:"subject_name" json:"subject_name"`
	ActorType   EventActorType `bson:"actor_type"   json:"actor_type"`
	ActorID     *uuid.UUID     `bson:"actor_id,omitempty" json:"actor_id,omitempty"`
	Metadata    map[string]any `bson:"metadata,omitempty" json:"metadata,omitempty"`
	OccurredAt  time.Time      `bson:"occurred_at"  json:"occurred_at"`
}
