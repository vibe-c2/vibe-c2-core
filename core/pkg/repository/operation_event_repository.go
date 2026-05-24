package repository

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const operationEventCollection = "operation_events"

// TimelineGranularity is the bucket size used by Buckets aggregation.
// Day/week/month map directly to Mongo $dateTrunc units, so the canonical
// Go values are lowercase ("day"/"week"/"month"). GraphQL enums arrive
// uppercase (DAY/WEEK/MONTH), so MarshalGQL/UnmarshalGQL bridge the two —
// without that bridge, "WEEK" would slip through as an invalid value and
// silently fall back to DAY at the resolver, returning daily buckets for
// a Week view (see the OperationRole pattern in pkg/models).
type TimelineGranularity string

const (
	GranularityDay   TimelineGranularity = "day"
	GranularityWeek  TimelineGranularity = "week"
	GranularityMonth TimelineGranularity = "month"
)

// IsValid reports whether the value is one of the supported units.
func (g TimelineGranularity) IsValid() bool {
	switch g {
	case GranularityDay, GranularityWeek, GranularityMonth:
		return true
	}
	return false
}

// MarshalGQL writes the granularity as a quoted uppercase GraphQL enum
// value (e.g. "week" -> "WEEK").
func (g TimelineGranularity) MarshalGQL(w io.Writer) {
	fmt.Fprintf(w, "%q", strings.ToUpper(string(g)))
}

// UnmarshalGQL reads a GraphQL enum value and converts to the lowercase
// Mongo unit (e.g. "WEEK" -> "week").
func (g *TimelineGranularity) UnmarshalGQL(v interface{}) error {
	str, ok := v.(string)
	if !ok {
		return fmt.Errorf("TimelineGranularity must be a string")
	}
	val := TimelineGranularity(strings.ToLower(str))
	if !val.IsValid() {
		return fmt.Errorf("invalid TimelineGranularity: %s", str)
	}
	*g = val
	return nil
}

// BucketQuery is the input for the timeline axis aggregation.
//
// From/To are inclusive bounds against occurred_at. If both are zero,
// no time bound is applied — useful for "from operation creation
// through today". Timezone is an IANA name (e.g. "Europe/Berlin")
// passed straight to $dateTrunc so day/week boundaries land where
// the viewer expects.
type BucketQuery struct {
	OperationID uuid.UUID
	From        time.Time
	To          time.Time
	Types       []models.SubjectKind
	ActorIDs    []uuid.UUID
	Granularity TimelineGranularity
	Timezone    string
}

// Bucket is one element of the axis: the start-of-bucket timestamp
// (in the requested timezone), the count of events in it, and the
// per-topic breakdown used by the axis to render the dot stack without
// fetching the underlying events.
type Bucket struct {
	BucketStart time.Time     `bson:"_id"`
	Count       int           `bson:"count"`
	Topics      []TopicBucket `bson:"topics"`
}

// TopicBucket is the per-(topic, subject_kind) tally inside a Bucket.
// Events with the same topic always share the same subject_kind, so the
// pair is stable and server-side grouping by both is safe.
type TopicBucket struct {
	Topic       string             `bson:"topic"`
	SubjectKind models.SubjectKind `bson:"subject_kind"`
	Count       int                `bson:"count"`
}

// DayQuery selects the events that fall within a single bucket at the
// query's granularity. Date is the start of the bucket in the
// viewer's timezone (midnight for day, Monday for week, first-of-month
// for month).
type DayQuery struct {
	OperationID uuid.UUID
	Date        time.Time
	Timezone    string
	Granularity TimelineGranularity
	Types       []models.SubjectKind
	ActorIDs    []uuid.UUID
	First       int64
	After       string
}

// CustomEventUpdate carries the editable subset of a custom-event row.
// Pointer fields are partial-update semantics: nil = leave unchanged.
type CustomEventUpdate struct {
	Name        *string
	Description *string
	OccurredAt  *time.Time
}

// IOperationEventRepository defines persistence and read operations for
// the timeline event log.
type IOperationEventRepository interface {
	Insert(ctx context.Context, e *models.OperationEvent) error
	InsertMany(ctx context.Context, events []*models.OperationEvent) error
	FindByEventID(ctx context.Context, eventID uuid.UUID) (models.OperationEvent, error)
	Buckets(ctx context.Context, q BucketQuery) ([]Bucket, error)
	ListByDay(ctx context.Context, q DayQuery) ([]models.OperationEvent, pagination.PageInfo, error)
	IsEmpty(ctx context.Context) (bool, error)

	// UpdateCustomEvent mutates the editable fields of a custom-event row
	// in place. The filter pins subject_kind=custom_event so the method
	// cannot mutate a system-generated row even if a forged event_id is
	// supplied. Returns the post-update document.
	UpdateCustomEvent(ctx context.Context, eventID uuid.UUID, upd CustomEventUpdate) (models.OperationEvent, error)

	// DeleteCustomEvent removes a custom-event row. Same subject_kind
	// guard as UpdateCustomEvent — only custom events are deletable.
	DeleteCustomEvent(ctx context.Context, eventID uuid.UUID) error
}

type operationEventRepository struct {
	coll database.Collection
}

// NewOperationEventRepository wires the collection and ensures indexes
// at startup. Index creation is best-effort idempotent (qmgo NO-OPs on
// pre-existing indexes with matching specs).
func NewOperationEventRepository(db database.Database) IOperationEventRepository {
	coll := db.Collection(operationEventCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"event_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"operation_id", "-occurred_at"}},
		{Key: []string{"operation_id", "subject_kind", "-occurred_at"}},
		{Key: []string{"operation_id", "actor_id", "-occurred_at"}},
	})

	return &operationEventRepository{coll: coll}
}

func (r *operationEventRepository) Insert(ctx context.Context, e *models.OperationEvent) error {
	_, err := r.coll.InsertOne(ctx, e)
	return err
}

// FindByEventID returns the row with the given event id. Used by the live
// subscription to fan a logged event out to clients with the full payload.
func (r *operationEventRepository) FindByEventID(ctx context.Context, eventID uuid.UUID) (models.OperationEvent, error) {
	var e models.OperationEvent
	err := r.coll.FindOne(ctx, bson.M{"event_id": eventID}).One(&e)
	return e, err
}

// InsertMany inserts a batch of events. Pre-checks for empty input so
// callers can hand off raw batches without a guard.
func (r *operationEventRepository) InsertMany(ctx context.Context, events []*models.OperationEvent) error {
	if len(events) == 0 {
		return nil
	}
	_, err := r.coll.InsertMany(ctx, events)
	return err
}

// Buckets aggregates events into time-bucketed counts using Mongo's
// $dateTrunc in the requested IANA timezone. Returns buckets that
// have at least one event; gap segments are computed client-side by
// walking from the operation creation date to today.
func (r *operationEventRepository) Buckets(ctx context.Context, q BucketQuery) ([]Bucket, error) {
	if !q.Granularity.IsValid() {
		return nil, fmt.Errorf("invalid granularity: %q", q.Granularity)
	}
	if q.Timezone == "" {
		return nil, fmt.Errorf("timezone is required")
	}

	match := buildEventMatch(q.OperationID, q.From, q.To, q.Types, q.ActorIDs)

	trunc := bson.M{
		"date":     "$occurred_at",
		"unit":     string(q.Granularity),
		"timezone": q.Timezone,
	}
	// Mongo $dateTrunc defaults startOfWeek to "sunday". The rest of the
	// timeline code (repo truncation, frontend axis, ListByDay range filter)
	// uses ISO 8601 Monday-start. Without this override every WEEK bucket
	// returned by Buckets would be Sunday-aligned while ListByDay would query
	// the Monday-Sunday range — same week conceptually, but the bucketStart
	// in axis and the day-list events come from different intervals on a
	// Sunday. Pin the start to Monday so both paths agree.
	if q.Granularity == GranularityWeek {
		trunc["startOfWeek"] = "monday"
	}

	// Two-stage $group: first by (bucket, topic, subject_kind), then fold
	// per-bucket so each output row carries the bucket total plus the
	// per-topic breakdown. Scanning the operation_events match set twice
	// in-pipeline is still far cheaper than the previous frontend N+1
	// (one timelineEventsByDay query per active bucket on page load).
	pipeline := bson.A{
		bson.M{"$match": match},
		bson.M{"$group": bson.M{
			"_id": bson.M{
				"bucket":       bson.M{"$dateTrunc": trunc},
				"topic":        "$topic",
				"subject_kind": "$subject_kind",
			},
			"count": bson.M{"$sum": 1},
		}},
		bson.M{"$group": bson.M{
			"_id":   "$_id.bucket",
			"count": bson.M{"$sum": "$count"},
			"topics": bson.M{"$push": bson.M{
				"topic":        "$_id.topic",
				"subject_kind": "$_id.subject_kind",
				"count":        "$count",
			}},
		}},
		bson.M{"$sort": bson.M{"_id": 1}},
	}

	var rows []Bucket
	if err := r.coll.Aggregate(ctx, pipeline).All(&rows); err != nil {
		return nil, fmt.Errorf("aggregate buckets: %w", err)
	}
	// Sort each bucket's topic list deterministically: count desc, then
	// topic asc. Mirrors the frontend's previous client-side sort so the
	// dot stack order stays stable when we drop the per-bucket event fetch.
	for i := range rows {
		topics := rows[i].Topics
		sortTopicBuckets(topics)
	}
	return rows, nil
}

// sortTopicBuckets orders a topic breakdown by count desc, then topic asc.
// Pulled out for readability and so the test suite can exercise the order
// without spinning up a Mongo aggregation.
func sortTopicBuckets(ts []TopicBucket) {
	if len(ts) < 2 {
		return
	}
	// Simple insertion sort — topic counts per bucket are small (one entry
	// per distinct (topic, subject_kind) pair), so allocating a sort.Slice
	// closure would be more overhead than the sort itself.
	for i := 1; i < len(ts); i++ {
		cur := ts[i]
		j := i - 1
		for j >= 0 && lessTopicBucket(cur, ts[j]) {
			ts[j+1] = ts[j]
			j--
		}
		ts[j+1] = cur
	}
}

func lessTopicBucket(a, b TopicBucket) bool {
	if a.Count != b.Count {
		return a.Count > b.Count
	}
	return a.Topic < b.Topic
}

// ListByDay returns the events in a single bucket, newest first.
// Cursor pagination is keyed on occurred_at + _id for stability across
// events with identical timestamps.
func (r *operationEventRepository) ListByDay(ctx context.Context, q DayQuery) ([]models.OperationEvent, pagination.PageInfo, error) {
	if !q.Granularity.IsValid() {
		return nil, pagination.PageInfo{}, fmt.Errorf("invalid granularity: %q", q.Granularity)
	}
	if q.Timezone == "" {
		return nil, pagination.PageInfo{}, fmt.Errorf("timezone is required")
	}

	loc, err := time.LoadLocation(q.Timezone)
	if err != nil {
		return nil, pagination.PageInfo{}, fmt.Errorf("invalid timezone %q: %w", q.Timezone, err)
	}

	from := truncateToGranularity(q.Date.In(loc), q.Granularity, loc)
	to := advanceGranularity(from, q.Granularity)

	filter := buildEventMatch(q.OperationID, from, to, q.Types, q.ActorIDs)

	var cursor *pagination.Cursor
	if q.After != "" {
		c, err := pagination.DecodeCursor(q.After)
		if err != nil {
			return nil, pagination.PageInfo{}, err
		}
		cursor = &c
	}
	if cursorFilter := pagination.BuildCursorFilterOn(cursor, true, "occurred_at"); len(cursorFilter) > 0 {
		for k, v := range cursorFilter {
			filter[k] = v
		}
	}

	limit := q.First
	if limit <= 0 {
		limit = 100
	}

	var events []models.OperationEvent
	err = r.coll.Find(ctx, filter).
		Sort(pagination.SortFieldsOn(true, "occurred_at")...).
		Limit(limit + 1). // +1 to detect HasNextPage cheaply
		All(&events)
	if err != nil {
		return nil, pagination.PageInfo{}, fmt.Errorf("list events by day: %w", err)
	}

	hasNext := int64(len(events)) > limit
	if hasNext {
		events = events[:limit]
	}

	pageInfo := pagination.PageInfo{
		HasNextPage:     hasNext,
		HasPreviousPage: cursor != nil,
	}
	if len(events) > 0 {
		startCur := pagination.EncodeCursor(events[0].OccurredAt, events[0].Id)
		endCur := pagination.EncodeCursor(events[len(events)-1].OccurredAt, events[len(events)-1].Id)
		pageInfo.StartCursor = &startCur
		pageInfo.EndCursor = &endCur
	}

	return events, pageInfo, nil
}

// UpdateCustomEvent updates the editable fields of a custom-event row.
// The subject_kind guard makes this method a no-op (mongo.ErrNoDocuments
// wrapped) on system-generated rows, so it is safe to call with any
// caller-supplied event id.
func (r *operationEventRepository) UpdateCustomEvent(
	ctx context.Context,
	eventID uuid.UUID,
	upd CustomEventUpdate,
) (models.OperationEvent, error) {
	set := bson.M{}
	if upd.Name != nil {
		set["subject_name"] = *upd.Name
	}
	if upd.Description != nil {
		// Metadata is a sub-document; using dotted path so we don't
		// blow away unrelated metadata keys a future schema may add.
		set["metadata.description"] = *upd.Description
	}
	if upd.OccurredAt != nil {
		set["occurred_at"] = upd.OccurredAt.UTC()
	}
	if len(set) == 0 {
		// No-op update — just return the current row.
		return r.FindByEventID(ctx, eventID)
	}

	filter := bson.M{
		"event_id":     eventID,
		"subject_kind": models.SubjectKindCustomEvent,
	}
	if err := r.coll.UpdateOne(ctx, filter, bson.M{"$set": set}); err != nil {
		return models.OperationEvent{}, fmt.Errorf("update custom event: %w", err)
	}

	var out models.OperationEvent
	if err := r.coll.FindOne(ctx, filter).One(&out); err != nil {
		return models.OperationEvent{}, fmt.Errorf("fetch updated custom event: %w", err)
	}
	return out, nil
}

// DeleteCustomEvent removes a custom-event row. The subject_kind guard
// prevents a forged event_id from deleting a system-generated row.
func (r *operationEventRepository) DeleteCustomEvent(ctx context.Context, eventID uuid.UUID) error {
	filter := bson.M{
		"event_id":     eventID,
		"subject_kind": models.SubjectKindCustomEvent,
	}
	if err := r.coll.Remove(ctx, filter); err != nil {
		return fmt.Errorf("delete custom event: %w", err)
	}
	return nil
}

// IsEmpty reports whether the collection has zero rows. Used by the
// backfill to decide whether to seed.
func (r *operationEventRepository) IsEmpty(ctx context.Context) (bool, error) {
	n, err := r.coll.Count(ctx, bson.M{})
	if err != nil {
		return false, fmt.Errorf("count operation_events: %w", err)
	}
	return n == 0, nil
}

// buildEventMatch composes the shared $match stage used by both
// Buckets and ListByDay.
func buildEventMatch(opID uuid.UUID, from, to time.Time, types []models.SubjectKind, actorIDs []uuid.UUID) bson.M {
	match := bson.M{"operation_id": opID}

	if !from.IsZero() || !to.IsZero() {
		rng := bson.M{}
		if !from.IsZero() {
			rng["$gte"] = from
		}
		if !to.IsZero() {
			rng["$lt"] = to
		}
		match["occurred_at"] = rng
	}
	if len(types) > 0 {
		match["subject_kind"] = bson.M{"$in": types}
	}
	if len(actorIDs) > 0 {
		match["actor_id"] = bson.M{"$in": actorIDs}
	}
	return match
}

// truncateToGranularity rounds a timezone-localised instant down to the
// start of its day/week/month boundary. Week starts on Monday to match
// ISO 8601 (Mongo $dateTrunc with unit="week" uses the same).
func truncateToGranularity(t time.Time, g TimelineGranularity, loc *time.Location) time.Time {
	switch g {
	case GranularityWeek:
		// Shift so Monday = 0.
		offset := (int(t.Weekday()) + 6) % 7
		day := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
		return day.AddDate(0, 0, -offset)
	case GranularityMonth:
		return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, loc)
	default:
		return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
	}
}

// advanceGranularity returns the exclusive end of the bucket starting at t.
func advanceGranularity(t time.Time, g TimelineGranularity) time.Time {
	switch g {
	case GranularityWeek:
		return t.AddDate(0, 0, 7)
	case GranularityMonth:
		return t.AddDate(0, 1, 0)
	default:
		return t.AddDate(0, 0, 1)
	}
}
