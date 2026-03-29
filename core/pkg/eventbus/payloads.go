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
