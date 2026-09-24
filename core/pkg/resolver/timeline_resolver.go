package resolver

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/authorization"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/logger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// ITimelineResolver defines the business logic for the Timeline page.
// Mirrors the existing entity-resolver pattern (UserResolver, CredentialResolver):
// the GraphQL resolver file in pkg/graphql/resolver/timeline.resolvers.go
// delegates each generated method here.
type ITimelineResolver interface {
	// Queries
	TimelineBuckets(ctx context.Context, operationID string, granularity *repository.TimelineGranularity, timezone string, from *string, to *string, types []string, actorIDs []string) ([]*model.TimelineBucket, error)
	TimelineEventsByDay(ctx context.Context, operationID string, date string, timezone string, granularity *repository.TimelineGranularity, types []string, actorIDs []string, first *int, after *string) (*model.TimelineEventConnection, error)

	// Mutations — custom timeline events
	CreateCustomTimelineEvent(ctx context.Context, operationID string, input model.CreateCustomTimelineEventInput) (*models.OperationEvent, error)
	UpdateCustomTimelineEvent(ctx context.Context, id string, input model.UpdateCustomTimelineEventInput) (*models.OperationEvent, error)
	DeleteCustomTimelineEvent(ctx context.Context, id string) (bool, error)

	// Field resolvers for TimelineEvent
	ID(ctx context.Context, obj *models.OperationEvent) (string, error)
	OperationIDField(ctx context.Context, obj *models.OperationEvent) (string, error)
	SubjectID(ctx context.Context, obj *models.OperationEvent) (string, error)
	SubjectKind(ctx context.Context, obj *models.OperationEvent) (string, error)
	Actor(ctx context.Context, obj *models.OperationEvent) (*models.User, error)
	ActorKind(ctx context.Context, obj *models.OperationEvent) (string, error)
	ActorLabel(ctx context.Context, obj *models.OperationEvent) (string, error)
	// ActorLabels is ActorLabel for a page of events in one user lookup.
	ActorLabels(ctx context.Context, events []*models.OperationEvent) []string
	OccurredAt(ctx context.Context, obj *models.OperationEvent) (string, error)
	Metadata(ctx context.Context, obj *models.OperationEvent) (string, error)

	// Subscription helper — used by the GraphQL subscription resolver to
	// fetch a row by event id after TopicOperationEventLogged fires.
	FindByEventID(ctx context.Context, eventID uuid.UUID) (*models.OperationEvent, error)
}

type timelineResolver struct {
	repo          repository.IOperationEventRepository
	operationRepo repository.IOperationRepository
	userRepo      repository.IUserRepository
	bus           eventbus.IEventBus
}

// NewTimelineResolver wires the timeline resolver. The operation repo is used
// for membership checks; the user repo resolves actors. The event bus is used
// to republish TopicOperationEventLogged after custom event mutations so the
// live subscription stays in sync without going through pkg/events.Logger.
func NewTimelineResolver(
	repo repository.IOperationEventRepository,
	operationRepo repository.IOperationRepository,
	userRepo repository.IUserRepository,
	bus eventbus.IEventBus,
) ITimelineResolver {
	if bus == nil {
		bus = eventbus.NewNopEventBus()
	}
	return &timelineResolver{
		repo:          repo,
		operationRepo: operationRepo,
		userRepo:      userRepo,
		bus:           bus,
	}
}

// --- Queries ---

// TimelineBuckets returns the bucket-count axis for the operation. The
// directive already enforces operation:member at the schema level, but we
// re-check via AuthorizeOperationRole for parity with the rest of the
// codebase and to keep the operation lookup local.
func (r *timelineResolver) TimelineBuckets(
	ctx context.Context,
	operationID string,
	granularity *repository.TimelineGranularity,
	timezone string,
	from *string,
	to *string,
	types []string,
	actorIDs []string,
) ([]*model.TimelineBucket, error) {
	opUID, _, err := r.authorizeOperationViewer(ctx, operationID)
	if err != nil {
		return nil, err
	}

	g := defaultGranularity(granularity)
	fromT, err := parseOptionalTime(from)
	if err != nil {
		return nil, fmt.Errorf("invalid 'from': %w", err)
	}
	toT, err := parseOptionalTime(to)
	if err != nil {
		return nil, fmt.Errorf("invalid 'to': %w", err)
	}
	subjects, err := parseSubjectKinds(types)
	if err != nil {
		return nil, err
	}
	actors, err := parseUUIDList(actorIDs)
	if err != nil {
		return nil, fmt.Errorf("invalid actor id: %w", err)
	}

	buckets, err := r.repo.Buckets(ctx, repository.BucketQuery{
		OperationID: opUID,
		From:        fromT,
		To:          toT,
		Types:       subjects,
		ActorIDs:    actors,
		Granularity: g,
		Timezone:    timezone,
	})
	if err != nil {
		logger.From(ctx).Warn("timeline buckets failed", zap.Error(err))
		return nil, err
	}

	out := make([]*model.TimelineBucket, 0, len(buckets))
	for _, b := range buckets {
		topicCounts := make([]*model.TimelineTopicCount, 0, len(b.Topics))
		for _, t := range b.Topics {
			topicCounts = append(topicCounts, &model.TimelineTopicCount{
				Topic:       t.Topic,
				SubjectKind: string(t.SubjectKind),
				Count:       t.Count,
				Emoji:       t.Emoji,
				Icon:        t.Icon,
				Color:       t.Color,
			})
		}
		out = append(out, &model.TimelineBucket{
			BucketStart: b.BucketStart.Format(time.RFC3339),
			Count:       b.Count,
			TopicCounts: topicCounts,
		})
	}
	return out, nil
}

// TimelineEventsByDay returns the events that fall within a single bucket.
// `date` is parsed as an RFC3339 timestamp; the repository truncates to the
// granularity's start boundary in the requested timezone.
func (r *timelineResolver) TimelineEventsByDay(
	ctx context.Context,
	operationID string,
	date string,
	timezone string,
	granularity *repository.TimelineGranularity,
	types []string,
	actorIDs []string,
	first *int,
	after *string,
) (*model.TimelineEventConnection, error) {
	opUID, _, err := r.authorizeOperationViewer(ctx, operationID)
	if err != nil {
		return nil, err
	}

	g := defaultGranularity(granularity)
	d, err := parseTime(date)
	if err != nil {
		return nil, fmt.Errorf("invalid 'date': %w", err)
	}
	subjects, err := parseSubjectKinds(types)
	if err != nil {
		return nil, err
	}
	actors, err := parseUUIDList(actorIDs)
	if err != nil {
		return nil, fmt.Errorf("invalid actor id: %w", err)
	}

	limit := int64(100)
	if first != nil && *first > 0 {
		limit = int64(*first)
	}
	afterStr := ""
	if after != nil {
		afterStr = *after
	}

	events, pageInfo, err := r.repo.ListByDay(ctx, repository.DayQuery{
		OperationID: opUID,
		Date:        d,
		Timezone:    timezone,
		Granularity: g,
		Types:       subjects,
		ActorIDs:    actors,
		First:       limit,
		After:       afterStr,
	})
	if err != nil {
		return nil, err
	}

	// Warm the user memo so the per-event Actor and ActorLabel resolvers stop
	// issuing a lookup each — and two each, for an event whose page selects
	// both fields. ActorLabels does the same batching for the MCP timeline
	// tool; this is the GraphQL side of it. Best-effort: both resolvers still
	// fall through to the repository.
	actorUIDs := make([]uuid.UUID, 0, len(events))
	for i := range events {
		if events[i].ActorID != nil {
			actorUIDs = append(actorUIDs, *events[i].ActorID)
		}
	}
	if err := gqlctx.PreloadUsers(ctx, r.userRepo, actorUIDs); err != nil {
		logger.From(ctx).Warn("preload timeline actors", zap.Error(err))
	}

	edges := make([]*model.TimelineEventEdge, 0, len(events))
	for i := range events {
		ev := &events[i]
		edges = append(edges, &model.TimelineEventEdge{
			Node:   ev,
			Cursor: pagination.EncodeCursor(ev.OccurredAt, ev.Id),
		})
	}

	return &model.TimelineEventConnection{
		Edges:    edges,
		PageInfo: &pageInfo,
	}, nil
}

// --- Mutations (custom timeline events) ---

// customEventTopic is the topic value stored on every custom-event row.
// Kept private to the resolver — the frontend matches on subject_kind for
// rendering, so the topic is only used for log-grep and future analytics.
const customEventTopic = "timeline.custom.created"

// CreateCustomTimelineEvent persists a user-authored annotation as a row in
// operation_events with subject_kind=custom_event. event_id and subject_id
// are identical (the row IS the subject). The caller must be at least an
// operator in the operation; on the synthetic Public operation any
// authenticated caller qualifies via authorization.AuthorizeOperationRole.
func (r *timelineResolver) CreateCustomTimelineEvent(
	ctx context.Context,
	operationID string,
	input model.CreateCustomTimelineEventInput,
) (*models.OperationEvent, error) {
	opUID, _, err := r.authorizeOperationOperator(ctx, operationID)
	if err != nil {
		return nil, err
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}

	occurred, err := parseTime(input.OccurredAt)
	if err != nil {
		return nil, fmt.Errorf("invalid occurredAt: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, fmt.Errorf("forbidden: invalid caller ID")
	}

	eventID := uuid.New()
	row := &models.OperationEvent{
		EventID:     eventID,
		OperationID: opUID,
		Topic:       customEventTopic,
		SubjectKind: models.SubjectKindCustomEvent,
		// subject_id == event_id: a custom event has no underlying entity.
		SubjectID:   eventID,
		SubjectName: name,
		// An agent-authored marker must not be indistinguishable from one the
		// operator typed themselves. Hard-coding the user actor here claimed
		// on the timeline that a person did something they did not do, which
		// is worse than the "System" it used to render as elsewhere.
		ActorType: customEventActorType(auth),
		ActorID:   &callerUID,
		ActorName: customEventActorName(auth),
		Metadata: customEventMetadata(
			strOrEmpty(input.Description),
			strOrEmpty(input.Emoji),
			strOrEmpty(input.Icon),
			strOrEmpty(input.Color),
		),
		OccurredAt: occurred.UTC(),
	}

	if err := r.repo.Insert(ctx, row); err != nil {
		return nil, fmt.Errorf("failed to create custom event: %w", err)
	}

	r.publishLogged(auth.UserID, row)
	return row, nil
}

// UpdateCustomTimelineEvent mutates the editable fields of a custom event.
// Only the original author or an app-level admin may edit. The repository
// guard prevents this method from mutating a system-generated row even if
// the caller forges an event_id of one.
func (r *timelineResolver) UpdateCustomTimelineEvent(
	ctx context.Context,
	id string,
	input model.UpdateCustomTimelineEventInput,
) (*models.OperationEvent, error) {
	row, err := r.loadEditableCustomEvent(ctx, id)
	if err != nil {
		return nil, err
	}

	upd := repository.CustomEventUpdate{}
	if input.Name != nil {
		trimmed := strings.TrimSpace(*input.Name)
		if trimmed == "" {
			return nil, fmt.Errorf("name cannot be empty")
		}
		upd.Name = &trimmed
	}
	if input.Description != nil {
		desc := *input.Description
		upd.Description = &desc
	}
	if input.Emoji != nil {
		e := *input.Emoji
		upd.Emoji = &e
	}
	if input.Icon != nil {
		i := *input.Icon
		upd.Icon = &i
	}
	if input.Color != nil {
		c := *input.Color
		upd.Color = &c
	}
	if input.OccurredAt != nil {
		t, err := parseTime(*input.OccurredAt)
		if err != nil {
			return nil, fmt.Errorf("invalid occurredAt: %w", err)
		}
		u := t.UTC()
		upd.OccurredAt = &u
	}

	updated, err := r.repo.UpdateCustomEvent(ctx, row.EventID, upd)
	if err != nil {
		return nil, fmt.Errorf("failed to update custom event: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	r.publishLogged(auth.UserID, &updated)
	return &updated, nil
}

// DeleteCustomTimelineEvent removes a custom event. Hard delete — there is
// no soft-delete tombstone for annotations. Author-or-admin only.
func (r *timelineResolver) DeleteCustomTimelineEvent(ctx context.Context, id string) (bool, error) {
	row, err := r.loadEditableCustomEvent(ctx, id)
	if err != nil {
		return false, err
	}

	if err := r.repo.DeleteCustomEvent(ctx, row.EventID); err != nil {
		return false, fmt.Errorf("failed to delete custom event: %w", err)
	}

	// Publish a delete-flavoured logged event so connected clients
	// invalidate their timeline cache. The subscription helper refetches
	// the row by id and silently skips when missing (deleted), which is
	// the exact behaviour we want — clients pick up the deletion via the
	// cache invalidation triggered upstream of the lookup.
	auth := gqlctx.AuthFromContext(ctx)
	r.publishLogged(auth.UserID, row)
	return true, nil
}

// loadEditableCustomEvent finds a custom-event row by id and verifies the
// caller may edit it (operator role + author or app admin). Returns the
// loaded row on success.
func (r *timelineResolver) loadEditableCustomEvent(ctx context.Context, id string) (*models.OperationEvent, error) {
	eventUID, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid event ID: %w", err)
	}

	row, err := r.repo.FindByEventID(ctx, eventUID)
	if err != nil {
		return nil, fmt.Errorf("event not found: %w", err)
	}
	if row.SubjectKind != models.SubjectKindCustomEvent {
		// System-generated rows are not editable. Surface as not-found so
		// the existence of foreign rows is not leaked to non-members.
		return nil, fmt.Errorf("event not found")
	}

	// Operator role is required to mutate anything in the operation;
	// authorship narrows the edit window so a peer operator cannot
	// rewrite someone else's annotation.
	if _, _, err := r.authorizeOperationOperator(ctx, row.OperationID.String()); err != nil {
		return nil, err
	}

	auth := gqlctx.AuthFromContext(ctx)
	if !authorization.IsAppAdmin(auth) {
		callerUID, err := uuid.Parse(auth.UserID)
		if err != nil {
			return nil, fmt.Errorf("forbidden: invalid caller ID")
		}
		if row.ActorID == nil || *row.ActorID != callerUID {
			return nil, fmt.Errorf("forbidden: only the author or an admin can edit this event")
		}
	}
	return &row, nil
}

// publishLogged re-uses the existing live-subscription channel so frontends
// invalidate the timeline cache after a custom event create/update.
func (r *timelineResolver) publishLogged(userID string, row *models.OperationEvent) {
	r.bus.Publish(eventbus.NewOperationEventLoggedEvent(
		eventbus.UserActor(userID),
		eventbus.OperationEventLoggedPayload{
			EventID:     row.EventID.String(),
			OperationID: row.OperationID.String(),
		},
	))
}

// customEventActorType and customEventActorName describe whoever is creating
// the marker. Split out rather than inlined because the row is built inside a
// long literal and the distinction is easy to lose there.
func customEventActorType(auth gqlctx.AuthInfo) models.EventActorType {
	if auth.Agent != nil {
		return models.EventActorAgent
	}
	return models.EventActorUser
}

func customEventActorName(auth gqlctx.AuthInfo) string {
	if auth.Agent != nil {
		return auth.Agent.Name
	}
	return ""
}

// customEventMetadata builds the metadata bag for a custom event. Empty
// fields are omitted so a glyph-less, description-less annotation serialises
// as "{}" rather than spraying empty-string keys onto the wire. The bucket
// aggregation coerces any missing emoji/icon/color back to "" when it builds
// the chip-grouping key, so omitting them here is lossless.
func customEventMetadata(description, emoji, icon, color string) map[string]any {
	meta := map[string]any{}
	if description != "" {
		meta["description"] = description
	}
	if emoji != "" {
		meta["emoji"] = emoji
	}
	if icon != "" {
		meta["icon"] = icon
	}
	if color != "" {
		meta["color"] = color
	}
	if len(meta) == 0 {
		return nil
	}
	return meta
}

// strOrEmpty dereferences an optional string field, treating nil as "". Keeps
// the custom-event create path free of repetitive nil checks.
func strOrEmpty(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// --- Field resolvers ---

func (r *timelineResolver) ID(_ context.Context, obj *models.OperationEvent) (string, error) {
	return obj.EventID.String(), nil
}

func (r *timelineResolver) OperationIDField(_ context.Context, obj *models.OperationEvent) (string, error) {
	return obj.OperationID.String(), nil
}

func (r *timelineResolver) SubjectID(_ context.Context, obj *models.OperationEvent) (string, error) {
	return obj.SubjectID.String(), nil
}

func (r *timelineResolver) SubjectKind(_ context.Context, obj *models.OperationEvent) (string, error) {
	return string(obj.SubjectKind), nil
}

// Actor returns the User behind the event, or nil for system / service actors
// and for users whose account was later deleted.
//
// Agent rows resolve to the OWNER of the agent key. They store that owner's id
// precisely so this works: filtering the timeline by an operator finds what
// their agent did for them, and every existing render site keeps showing a
// person rather than falling through to "System". Use actorKind and actorLabel
// to tell a delegated action from a hand-made one.
//
// This previously returned nil for anything but a plain user, so agent rows
// rendered as "System" everywhere — the schema documented the behaviour below
// while the code did the opposite.
func (r *timelineResolver) Actor(ctx context.Context, obj *models.OperationEvent) (*models.User, error) {
	switch obj.ActorType {
	case models.EventActorUser, models.EventActorAgent:
	default:
		return nil, nil
	}
	if obj.ActorID == nil {
		return nil, nil
	}
	user, err := gqlctx.LoadUser(ctx, r.userRepo, *obj.ActorID)
	if err != nil {
		return nil, nil
	}
	return &user, nil
}

// ActorKind lets the client distinguish an action the operator performed
// themselves from one their agent performed for them — both of which resolve
// to the same User through Actor.
func (r *timelineResolver) ActorKind(_ context.Context, obj *models.OperationEvent) (string, error) {
	if obj.ActorType == "" {
		return string(models.EventActorSystem), nil
	}
	return string(obj.ActorType), nil
}

// ActorLabel renders the actor for display: a username for a person,
// "Claude (via alice)" for an agent, the service name for a service.
//
// Built server-side rather than in the client because the agent name and the
// owner live in different places — the row and the user repo — and every
// surface that shows a timeline would otherwise have to reassemble it.
func (r *timelineResolver) ActorLabel(ctx context.Context, obj *models.OperationEvent) (string, error) {
	owner := ""
	if obj.ActorID != nil {
		if user, err := gqlctx.LoadUser(ctx, r.userRepo, *obj.ActorID); err == nil {
			owner = user.Username
		}
	}
	return actorLabel(obj, owner), nil
}

// ActorLabels resolves the labels for a whole page with one user query.
//
// ActorLabel per row is fine for GraphQL, where a dataloader sits in front
// of it; the MCP timeline tool called it in a loop and paid one lookup per
// event. Distinct actor ids are fetched together and joined in memory. A
// lookup failure leaves owners unnamed rather than failing the page.
func (r *timelineResolver) ActorLabels(ctx context.Context, events []*models.OperationEvent) []string {
	seen := map[uuid.UUID]bool{}
	var ids []uuid.UUID
	for _, e := range events {
		if e.ActorID != nil && !seen[*e.ActorID] {
			seen[*e.ActorID] = true
			ids = append(ids, *e.ActorID)
		}
	}
	names := map[uuid.UUID]string{}
	if users, err := r.userRepo.FindByIDs(ctx, ids); err == nil {
		for _, u := range users {
			names[u.UserID] = u.Username
		}
	}
	labels := make([]string, len(events))
	for i, e := range events {
		owner := ""
		if e.ActorID != nil {
			owner = names[*e.ActorID]
		}
		labels[i] = actorLabel(e, owner)
	}
	return labels
}

// actorLabel renders one event's actor given the owner's username, if any.
func actorLabel(obj *models.OperationEvent, owner string) string {
	switch obj.ActorType {
	case models.EventActorAgent:
		if obj.ActorName == "" {
			return owner
		}
		if owner == "" {
			return obj.ActorName
		}
		return obj.ActorName + " (via " + owner + ")"
	case models.EventActorService:
		return obj.ActorName
	case models.EventActorSystem:
		return ""
	default:
		return owner
	}
}

func (r *timelineResolver) OccurredAt(_ context.Context, obj *models.OperationEvent) (string, error) {
	return obj.OccurredAt.Format(time.RFC3339), nil
}

// Metadata serialises the row's free-form bag of topic-specific fields as a
// JSON string. Empty bag → empty string so the client never sees null.
func (r *timelineResolver) Metadata(_ context.Context, obj *models.OperationEvent) (string, error) {
	if len(obj.Metadata) == 0 {
		return "", nil
	}
	b, err := json.Marshal(obj.Metadata)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// FindByEventID is the subscription helper used by the GraphQL subscription
// resolver to refetch a row after TopicOperationEventLogged fires.
func (r *timelineResolver) FindByEventID(ctx context.Context, eventID uuid.UUID) (*models.OperationEvent, error) {
	ev, err := r.repo.FindByEventID(ctx, eventID)
	if err != nil {
		return nil, err
	}
	return &ev, nil
}

// --- helpers ---

// authorizeOperationViewer enforces "viewer or above in the operation" and
// returns the parsed operation UUID alongside the loaded operation row.
func (r *timelineResolver) authorizeOperationViewer(ctx context.Context, operationID string) (uuid.UUID, *models.Operation, error) {
	return r.authorizeOperationRole(ctx, operationID, models.OperationRoleViewer)
}

// authorizeOperationOperator is the write-path counterpart of
// authorizeOperationViewer. Custom event mutations require operator role.
func (r *timelineResolver) authorizeOperationOperator(ctx context.Context, operationID string) (uuid.UUID, *models.Operation, error) {
	return r.authorizeOperationRole(ctx, operationID, models.OperationRoleOperator)
}

// authorizeOperationRole resolves the operation id and enforces the minimum
// role. The Public operation special-case keeps custom events working on
// the synthetic operation: any authenticated caller is implicitly an
// operator there, mirroring AuthorizeOperationRole's own contract.
func (r *timelineResolver) authorizeOperationRole(ctx context.Context, operationID string, minRole models.OperationRole) (uuid.UUID, *models.Operation, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("invalid operation ID: %w", err)
	}
	if models.IsPublicOperation(opUID) {
		// Public operation is synthetic and has no Mongo row; any authenticated
		// caller is implicitly an operator (see authorization.AuthorizeOperationRole).
		if minRole == models.OperationRoleAdmin {
			return uuid.Nil, nil, fmt.Errorf("forbidden: public operation has no admins")
		}
		return opUID, nil, nil
	}
	op, err := r.operationRepo.FindByID(ctx, opUID)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("operation not found: %w", err)
	}
	if err := authorization.AuthorizeOperationRole(ctx, &op, minRole); err != nil {
		return uuid.Nil, nil, err
	}
	return opUID, &op, nil
}

func defaultGranularity(g *repository.TimelineGranularity) repository.TimelineGranularity {
	if g == nil || !g.IsValid() {
		return repository.GranularityDay
	}
	return *g
}

// parseSubjectKinds whitelists the subject_kind values clients can filter on
// — typos must surface as 400s, not silently match nothing.
func parseSubjectKinds(in []string) ([]models.SubjectKind, error) {
	if len(in) == 0 {
		return nil, nil
	}
	out := make([]models.SubjectKind, 0, len(in))
	for _, s := range in {
		sk := models.SubjectKind(s)
		switch sk {
		case models.SubjectKindCredential,
			models.SubjectKindHash,
			models.SubjectKindWikiDocument,
			models.SubjectKindCustomEvent,
			models.SubjectKindTask:
			out = append(out, sk)
		default:
			return nil, fmt.Errorf("unknown subject kind: %q", s)
		}
	}
	return out, nil
}

func parseUUIDList(in []string) ([]uuid.UUID, error) {
	if len(in) == 0 {
		return nil, nil
	}
	out := make([]uuid.UUID, 0, len(in))
	for _, s := range in {
		u, err := uuid.Parse(s)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, nil
}

func parseOptionalTime(s *string) (time.Time, error) {
	if s == nil || *s == "" {
		return time.Time{}, nil
	}
	return parseTime(*s)
}

func parseTime(s string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	// Allow a bare date for convenience — the resolver still needs a
	// timezone, but a "2026-05-23"-style input is the common cursor case.
	return time.Parse("2006-01-02", s)
}
