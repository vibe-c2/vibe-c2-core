package eventbus

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Topic identifies the kind of event. String-based for readability in logs.
type Topic string

const (
	// User events — emitted by UserResolver and EnrollController.
	TopicUserCreated Topic = "user.created"
	TopicUserUpdated Topic = "user.updated"
	TopicUserDeleted Topic = "user.deleted"

	// Operation events — emitted by OperationResolver.
	TopicOperationCreated       Topic = "operation.created"
	TopicOperationUpdated       Topic = "operation.updated"
	TopicOperationDeleted       Topic = "operation.deleted"
	TopicOperationMemberAdded   Topic = "operation.member.added"
	TopicOperationMemberRemoved Topic = "operation.member.removed"
	TopicOperationMemberUpdated Topic = "operation.member.updated"

	// Auth events — emitted by AuthController.
	TopicAuthLogin          Topic = "auth.login"
	TopicAuthLogout         Topic = "auth.logout"
	TopicAuthRefresh        Topic = "auth.refresh"
	TopicAuthReplayDetected Topic = "auth.replay_detected"
	TopicAuthEnroll         Topic = "auth.enroll"

	// Session events — emitted by auth controllers and session resolver.
	TopicSessionCreated    Topic = "session.created"
	TopicSessionRefreshed  Topic = "session.refreshed"
	TopicSessionTerminated Topic = "session.terminated"

	// Wiki document events — emitted by WikiDocumentResolver.
	TopicWikiDocumentCreated     Topic = "wiki.document.created"
	TopicWikiDocumentUpdated     Topic = "wiki.document.updated"
	TopicWikiDocumentSoftDeleted Topic = "wiki.document.soft_deleted"
	TopicWikiDocumentRestored    Topic = "wiki.document.restored"
	TopicWikiDocumentMoved       Topic = "wiki.document.moved"
	TopicWikiDocumentHardDeleted Topic = "wiki.document.hard_deleted"

	// Wiki presence events — emitted by Hocuspocus webhook handler.
	TopicWikiPresenceJoined Topic = "wiki.presence.joined"
	TopicWikiPresenceLeft   Topic = "wiki.presence.left"
)

// ActorType identifies who originated an event.
type ActorType string

const (
	ActorUser    ActorType = "user"    // action triggered by an authenticated user
	ActorSystem  ActorType = "system"  // action triggered by the system (e.g., scheduled task)
	ActorService ActorType = "service" // action triggered by another microservice
)

// Actor represents the originator of an event.
type Actor struct {
	ID   string    // user UUID, service name, or empty for system
	Type ActorType // who originated this event
}

// UserActor creates an Actor for an authenticated user action.
func UserActor(userID string) Actor {
	return Actor{ID: userID, Type: ActorUser}
}

// SystemActor creates an Actor for system-originated events.
func SystemActor() Actor {
	return Actor{Type: ActorSystem}
}

// ServiceActor creates an Actor for events from another microservice.
func ServiceActor(name string) Actor {
	return Actor{ID: name, Type: ActorService}
}

// Event represents a domain event emitted by the application.
type Event struct {
	ID        string // unique event identifier for correlation/debugging
	Topic     Topic
	Payload   any
	Actor     Actor
	Timestamp time.Time
}

// NewEvent creates a new Event with the current timestamp and a unique ID.
func NewEvent(topic Topic, actor Actor, payload any) Event {
	return Event{
		ID:        uuid.New().String(),
		Topic:     topic,
		Payload:   payload,
		Actor:     actor,
		Timestamp: time.Now().UTC(),
	}
}

// Handler is a function that processes an event.
// Handlers run in their own goroutines — they must be safe for concurrent use.
type Handler func(ctx context.Context, event Event)

// Filter is an optional predicate applied after topic matching.
// Returning true means the subscriber wants this event.
// Called in the dispatcher goroutine — must be fast and non-blocking.
type Filter func(event Event) bool

// IEventBus is an in-process async pub/sub event bus.
// Publishers call Publish() which returns immediately (non-blocking).
// Subscribers register handlers for one or more topics via Subscribe().
type IEventBus interface {
	// Publish sends an event to all subscribers whose topic set includes
	// the event's topic and whose filter (if any) returns true.
	// Non-blocking — returns immediately. Drops the event if the internal buffer is full.
	Publish(event Event)

	// Subscribe registers a handler for the given topics.
	// A single subscription can cover multiple topics with one channel and one goroutine.
	// The optional filter is applied after topic matching — only events that match
	// a topic AND pass the filter are delivered to the handler.
	// Returns an unsubscribe function that removes this subscription.
	// Safe to call before or after Start().
	Subscribe(topics []Topic, handler Handler, filter ...Filter) func()

	// Start begins the dispatcher goroutine. Call once at startup.
	Start()

	// Stop gracefully drains remaining events and stops the dispatcher.
	// Blocks until all in-flight handlers finish or the context deadline is reached.
	Stop(ctx context.Context)
}
