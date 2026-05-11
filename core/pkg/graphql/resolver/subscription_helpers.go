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
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
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
	case eventbus.WikiDocumentEventPayload:
		return p.OperationID
	case eventbus.WikiPresencePayload:
		return p.OperationID
	case eventbus.CredentialEventPayload:
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

// toWikiDocumentEvent converts an event bus Event to a GraphQL WikiDocumentEvent.
func toWikiDocumentEvent(event eventbus.Event) *model.WikiDocumentEvent {
	evt := &model.WikiDocumentEvent{Action: topicToAction(event.Topic)}

	// Map soft_deleted and restored to appropriate actions
	switch event.Topic {
	case eventbus.TopicWikiDocumentSoftDeleted:
		evt.Action = model.EventActionDeleted
	case eventbus.TopicWikiDocumentRestored:
		evt.Action = model.EventActionCreated
	case eventbus.TopicWikiDocumentMoved:
		evt.Action = model.EventActionUpdated
	}

	if p, ok := event.Payload.(eventbus.WikiDocumentEventPayload); ok {
		evt.DocumentID = p.DocumentID
		evt.OperationID = p.OperationID
		if p.ParentDocumentID != "" {
			evt.ParentDocumentID = &p.ParentDocumentID
		}
	}
	return evt
}

// toWikiDocumentPresenceEvent converts an event bus Event to a GraphQL WikiDocumentPresenceEvent.
func toWikiDocumentPresenceEvent(event eventbus.Event) *model.WikiDocumentPresenceEvent {
	action := model.PresenceActionJoined
	if event.Topic == eventbus.TopicWikiPresenceLeft {
		action = model.PresenceActionLeft
	}

	evt := &model.WikiDocumentPresenceEvent{Action: action}
	if p, ok := event.Payload.(eventbus.WikiPresencePayload); ok {
		evt.DocumentID = p.DocumentID
		evt.OperationID = p.OperationID
		evt.UserID = p.UserID
		evt.Username = p.Username
	}
	return evt
}

// credentialTopics is the list of credential event bus topics for subscriptions.
var credentialTopics = []eventbus.Topic{
	eventbus.TopicCredentialCreated,
	eventbus.TopicCredentialUpdated,
	eventbus.TopicCredentialDeleted,
	eventbus.TopicCredentialCommentAdded,
	eventbus.TopicCredentialCommentUpdated,
	eventbus.TopicCredentialCommentRemoved,
}

// toCredentialEvent converts an event bus Event to a GraphQL CredentialEvent.
// Comment.* topics surface as UPDATED so the client refetches the full credential.
func toCredentialEvent(event eventbus.Event) *model.CredentialEvent {
	var action model.EventAction
	switch event.Topic {
	case eventbus.TopicCredentialCreated:
		action = model.EventActionCreated
	case eventbus.TopicCredentialDeleted:
		action = model.EventActionDeleted
	default:
		action = model.EventActionUpdated
	}

	evt := &model.CredentialEvent{Action: action}
	if p, ok := event.Payload.(eventbus.CredentialEventPayload); ok {
		evt.CredentialID = p.CredentialID
		evt.OperationID = p.OperationID
	}
	return evt
}

// wikiDocumentTopics is the list of wiki document event bus topics for subscriptions.
var wikiDocumentTopics = []eventbus.Topic{
	eventbus.TopicWikiDocumentCreated,
	eventbus.TopicWikiDocumentUpdated,
	eventbus.TopicWikiDocumentSoftDeleted,
	eventbus.TopicWikiDocumentRestored,
	eventbus.TopicWikiDocumentMoved,
	eventbus.TopicWikiDocumentHardDeleted,
}

// wikiPresenceTopics is the list of wiki presence event bus topics for subscriptions.
var wikiPresenceTopics = []eventbus.Topic{
	eventbus.TopicWikiPresenceJoined,
	eventbus.TopicWikiPresenceLeft,
}

// wikiDocumentChanged implements the wikiDocumentChanged subscription.
// Same operation-scoping pattern as OperationChanged.
func (r *subscriptionResolver) wikiDocumentChanged(ctx context.Context, operationID string) (<-chan *model.WikiDocumentEvent, error) {
	auth := gqlctx.AuthFromContext(ctx)
	if auth.UserID == "" {
		return nil, fmt.Errorf("unauthorized")
	}

	filter, err := r.buildOperationFilter(ctx, auth, &operationID)
	if err != nil {
		return nil, err
	}

	ch := make(chan *model.WikiDocumentEvent, 1)

	unsubscribe := r.EventBus.Subscribe(
		wikiDocumentTopics,
		func(_ context.Context, event eventbus.Event) {
			evt := toWikiDocumentEvent(event)

			// For non-DELETE events, fetch the full document
			if evt.Action != model.EventActionDeleted {
				if docID, err := uuid.Parse(evt.DocumentID); err == nil {
					if doc, err := r.WikiDocumentRepo.FindByID(ctx, docID); err == nil {
						evt.Document = &doc
					}
				}
			}

			select {
			case ch <- evt:
			case <-ctx.Done():
			}
		},
		filter,
	)

	go func() {
		<-ctx.Done()
		unsubscribe()
		close(ch)
	}()

	return ch, nil
}

// wikiDocumentPresenceChanged implements the wikiDocumentPresenceChanged subscription.
func (r *subscriptionResolver) wikiDocumentPresenceChanged(ctx context.Context, operationID string) (<-chan *model.WikiDocumentPresenceEvent, error) {
	auth := gqlctx.AuthFromContext(ctx)
	if auth.UserID == "" {
		return nil, fmt.Errorf("unauthorized")
	}

	filter, err := r.buildOperationFilter(ctx, auth, &operationID)
	if err != nil {
		return nil, err
	}

	ch := make(chan *model.WikiDocumentPresenceEvent, 1)

	unsubscribe := r.EventBus.Subscribe(
		wikiPresenceTopics,
		func(_ context.Context, event eventbus.Event) {
			evt := toWikiDocumentPresenceEvent(event)

			select {
			case ch <- evt:
			case <-ctx.Done():
			}
		},
		filter,
	)

	go func() {
		<-ctx.Done()
		unsubscribe()
		close(ch)
	}()

	return ch, nil
}

// sessionTopics is the list of session event bus topics for subscriptions.
var sessionTopics = []eventbus.Topic{
	eventbus.TopicSessionCreated,
	eventbus.TopicSessionRefreshed,
	eventbus.TopicSessionTerminated,
}

// toSessionEvent converts an event bus Event to a GraphQL SessionEvent.
//
// Action mapping is deliberate — the frontend session guard uses `action` as
// the authoritative "what happened" signal:
//
//	session.created    → CREATED
//	session.refreshed  → UPDATED (the session stays active; activity advanced)
//	session.terminated → DELETED (the session's auth record is gone; the
//	                     historical Mongo row survives, but semantically the
//	                     *session* ended, so DELETED is the right action for
//	                     GraphQL consumers that care about liveness)
//
// Do not "fix" the terminated → DELETED mapping back to UPDATED without first
// updating frontend/src/hooks/use-session-guard.ts, which relies on it to
// decide whether to force a local logout.
func toSessionEvent(event eventbus.Event) *model.SessionEvent {
	var action model.EventAction
	switch event.Topic {
	case eventbus.TopicSessionCreated:
		action = model.EventActionCreated
	case eventbus.TopicSessionRefreshed:
		action = model.EventActionUpdated
	case eventbus.TopicSessionTerminated:
		action = model.EventActionDeleted
	default:
		action = topicToAction(event.Topic)
	}

	evt := &model.SessionEvent{Action: action}
	if p, ok := event.Payload.(eventbus.SessionEventPayload); ok {
		evt.SessionID = p.SessionID
		evt.UserID = p.UserID
	}
	return evt
}

// applySessionStatusFromTopic sets the derived Status field on a session
// loaded directly from Mongo. Status is not persisted (bson:"-"), so a raw
// FindByID always produces an empty string, which the Session.status field
// resolver converts to INACTIVE — wrong for created/refreshed events and
// the cause of spurious client-side logouts after token refresh.
//
// The topic is authoritative here: session.created and session.refreshed
// both mean the session is currently active; session.terminated means it
// is not. We do not consult Redis — the topic is published by the code
// path that just finished mutating the active-session state, so it is
// strictly more up to date than any subsequent Redis read would be.
func applySessionStatusFromTopic(sess *models.Session, topic eventbus.Topic) {
	switch topic {
	case eventbus.TopicSessionCreated, eventbus.TopicSessionRefreshed:
		sess.Status = models.SessionStatusActive
	case eventbus.TopicSessionTerminated:
		sess.Status = models.SessionStatusInactive
	}
}
