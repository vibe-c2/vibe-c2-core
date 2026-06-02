package eventbus

// Typed payload structs and constructor functions for each event topic.
// Use these instead of NewEvent() directly — the compiler enforces correct
// payload types at publish sites, eliminating runtime type-assertion surprises.
//
// Payload structs use simple primitives (no models import) to keep the
// eventbus package decoupled from the domain layer.

// --- User event payloads ---

// UserEventPayload is the payload for TopicUserCreated and TopicUserUpdated.
type UserEventPayload struct {
	UserID   string
	Username string
}

// UserDeletedPayload is the payload for TopicUserDeleted.
type UserDeletedPayload struct {
	UserID string
}

// --- Operation event payloads ---

// OperationEventPayload is the payload for TopicOperationCreated and TopicOperationUpdated.
type OperationEventPayload struct {
	OperationID string
	Name        string
}

// OperationDeletedPayload is the payload for TopicOperationDeleted.
type OperationDeletedPayload struct {
	OperationID string
}

// OperationMemberPayload is the payload for member add/remove/update events.
type OperationMemberPayload struct {
	OperationID string
	MemberID    string
}

// --- Auth event payloads ---

// AuthEventPayload is the payload for auth events (login, logout, refresh, enroll, replay).
type AuthEventPayload struct {
	UserID   string
	Username string
}

// --- Typed constructors ---

func NewUserCreatedEvent(actor Actor, p UserEventPayload) Event {
	return NewEvent(TopicUserCreated, actor, p)
}

func NewUserUpdatedEvent(actor Actor, p UserEventPayload) Event {
	return NewEvent(TopicUserUpdated, actor, p)
}

func NewUserDeletedEvent(actor Actor, p UserDeletedPayload) Event {
	return NewEvent(TopicUserDeleted, actor, p)
}

func NewOperationCreatedEvent(actor Actor, p OperationEventPayload) Event {
	return NewEvent(TopicOperationCreated, actor, p)
}

func NewOperationUpdatedEvent(actor Actor, p OperationEventPayload) Event {
	return NewEvent(TopicOperationUpdated, actor, p)
}

func NewOperationDeletedEvent(actor Actor, p OperationDeletedPayload) Event {
	return NewEvent(TopicOperationDeleted, actor, p)
}

func NewOperationMemberAddedEvent(actor Actor, p OperationMemberPayload) Event {
	return NewEvent(TopicOperationMemberAdded, actor, p)
}

func NewOperationMemberRemovedEvent(actor Actor, p OperationMemberPayload) Event {
	return NewEvent(TopicOperationMemberRemoved, actor, p)
}

func NewOperationMemberUpdatedEvent(actor Actor, p OperationMemberPayload) Event {
	return NewEvent(TopicOperationMemberUpdated, actor, p)
}

func NewAuthLoginEvent(actor Actor, p AuthEventPayload) Event {
	return NewEvent(TopicAuthLogin, actor, p)
}

func NewAuthLogoutEvent(actor Actor) Event {
	return NewEvent(TopicAuthLogout, actor, AuthEventPayload{UserID: actor.ID})
}

func NewAuthRefreshEvent(actor Actor) Event {
	return NewEvent(TopicAuthRefresh, actor, AuthEventPayload{UserID: actor.ID})
}

func NewAuthReplayDetectedEvent(actor Actor) Event {
	return NewEvent(TopicAuthReplayDetected, actor, AuthEventPayload{UserID: actor.ID})
}

func NewAuthEnrollEvent(actor Actor, p AuthEventPayload) Event {
	return NewEvent(TopicAuthEnroll, actor, p)
}

// --- Session event payloads ---

// SessionEventPayload is the payload for session events.
type SessionEventPayload struct {
	SessionID string
	UserID    string
	Reason    string // termination reason (only for terminated events)
}

func NewSessionCreatedEvent(actor Actor, p SessionEventPayload) Event {
	return NewEvent(TopicSessionCreated, actor, p)
}

func NewSessionRefreshedEvent(actor Actor, p SessionEventPayload) Event {
	return NewEvent(TopicSessionRefreshed, actor, p)
}

func NewSessionTerminatedEvent(actor Actor, p SessionEventPayload) Event {
	return NewEvent(TopicSessionTerminated, actor, p)
}

// --- Wiki document event payloads ---

// WikiDocumentEventPayload is the payload for wiki document events.
//
// PreviousParentDocumentID is populated only for moved events; it carries the
// parent the document just moved out of so subscribers can surgically
// invalidate exactly two parent buckets instead of an entire operation.
type WikiDocumentEventPayload struct {
	DocumentID               string
	OperationID              string
	ParentDocumentID         string // empty if root
	PreviousParentDocumentID string // populated on moved events; empty otherwise
	Title                    string
	DeletedAt                string // empty if active, ISO timestamp if soft-deleted
}

// WikiPresencePayload is the payload for wiki presence events.
type WikiPresencePayload struct {
	DocumentID  string
	OperationID string
	UserID      string
	Username    string
}

func NewWikiDocumentCreatedEvent(actor Actor, p WikiDocumentEventPayload) Event {
	return NewEvent(TopicWikiDocumentCreated, actor, p)
}

func NewWikiDocumentUpdatedEvent(actor Actor, p WikiDocumentEventPayload) Event {
	return NewEvent(TopicWikiDocumentUpdated, actor, p)
}

func NewWikiDocumentSoftDeletedEvent(actor Actor, p WikiDocumentEventPayload) Event {
	return NewEvent(TopicWikiDocumentSoftDeleted, actor, p)
}

func NewWikiDocumentRestoredEvent(actor Actor, p WikiDocumentEventPayload) Event {
	return NewEvent(TopicWikiDocumentRestored, actor, p)
}

func NewWikiDocumentMovedEvent(actor Actor, p WikiDocumentEventPayload) Event {
	return NewEvent(TopicWikiDocumentMoved, actor, p)
}

func NewWikiDocumentHardDeletedEvent(actor Actor, p WikiDocumentEventPayload) Event {
	return NewEvent(TopicWikiDocumentHardDeleted, actor, p)
}

func NewWikiPresenceJoinedEvent(actor Actor, p WikiPresencePayload) Event {
	return NewEvent(TopicWikiPresenceJoined, actor, p)
}

func NewWikiPresenceLeftEvent(actor Actor, p WikiPresencePayload) Event {
	return NewEvent(TopicWikiPresenceLeft, actor, p)
}

// --- Credential event payloads ---

// CredentialEventPayload is the payload for credential create/update/delete events.
type CredentialEventPayload struct {
	CredentialID string
	OperationID  string
}

func NewCredentialCreatedEvent(actor Actor, p CredentialEventPayload) Event {
	return NewEvent(TopicCredentialCreated, actor, p)
}

func NewCredentialUpdatedEvent(actor Actor, p CredentialEventPayload) Event {
	return NewEvent(TopicCredentialUpdated, actor, p)
}

func NewCredentialDeletedEvent(actor Actor, p CredentialEventPayload) Event {
	return NewEvent(TopicCredentialDeleted, actor, p)
}

func NewCredentialCommentAddedEvent(actor Actor, p CredentialEventPayload) Event {
	return NewEvent(TopicCredentialCommentAdded, actor, p)
}

func NewCredentialCommentUpdatedEvent(actor Actor, p CredentialEventPayload) Event {
	return NewEvent(TopicCredentialCommentUpdated, actor, p)
}

func NewCredentialCommentRemovedEvent(actor Actor, p CredentialEventPayload) Event {
	return NewEvent(TopicCredentialCommentRemoved, actor, p)
}

// --- Hash event payloads ---

// HashEventPayload is the payload for hash create/update/delete and comment events.
type HashEventPayload struct {
	HashID      string
	OperationID string
}

// HashCrackedPayload is the payload for TopicHashCracked. CredentialID is the
// id of the credential that the cracked hash was linked to (either newly
// created or selected from the operation).
type HashCrackedPayload struct {
	HashID       string
	OperationID  string
	CredentialID string
}

// HashBulkImportPayload is the payload for TopicHashBulkImported. Carries the
// summary count rather than per-row ids — the timeline subscriber writes a
// single "imported N hashes" row regardless of batch size.
type HashBulkImportPayload struct {
	OperationID string
	Count       int
}

func NewHashCreatedEvent(actor Actor, p HashEventPayload) Event {
	return NewEvent(TopicHashCreated, actor, p)
}

func NewHashUpdatedEvent(actor Actor, p HashEventPayload) Event {
	return NewEvent(TopicHashUpdated, actor, p)
}

func NewHashDeletedEvent(actor Actor, p HashEventPayload) Event {
	return NewEvent(TopicHashDeleted, actor, p)
}

func NewHashCrackedEvent(actor Actor, p HashCrackedPayload) Event {
	return NewEvent(TopicHashCracked, actor, p)
}

func NewHashBulkImportedEvent(actor Actor, p HashBulkImportPayload) Event {
	return NewEvent(TopicHashBulkImported, actor, p)
}

// --- Task event payloads ---

// TaskEventPayload is the payload for every task topic. The bus stays
// decoupled from the models package, so this carries primitives only —
// subscribers that need the full task refetch via the task repository.
//
// Name is snapshotted at publish time so the timeline subscriber can
// render a stable SubjectName even after the row is hard-deleted.
//
// OldStage is populated for stage_changed events; for every other topic
// it is empty. Stage/Status reflect the row state *after* the mutation
// that triggered the event.
//
// DeletedAt is the ISO timestamp when the event represents a soft-delete;
// empty for active rows. Mirrors the wiki document payload convention.
type TaskEventPayload struct {
	TaskID      string
	OperationID string
	Name        string
	Stage       string
	Status      string
	OldStage    string
	DeletedAt   string
}

func NewTaskCreatedEvent(actor Actor, p TaskEventPayload) Event {
	return NewEvent(TopicTaskCreated, actor, p)
}

func NewTaskUpdatedEvent(actor Actor, p TaskEventPayload) Event {
	return NewEvent(TopicTaskUpdated, actor, p)
}

func NewTaskStageChangedEvent(actor Actor, p TaskEventPayload) Event {
	return NewEvent(TopicTaskStageChanged, actor, p)
}

func NewTaskStatusSetEvent(actor Actor, p TaskEventPayload) Event {
	return NewEvent(TopicTaskStatusSet, actor, p)
}

func NewTaskAssigneesChangedEvent(actor Actor, p TaskEventPayload) Event {
	return NewEvent(TopicTaskAssigneesChanged, actor, p)
}

func NewTaskReferencesChangedEvent(actor Actor, p TaskEventPayload) Event {
	return NewEvent(TopicTaskReferencesChanged, actor, p)
}

func NewTaskSoftDeletedEvent(actor Actor, p TaskEventPayload) Event {
	return NewEvent(TopicTaskSoftDeleted, actor, p)
}

func NewTaskRestoredEvent(actor Actor, p TaskEventPayload) Event {
	return NewEvent(TopicTaskRestored, actor, p)
}

func NewTaskHardDeletedEvent(actor Actor, p TaskEventPayload) Event {
	return NewEvent(TopicTaskHardDeleted, actor, p)
}

// --- Timeline event payload ---

// OperationEventLoggedPayload is the payload for TopicOperationEventLogged.
// It carries only the primitives needed for routing — subscribers refetch
// the full OperationEvent from the operation_event repository so the
// eventbus stays decoupled from the models package.
type OperationEventLoggedPayload struct {
	EventID     string
	OperationID string
}

func NewOperationEventLoggedEvent(actor Actor, p OperationEventLoggedPayload) Event {
	return NewEvent(TopicOperationEventLogged, actor, p)
}
