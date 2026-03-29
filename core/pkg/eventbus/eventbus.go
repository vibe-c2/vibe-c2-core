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

// IEventBus is an in-process async pub/sub event bus.
// Publishers call Publish() which returns immediately (non-blocking).
// Subscribers register handlers per topic via Subscribe().
type IEventBus interface {
	// Publish sends an event to all handlers registered for the event's topic.
	// Non-blocking — returns immediately. Drops the event if the internal buffer is full.
	Publish(event Event)

	// Subscribe registers a handler for a specific topic.
	// Multiple handlers can subscribe to the same topic.
	// Safe to call before or after Start().
	Subscribe(topic Topic, handler Handler)

	// Start begins the dispatcher goroutine. Call once at startup.
	Start()

	// Stop gracefully drains remaining events and stops the dispatcher.
	// Blocks until all in-flight handlers finish or the context deadline is reached.
	Stop(ctx context.Context)
}
