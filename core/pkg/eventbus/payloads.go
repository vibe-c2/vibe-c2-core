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
