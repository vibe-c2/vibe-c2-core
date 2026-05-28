package repository

import (
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// TestBuildTaskFilter_OperationAndActiveByDefault verifies the bare filter
// scopes to the operation and excludes trashed rows — the invariant the
// kanban and matrix views rely on.
func TestBuildTaskFilter_OperationAndActiveByDefault(t *testing.T) {
	opID := uuid.New()
	q := buildTaskFilter(opID, TaskFilter{})

	if q["operation_id"] != opID {
		t.Fatalf("operation_id missing or wrong: got %v", q["operation_id"])
	}
	if q["deleted_at"] != nil {
		t.Fatalf("expected deleted_at: nil for active list, got %v", q["deleted_at"])
	}
}

// TestBuildTaskFilter_TrashedSelectsDeleted flips the toggle and verifies
// the filter matches only soft-deleted rows.
func TestBuildTaskFilter_TrashedSelectsDeleted(t *testing.T) {
	opID := uuid.New()
	q := buildTaskFilter(opID, TaskFilter{Trashed: true})

	delFilter, ok := q["deleted_at"].(bson.M)
	if !ok {
		t.Fatalf("expected deleted_at to be bson.M, got %T", q["deleted_at"])
	}
	if delFilter["$ne"] != nil {
		t.Fatalf("expected deleted_at: {$ne: nil}, got %v", delFilter)
	}
}

// TestBuildTaskFilter_StageNarrowsToColumn verifies the stage filter
// (used by the kanban column queries when the view chooses to lazy-load
// per column instead of fetching all stages at once).
func TestBuildTaskFilter_StageNarrowsToColumn(t *testing.T) {
	opID := uuid.New()
	q := buildTaskFilter(opID, TaskFilter{Stage: models.TaskStageInProcess})

	if q["stage"] != models.TaskStageInProcess {
		t.Fatalf("stage filter missing or wrong: got %v", q["stage"])
	}
}

// TestBuildTaskFilter_EmptyStageDoesNotConstrain confirms passing the
// zero-value stage leaves stage unfiltered — the matrix view path
// (all-stages fetch) needs this.
func TestBuildTaskFilter_EmptyStageDoesNotConstrain(t *testing.T) {
	opID := uuid.New()
	q := buildTaskFilter(opID, TaskFilter{})

	if _, present := q["stage"]; present {
		t.Fatalf("did not expect stage filter when Stage is empty")
	}
}

// TestBuildTaskFilter_SearchEscapesRegexMetachars guards against ReDoS /
// accidental broad matches via untrusted search input. Same shape as the
// wiki / credential equivalents.
func TestBuildTaskFilter_SearchEscapesRegexMetachars(t *testing.T) {
	opID := uuid.New()

	cases := []struct {
		name   string
		search string
		want   string
	}{
		{"plain", "deploy", "deploy"},
		{"dot-star", ".*", `\.\*`},
		{"redos", "(a+)+$", `\(a\+\)\+\$`},
		{"anchors", "^foo$", `\^foo\$`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			q := buildTaskFilter(opID, TaskFilter{Search: tc.search})

			orVal, ok := q["$or"].(bson.A)
			if !ok {
				t.Fatalf("expected $or bson.A, got %T", q["$or"])
			}
			if len(orVal) != 2 {
				t.Fatalf("expected $or with 2 branches (name/description), got %d", len(orVal))
			}
			first, ok := orVal[0].(bson.M)
			if !ok {
				t.Fatalf("expected $or[0] to be bson.M")
			}
			nameRx, ok := first["name"].(bson.M)
			if !ok {
				t.Fatalf("expected name regex to be bson.M")
			}
			if got := nameRx["$regex"]; got != tc.want {
				t.Fatalf("expected escaped regex %q, got %q", tc.want, got)
			}
			if nameRx["$options"] != "i" {
				t.Fatalf("expected case-insensitive $options=i, got %v", nameRx["$options"])
			}
		})
	}
}

// TestBuildTaskFilter_CombinesAllConstraints verifies layered filters
// land on independent BSON keys (op_id + deleted_at + stage + $or search).
func TestBuildTaskFilter_CombinesAllConstraints(t *testing.T) {
	opID := uuid.New()
	q := buildTaskFilter(opID, TaskFilter{
		Stage:  models.TaskStageDone,
		Search: "audit",
	})

	if q["operation_id"] != opID {
		t.Fatalf("operation_id missing")
	}
	if q["stage"] != models.TaskStageDone {
		t.Fatalf("stage missing")
	}
	if q["deleted_at"] != nil {
		t.Fatalf("expected active filter")
	}
	if _, ok := q["$or"].(bson.A); !ok {
		t.Fatalf("expected $or for search, got %T", q["$or"])
	}
}
