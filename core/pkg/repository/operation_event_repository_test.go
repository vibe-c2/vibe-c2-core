package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// TestBuildEventMatch_OperationOnly verifies the no-filter baseline scopes
// the query to the operation and nothing else.
func TestBuildEventMatch_OperationOnly(t *testing.T) {
	opID := uuid.New()
	m := buildEventMatch(opID, time.Time{}, time.Time{}, nil, nil)

	if m["operation_id"] != opID {
		t.Fatalf("operation_id missing or wrong: got %v", m["operation_id"])
	}
	if _, has := m["occurred_at"]; has {
		t.Fatalf("did not expect occurred_at range when both bounds are zero")
	}
	if _, has := m["subject_kind"]; has {
		t.Fatalf("did not expect subject_kind when types empty")
	}
	if _, has := m["actor_id"]; has {
		t.Fatalf("did not expect actor_id when actorIDs empty")
	}
}

// TestBuildEventMatch_RangeBounds verifies both edges of the occurred_at
// range land on the correct operators.
func TestBuildEventMatch_RangeBounds(t *testing.T) {
	opID := uuid.New()
	from := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 5, 23, 0, 0, 0, 0, time.UTC)

	m := buildEventMatch(opID, from, to, nil, nil)
	rng, ok := m["occurred_at"].(bson.M)
	if !ok {
		t.Fatalf("expected bson.M for occurred_at, got %T", m["occurred_at"])
	}
	if rng["$gte"] != from {
		t.Fatalf("$gte mismatch: got %v want %v", rng["$gte"], from)
	}
	if rng["$lt"] != to {
		t.Fatalf("$lt mismatch: got %v want %v", rng["$lt"], to)
	}
}

// TestBuildEventMatch_TypesAndActors verifies multi-value filters land as
// $in clauses on the right keys.
func TestBuildEventMatch_TypesAndActors(t *testing.T) {
	opID := uuid.New()
	a1, a2 := uuid.New(), uuid.New()
	types := []models.SubjectKind{models.SubjectKindCredential, models.SubjectKindWikiDocument}
	actors := []uuid.UUID{a1, a2}

	m := buildEventMatch(opID, time.Time{}, time.Time{}, types, actors)

	skPred, ok := m["subject_kind"].(bson.M)
	if !ok {
		t.Fatalf("expected bson.M for subject_kind, got %T", m["subject_kind"])
	}
	skIn, ok := skPred["$in"].([]models.SubjectKind)
	if !ok || len(skIn) != 2 {
		t.Fatalf("expected $in [2]SubjectKind, got %T (%v)", skPred["$in"], skPred["$in"])
	}

	actorPred, ok := m["actor_id"].(bson.M)
	if !ok {
		t.Fatalf("expected bson.M for actor_id, got %T", m["actor_id"])
	}
	actorIn, ok := actorPred["$in"].([]uuid.UUID)
	if !ok || len(actorIn) != 2 {
		t.Fatalf("expected $in [2]uuid.UUID, got %T (%v)", actorPred["$in"], actorPred["$in"])
	}
}

// TestTimelineGranularity_IsValid covers the supported and rejected cases.
func TestTimelineGranularity_IsValid(t *testing.T) {
	cases := []struct {
		g    TimelineGranularity
		want bool
	}{
		{GranularityDay, true},
		{GranularityWeek, true},
		{GranularityMonth, true},
		{TimelineGranularity(""), false},
		{TimelineGranularity("year"), false},
	}
	for _, tc := range cases {
		t.Run(string(tc.g), func(t *testing.T) {
			if got := tc.g.IsValid(); got != tc.want {
				t.Fatalf("IsValid(%q) = %v, want %v", tc.g, got, tc.want)
			}
		})
	}
}

// TestTruncateToGranularity_Day rounds a mid-day timestamp down to the start
// of its local day in the given timezone.
func TestTruncateToGranularity_Day(t *testing.T) {
	loc := mustLoadLocation(t, "Europe/Berlin")
	// 14:35 local on 2026-05-23 in Berlin.
	in := time.Date(2026, 5, 23, 14, 35, 0, 0, loc)
	got := truncateToGranularity(in, GranularityDay, loc)
	want := time.Date(2026, 5, 23, 0, 0, 0, 0, loc)
	if !got.Equal(want) {
		t.Fatalf("day trunc: got %v want %v", got, want)
	}
}

// TestTruncateToGranularity_WeekStartsMonday verifies the Monday-start
// convention used by Mongo $dateTrunc unit=week.
func TestTruncateToGranularity_WeekStartsMonday(t *testing.T) {
	loc := time.UTC
	// 2026-05-23 is a Saturday. Monday of that ISO week is 2026-05-18.
	in := time.Date(2026, 5, 23, 14, 35, 0, 0, loc)
	got := truncateToGranularity(in, GranularityWeek, loc)
	want := time.Date(2026, 5, 18, 0, 0, 0, 0, loc)
	if !got.Equal(want) {
		t.Fatalf("week trunc: got %v want %v", got, want)
	}

	// Sunday must roll *back* a full week to the prior Monday, not forward.
	sun := time.Date(2026, 5, 24, 3, 0, 0, 0, loc)
	gotSun := truncateToGranularity(sun, GranularityWeek, loc)
	wantSun := time.Date(2026, 5, 18, 0, 0, 0, 0, loc)
	if !gotSun.Equal(wantSun) {
		t.Fatalf("week trunc (Sunday): got %v want %v", gotSun, wantSun)
	}
}

// TestTruncateToGranularity_Month rolls back to first-of-month.
func TestTruncateToGranularity_Month(t *testing.T) {
	loc := time.UTC
	in := time.Date(2026, 5, 23, 14, 35, 0, 0, loc)
	got := truncateToGranularity(in, GranularityMonth, loc)
	want := time.Date(2026, 5, 1, 0, 0, 0, 0, loc)
	if !got.Equal(want) {
		t.Fatalf("month trunc: got %v want %v", got, want)
	}
}

// TestAdvanceGranularity verifies each unit advances by exactly one bucket.
func TestAdvanceGranularity(t *testing.T) {
	loc := time.UTC
	start := time.Date(2026, 5, 18, 0, 0, 0, 0, loc)

	if got, want := advanceGranularity(start, GranularityDay), start.AddDate(0, 0, 1); !got.Equal(want) {
		t.Fatalf("day advance: got %v want %v", got, want)
	}
	if got, want := advanceGranularity(start, GranularityWeek), start.AddDate(0, 0, 7); !got.Equal(want) {
		t.Fatalf("week advance: got %v want %v", got, want)
	}
	monthStart := time.Date(2026, 5, 1, 0, 0, 0, 0, loc)
	if got, want := advanceGranularity(monthStart, GranularityMonth), time.Date(2026, 6, 1, 0, 0, 0, 0, loc); !got.Equal(want) {
		t.Fatalf("month advance: got %v want %v", got, want)
	}
}

func mustLoadLocation(t *testing.T, name string) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation(name)
	if err != nil {
		t.Fatalf("LoadLocation(%q): %v", name, err)
	}
	return loc
}
