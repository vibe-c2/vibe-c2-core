package resolver

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/authorization"
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

	// Field resolvers for TimelineEvent
	ID(ctx context.Context, obj *models.OperationEvent) (string, error)
	OperationIDField(ctx context.Context, obj *models.OperationEvent) (string, error)
	SubjectID(ctx context.Context, obj *models.OperationEvent) (string, error)
	SubjectKind(ctx context.Context, obj *models.OperationEvent) (string, error)
	Actor(ctx context.Context, obj *models.OperationEvent) (*models.User, error)
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
}

// NewTimelineResolver wires the timeline resolver. The operation repo is used
// for membership checks; the user repo resolves actors.
func NewTimelineResolver(
	repo repository.IOperationEventRepository,
	operationRepo repository.IOperationRepository,
	userRepo repository.IUserRepository,
) ITimelineResolver {
	return &timelineResolver{repo: repo, operationRepo: operationRepo, userRepo: userRepo}
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
		out = append(out, &model.TimelineBucket{
			BucketStart: b.BucketStart.Format(time.RFC3339),
			Count:       b.Count,
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

// Actor returns the User that originated the event, or nil for system /
// service actors and for users whose account was later deleted.
func (r *timelineResolver) Actor(ctx context.Context, obj *models.OperationEvent) (*models.User, error) {
	if obj.ActorType != models.EventActorUser || obj.ActorID == nil {
		return nil, nil
	}
	user, err := r.userRepo.FindByID(ctx, *obj.ActorID)
	if err != nil {
		return nil, nil
	}
	return &user, nil
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
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("invalid operation ID: %w", err)
	}
	if models.IsPublicOperation(opUID) {
		// Public operation is synthetic and has no Mongo row; any authenticated
		// caller is implicitly an operator (see authorization.AuthorizeOperationRole).
		// The timeline simply returns whatever events the persistence subscriber
		// has logged against the public operation id.
		return opUID, nil, nil
	}
	op, err := r.operationRepo.FindByID(ctx, opUID)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("operation not found: %w", err)
	}
	if err := authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleViewer); err != nil {
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
		case models.SubjectKindCredential, models.SubjectKindWikiDocument:
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
