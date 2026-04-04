package resolver

// Helper functions for subscription resolvers.
// These live in a separate file because gqlgen manages *.resolvers.go files
// and moves non-resolver functions to a "deleted code" comment block on regen.

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
)

// buildOperationFilter creates an event bus filter for operation-scoped subscriptions.
// If operationID is provided, filters to that single operation.
// Otherwise, fetches the caller's operations and filters to that set.
func (r *subscriptionResolver) buildOperationFilter(ctx context.Context, auth gqlctx.AuthInfo, operationID *string) (eventbus.Filter, error) {
	if operationID != nil && *operationID != "" {
		target := *operationID

		// Verify caller has access to this operation (member or app-level admin).
		isAdmin := false
		for _, role := range auth.Roles {
			if role == "admin" {
				isAdmin = true
				break
			}
		}

		if !isAdmin {
			userID, err := uuid.Parse(auth.UserID)
			if err != nil {
				return nil, fmt.Errorf("invalid user ID")
			}
			opID, err := uuid.Parse(target)
			if err != nil {
				return nil, fmt.Errorf("invalid operation ID")
			}
			op, err := r.OperationRepo.FindByID(ctx, opID)
			if err != nil {
				return nil, fmt.Errorf("operation not found")
			}
			isMember := false
			for _, m := range op.Members {
				if m.UserID == userID {
					isMember = true
					break
				}
			}
			if !isMember {
				return nil, fmt.Errorf("forbidden: not a member of this operation")
			}
		}

		// Track whether the subscriber's membership was revoked mid-subscription.
		// Safe to mutate — the filter is only called from a single dispatch goroutine.
		revoked := false
		return func(event eventbus.Event) bool {
			if extractOperationID(event) != target {
				return false
			}
			// If this user was removed from the operation, deliver the removal
			// event (so the client can react) then stop all future events.
			if p, ok := event.Payload.(eventbus.OperationMemberPayload); ok &&
				p.MemberID == auth.UserID &&
				event.Topic == eventbus.TopicOperationMemberRemoved {
				revoked = true
				return true
			}
			return !revoked
		}, nil
	}

	// Fetch the caller's operations to build a membership set.
	// This set is captured once at subscribe time — if the caller joins
	// a new operation, they need to reconnect to receive events for it.
	userID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID")
	}

	ops, err := r.OperationRepo.FindByMemberID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch operations: %w", err)
	}

	opSet := make(map[string]struct{}, len(ops))
	for _, op := range ops {
		opSet[op.OperationID.String()] = struct{}{}
	}

	return func(event eventbus.Event) bool {
		// Always deliver events triggered by the subscriber themselves
		// (e.g., they just created an operation that isn't in the snapshot yet).
		if event.Actor.Type == eventbus.ActorUser && event.Actor.ID == auth.UserID {
			return true
		}

		// If this is a member event targeting the subscriber (someone added/removed them),
		// pass it through and update the membership snapshot so future events for that
		// operation are also delivered (or stopped). Safe to mutate opSet here — the filter
		// is only called from the single dispatch() goroutine.
		if p, ok := event.Payload.(eventbus.OperationMemberPayload); ok && p.MemberID == auth.UserID {
			if event.Topic == eventbus.TopicOperationMemberAdded {
				opSet[p.OperationID] = struct{}{}
			} else if event.Topic == eventbus.TopicOperationMemberRemoved {
				delete(opSet, p.OperationID)
			}
			return true
		}

		_, ok := opSet[extractOperationID(event)]
		return ok
	}, nil
}

// extractOperationID pulls the operation ID from any operation-related event payload.
func extractOperationID(event eventbus.Event) string {
	switch p := event.Payload.(type) {
	case eventbus.OperationEventPayload:
		return p.OperationID
	case eventbus.OperationDeletedPayload:
		return p.OperationID
	case eventbus.OperationMemberPayload:
		return p.OperationID
	}
	return ""
}

// topicToAction maps an event bus topic suffix to a GraphQL EventAction.
func topicToAction(topic eventbus.Topic) model.EventAction {
	s := string(topic)
	switch {
	case strings.HasSuffix(s, ".created"), strings.HasSuffix(s, ".added"):
		return model.EventActionCreated
	case strings.HasSuffix(s, ".updated"):
		return model.EventActionUpdated
	case strings.HasSuffix(s, ".deleted"), strings.HasSuffix(s, ".removed"):
		return model.EventActionDeleted
	}
	return model.EventActionUpdated
}

// toUserEvent converts an event bus Event to a GraphQL UserEvent.
func toUserEvent(event eventbus.Event) *model.UserEvent {
	evt := &model.UserEvent{Action: topicToAction(event.Topic)}
	switch p := event.Payload.(type) {
	case eventbus.UserEventPayload:
		evt.UserID = p.UserID
		evt.Username = &p.Username
	case eventbus.UserDeletedPayload:
		evt.UserID = p.UserID
	}
	return evt
}

// toOperationEvent converts an event bus Event to a GraphQL OperationEvent.
func toOperationEvent(event eventbus.Event) *model.OperationEvent {
	evt := &model.OperationEvent{Action: topicToAction(event.Topic)}
	switch p := event.Payload.(type) {
	case eventbus.OperationEventPayload:
		evt.OperationID = p.OperationID
		evt.Name = &p.Name
	case eventbus.OperationDeletedPayload:
		evt.OperationID = p.OperationID
	}
	return evt
}

// toOperationMemberEvent converts an event bus Event to a GraphQL OperationMemberEvent.
func toOperationMemberEvent(event eventbus.Event) *model.OperationMemberEvent {
	evt := &model.OperationMemberEvent{Action: topicToAction(event.Topic)}
	if p, ok := event.Payload.(eventbus.OperationMemberPayload); ok {
		evt.OperationID = p.OperationID
		evt.UserID = p.MemberID
	}
	return evt
}

// sessionTopics is the list of session event bus topics for subscriptions.
var sessionTopics = []eventbus.Topic{
	eventbus.TopicSessionCreated,
	eventbus.TopicSessionRefreshed,
	eventbus.TopicSessionTerminated,
}

// toSessionEvent converts an event bus Event to a GraphQL SessionEvent.
func toSessionEvent(event eventbus.Event) *model.SessionEvent {
	action := topicToAction(event.Topic)
	// Session terminated maps to UPDATED (session still exists, just inactive),
	// not DELETED (session record is never removed).
	if event.Topic == eventbus.TopicSessionTerminated {
		action = model.EventActionUpdated
	}

	evt := &model.SessionEvent{Action: action}
	if p, ok := event.Payload.(eventbus.SessionEventPayload); ok {
		evt.SessionID = p.SessionID
		evt.UserID = p.UserID
	}
	return evt
}
