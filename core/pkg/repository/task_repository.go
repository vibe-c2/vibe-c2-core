package repository

import (
	"context"
	"fmt"
	"regexp"
	"time"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const taskCollection = "tasks"

// TaskFilter bundles list-query constraints. Stage filters narrow to a
// single kanban column; an empty Stage means "all stages". Trashed is the
// list/trash toggle — list views always pass Trashed=false, the dedicated
// trash query passes Trashed=true.
//
// RiskScoreMin/Max and ProfitScoreMin/Max are inclusive bounds for the
// matrix-quadrant queries (e.g. "high profit, low risk" → ProfitScoreMin=5,
// RiskScoreMax=4). Zero means "no lower bound"; a negative max means "no
// upper bound" — both are unset by default so an empty filter matches all
// scores. ExcludeStages drops tasks in any of the listed stages, used by
// the matrix view to skip DONE (and optionally BACKLOG).
type TaskFilter struct {
	// Stage, if non-empty, restricts to tasks in this kanban column.
	Stage models.TaskStage
	// ExcludeStages, if non-empty, drops rows whose stage is in the list.
	// Mutually compatible with Stage (intersection — but the matrix view
	// only uses one or the other).
	ExcludeStages []models.TaskStage
	// RiskScoreMin / RiskScoreMax: inclusive bounds for risk_score. Nil on
	// either side means "unbounded" — both nil disables the risk filter.
	RiskScoreMin *int
	RiskScoreMax *int
	// ProfitScoreMin / ProfitScoreMax: inclusive bounds for profit_score.
	ProfitScoreMin *int
	ProfitScoreMax *int
	// Search matches case-insensitively against name and description.
	Search string
	// Trashed: false = only active rows (deleted_at == nil), true = only
	// soft-deleted rows (deleted_at != nil).
	Trashed bool
}

// ITaskRepository defines the interface for Task database operations.
// The repository mirrors the wiki_document pattern: soft-delete via
// DeletedAt, hard-delete reserved for admin purge / cascade-on-operation-
// delete. Cursor pagination uses the shared pkg/pagination helpers and
// sorts by createAt DESC (operator-specified — see CLAUDE.md plan).
type ITaskRepository interface {
	Create(ctx context.Context, t *models.Task) error
	FindByID(ctx context.Context, id uuid.UUID) (models.Task, error)

	// FindByOperationIDWithCursor lists active tasks in the operation,
	// ordered by createAt DESC (matches the kanban column auto-sort).
	FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter TaskFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Task, error)
	CountByOperationID(ctx context.Context, opID uuid.UUID, filter TaskFilter) (int64, error)

	// FindAllByOperationID returns every active task in the operation in a
	// single pass. Drives the kanban + matrix views, which need to render
	// all stages at once. Bounded by the operation's task count; revisit
	// if operations grow into the thousands.
	FindAllByOperationID(ctx context.Context, opID uuid.UUID) ([]models.Task, error)

	// FindTrashedByOperationIDWithCursor lists soft-deleted tasks ordered
	// by deleted_at DESC (most recently trashed first). Same cursor shape
	// as wiki trash listing.
	FindTrashedByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Task, error)

	Update(ctx context.Context, t *models.Task, updates map[string]interface{}) error

	SoftDelete(ctx context.Context, t *models.Task, deletedByID uuid.UUID) error
	Restore(ctx context.Context, t *models.Task) error
	HardDelete(ctx context.Context, t *models.Task) error

	// HardDeleteByOperationID purges every task in the operation. Called
	// when an operation is permanently deleted. Removes trashed and active
	// rows alike.
	HardDeleteByOperationID(ctx context.Context, opID uuid.UUID) error
	HardDeleteTrashed(ctx context.Context, opID uuid.UUID) error

	// AddWikiReference atomically appends wikiID to the task's
	// wiki_references array via $addToSet — idempotent and race-free against
	// concurrent edits from any other surface. Also stamps last_updated_at /
	// last_updated_by_id so the audit trail mirrors the set-style mutations.
	// Caller is responsible for size-cap and operation-scope checks before
	// calling; the repo write itself does not enforce either.
	AddWikiReference(ctx context.Context, taskID, wikiID, callerID uuid.UUID) error

	// PullWikiReference removes wikiID from the wiki_references array on
	// every active or trashed task in opID. Called by the wiki document
	// hard-delete path so dangling pointers don't accumulate. A miss (the
	// wiki was never referenced) silently affects zero rows.
	PullWikiReference(ctx context.Context, opID, wikiID uuid.UUID) error

	// PullCredentialReference is the credential equivalent of
	// PullWikiReference. Wired into the credential hard-delete path.
	PullCredentialReference(ctx context.Context, opID, credentialID uuid.UUID) error

	// FindWikiReferrers returns active tasks in opID whose wiki_references
	// array contains wikiID. Powers the "tasks referencing this wiki doc"
	// reverse query. Ordered by most recently updated; capped at limit.
	FindWikiReferrers(ctx context.Context, opID, wikiID uuid.UUID, limit int64) ([]models.Task, error)

	// FindCredentialReferrers is the credential counterpart to
	// FindWikiReferrers.
	FindCredentialReferrers(ctx context.Context, opID, credentialID uuid.UUID, limit int64) ([]models.Task, error)

	// BackfillDoneAt stamps done_at on every DONE-stage task that is
	// missing the field, using the row's updateAt as the best available
	// proxy for "most recent completion time". Idempotent: subsequent
	// calls match zero rows. Called once at startup so legacy DONE tasks
	// participate in the DONE column's done_at DESC ordering instead of
	// collapsing to the bottom (null-sorts-last).
	BackfillDoneAt(ctx context.Context) (int64, error)
}

type taskRepository struct {
	coll database.Collection
}

// NewTaskRepository constructs the repository and registers its indexes
// inline (matches the wiki/credential pattern — every repo owns its own
// index registration at startup, no migration step).
func NewTaskRepository(db database.Database) ITaskRepository {
	coll := db.Collection(taskCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		// Unique business id.
		{Key: []string{"task_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		// Base list: operation scope + trashed filter.
		{Key: []string{"operation_id", "deleted_at"}},
		// Kanban column read: filter by stage within an op, sort by createAt
		// DESC (the column auto-sort). The trailing -_id breaks createAt ties.
		// Covers BACKLOG / TODO / IN_PROCESS columns.
		{Key: []string{"operation_id", "stage", "-createAt", "-_id"}},
		// DONE column read: same shape but sorted by done_at DESC — the
		// "most recently completed first" ordering operators expect on the
		// Done column. Separate index so neither column degrades to a
		// scan + sort.
		{Key: []string{"operation_id", "stage", "-done_at", "-_id"}},
		// Matrix view: risk × profit scan within an op, restricted to active.
		{Key: []string{"operation_id", "risk_score", "profit_score", "deleted_at"}},
		// Multikey: assignees lookup ("my tasks in this op").
		{Key: []string{"operation_id", "assignee_ids", "deleted_at"}},
		// Multikey: reverse reference lookups for cleanup hooks and "tasks
		// referencing this wiki/credential" queries.
		{Key: []string{"operation_id", "wiki_references", "deleted_at"}},
		{Key: []string{"operation_id", "credential_references", "deleted_at"}},
		// Trash listing: deleted_at DESC, _id as tiebreaker. Matches the
		// hand-built cursor in FindTrashedByOperationIDWithCursor.
		{Key: []string{"operation_id", "-deleted_at", "_id"}},
	})

	return &taskRepository{coll: coll}
}

func (r *taskRepository) Create(ctx context.Context, t *models.Task) error {
	// Normalize nil slices to empty slices so multikey indexes and JSON
	// rendering behave consistently. The model documents the invariant;
	// the repo enforces it at the write boundary.
	if t.AssigneeIDs == nil {
		t.AssigneeIDs = []uuid.UUID{}
	}
	if t.WikiReferences == nil {
		t.WikiReferences = []uuid.UUID{}
	}
	if t.CredentialReferences == nil {
		t.CredentialReferences = []uuid.UUID{}
	}
	_, err := r.coll.InsertOne(ctx, t)
	return err
}

func (r *taskRepository) FindByID(ctx context.Context, id uuid.UUID) (models.Task, error) {
	var t models.Task
	err := r.coll.FindOne(ctx, bson.M{"task_id": id}).One(&t)
	return t, err
}

func (r *taskRepository) FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter TaskFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Task, error) {
	q := buildTaskFilter(opID, filter)

	// The DONE column sorts by completion time (done_at), every other
	// stage sorts by creation time (createAt). The cursor's encoded shape
	// is identical in both modes; only the field name driving the filter
	// and sort changes. The matrix view never narrows to DONE (DONE is
	// excluded from the matrix), so this branch fires only for the DONE
	// kanban column.
	sortField := "createAt"
	if filter.Stage == models.TaskStageDone {
		sortField = "done_at"
	}

	q = pagination.ApplyCursorFilterOn(q, cursor, forward, sortField)

	var tasks []models.Task
	err := r.coll.Find(ctx, q).
		Sort(pagination.SortFieldsOn(forward, sortField)...).
		Limit(limit).
		All(&tasks)

	if !forward && len(tasks) > 0 {
		for i, j := 0, len(tasks)-1; i < j; i, j = i+1, j-1 {
			tasks[i], tasks[j] = tasks[j], tasks[i]
		}
	}

	return tasks, err
}

func (r *taskRepository) CountByOperationID(ctx context.Context, opID uuid.UUID, filter TaskFilter) (int64, error) {
	return r.coll.Count(ctx, buildTaskFilter(opID, filter))
}

func (r *taskRepository) FindAllByOperationID(ctx context.Context, opID uuid.UUID) ([]models.Task, error) {
	var tasks []models.Task
	err := r.coll.Find(ctx, bson.M{
		"operation_id": opID,
		"deleted_at":   nil,
	}).Sort("-createAt", "-_id").All(&tasks)
	return tasks, err
}

// FindTrashedByOperationIDWithCursor sorts by deleted_at DESC + _id ASC.
// The mixed sort direction means the cursor is built by hand instead of
// reusing the generic pagination helper — same shape as the wiki trash
// listing in wiki_document_repository.go.
func (r *taskRepository) FindTrashedByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Task, error) {
	q := bson.M{
		"operation_id": opID,
		"deleted_at":   bson.M{"$ne": nil},
	}

	if cursor != nil {
		timeOp, idOp := "$lt", "$gt"
		if !forward {
			timeOp, idOp = "$gt", "$lt"
		}
		q["$or"] = bson.A{
			bson.M{"deleted_at": bson.M{timeOp: cursor.CreateAt}},
			bson.M{
				"deleted_at": cursor.CreateAt,
				"_id":        bson.M{idOp: cursor.ID},
			},
		}
	}

	sort := []string{"-deleted_at", "_id"}
	if !forward {
		sort = []string{"deleted_at", "-_id"}
	}

	var tasks []models.Task
	err := r.coll.Find(ctx, q).
		Sort(sort...).
		Limit(limit).
		All(&tasks)

	if !forward && len(tasks) > 0 {
		for i, j := 0, len(tasks)-1; i < j; i, j = i+1, j-1 {
			tasks[i], tasks[j] = tasks[j], tasks[i]
		}
	}

	return tasks, err
}

func (r *taskRepository) Update(ctx context.Context, t *models.Task, updates map[string]interface{}) error {
	// Defense-in-depth: operation_id pinned so a resolver bug can't write
	// across operation boundaries.
	return r.coll.UpdateOne(ctx,
		bson.M{"task_id": t.TaskID, "operation_id": t.OperationID},
		bson.M{"$set": updates},
	)
}

func (r *taskRepository) SoftDelete(ctx context.Context, t *models.Task, deletedByID uuid.UUID) error {
	now := time.Now().UTC()
	return r.coll.UpdateOne(ctx,
		bson.M{"task_id": t.TaskID},
		bson.M{"$set": bson.M{
			"deleted_at":    now,
			"deleted_by_id": deletedByID,
		}},
	)
}

func (r *taskRepository) Restore(ctx context.Context, t *models.Task) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"task_id": t.TaskID},
		bson.M{"$set": bson.M{
			"deleted_at":    nil,
			"deleted_by_id": nil,
		}},
	)
}

func (r *taskRepository) HardDelete(ctx context.Context, t *models.Task) error {
	return r.coll.Remove(ctx, bson.M{"task_id": t.TaskID, "operation_id": t.OperationID})
}

func (r *taskRepository) HardDeleteByOperationID(ctx context.Context, opID uuid.UUID) error {
	_, err := r.coll.RemoveAll(ctx, bson.M{"operation_id": opID})
	return err
}

func (r *taskRepository) HardDeleteTrashed(ctx context.Context, opID uuid.UUID) error {
	_, err := r.coll.RemoveAll(ctx, bson.M{
		"operation_id": opID,
		"deleted_at":   bson.M{"$ne": nil},
	})
	return err
}

func (r *taskRepository) AddWikiReference(ctx context.Context, taskID, wikiID, callerID uuid.UUID) error {
	now := time.Now().UTC()
	err := r.coll.UpdateOne(ctx,
		bson.M{"task_id": taskID},
		bson.M{
			"$addToSet": bson.M{"wiki_references": wikiID},
			"$set": bson.M{
				"last_updated_at":    now,
				"last_updated_by_id": callerID,
			},
		},
	)
	if err != nil {
		return fmt.Errorf("failed to add wiki reference: %w", err)
	}
	return nil
}

func (r *taskRepository) PullWikiReference(ctx context.Context, opID, wikiID uuid.UUID) error {
	// Pull from active and trashed rows alike — a restored task should not
	// resurrect a dead pointer.
	_, err := r.coll.UpdateAll(ctx,
		bson.M{
			"operation_id":    opID,
			"wiki_references": wikiID,
		},
		bson.M{"$pull": bson.M{"wiki_references": wikiID}},
	)
	if err != nil {
		return fmt.Errorf("failed to pull wiki reference: %w", err)
	}
	return nil
}

func (r *taskRepository) PullCredentialReference(ctx context.Context, opID, credentialID uuid.UUID) error {
	_, err := r.coll.UpdateAll(ctx,
		bson.M{
			"operation_id":          opID,
			"credential_references": credentialID,
		},
		bson.M{"$pull": bson.M{"credential_references": credentialID}},
	)
	if err != nil {
		return fmt.Errorf("failed to pull credential reference: %w", err)
	}
	return nil
}

func (r *taskRepository) FindWikiReferrers(ctx context.Context, opID, wikiID uuid.UUID, limit int64) ([]models.Task, error) {
	var tasks []models.Task
	err := r.coll.Find(ctx, bson.M{
		"operation_id":    opID,
		"wiki_references": wikiID,
		"deleted_at":      nil,
	}).Sort("-updateAt", "-_id").Limit(limit).All(&tasks)
	return tasks, err
}

// BackfillDoneAt stamps done_at on legacy DONE tasks that lack the field.
// Uses each row's updateAt as the timestamp — the row's last write is the
// best available proxy for "moved to DONE" since the ChangeTaskStage write
// is what would have created done_at had this field existed at the time.
// Idempotent: subsequent calls match zero rows.
//
// Implemented as a fetch-and-per-row-update loop rather than a single
// updateMany-with-pipeline so it stays portable across the driver
// abstractions and the operation count stays modest (one-time backfill,
// only the DONE column, only rows missing the field).
func (r *taskRepository) BackfillDoneAt(ctx context.Context) (int64, error) {
	var legacy []models.Task
	err := r.coll.Find(ctx, bson.M{
		"stage":   models.TaskStageDone,
		"done_at": nil,
	}).All(&legacy)
	if err != nil {
		return 0, fmt.Errorf("backfill done_at: list legacy: %w", err)
	}

	var n int64
	for i := range legacy {
		stamp := legacy[i].UpdateAt
		if stamp.IsZero() {
			stamp = legacy[i].CreateAt
		}
		if err := r.coll.UpdateOne(ctx,
			bson.M{"task_id": legacy[i].TaskID},
			bson.M{"$set": bson.M{"done_at": stamp}},
		); err != nil {
			return n, fmt.Errorf("backfill done_at: update %s: %w", legacy[i].TaskID, err)
		}
		n++
	}
	return n, nil
}

func (r *taskRepository) FindCredentialReferrers(ctx context.Context, opID, credentialID uuid.UUID, limit int64) ([]models.Task, error) {
	var tasks []models.Task
	err := r.coll.Find(ctx, bson.M{
		"operation_id":          opID,
		"credential_references": credentialID,
		"deleted_at":            nil,
	}).Sort("-updateAt", "-_id").Limit(limit).All(&tasks)
	return tasks, err
}

// buildTaskFilter composes the active-list filter from a TaskFilter scoped
// to one operation. Trash listings have their own builder inline in
// FindTrashedByOperationIDWithCursor because the cursor shape differs.
func buildTaskFilter(opID uuid.UUID, f TaskFilter) bson.M {
	q := bson.M{"operation_id": opID}

	if f.Trashed {
		q["deleted_at"] = bson.M{"$ne": nil}
	} else {
		q["deleted_at"] = nil
	}

	if f.Stage != "" {
		q["stage"] = f.Stage
	} else if len(f.ExcludeStages) > 0 {
		q["stage"] = bson.M{"$nin": f.ExcludeStages}
	}

	if f.RiskScoreMin != nil || f.RiskScoreMax != nil {
		rng := bson.M{}
		if f.RiskScoreMin != nil {
			rng["$gte"] = *f.RiskScoreMin
		}
		if f.RiskScoreMax != nil {
			rng["$lte"] = *f.RiskScoreMax
		}
		q["risk_score"] = rng
	}
	if f.ProfitScoreMin != nil || f.ProfitScoreMax != nil {
		rng := bson.M{}
		if f.ProfitScoreMin != nil {
			rng["$gte"] = *f.ProfitScoreMin
		}
		if f.ProfitScoreMax != nil {
			rng["$lte"] = *f.ProfitScoreMax
		}
		q["profit_score"] = rng
	}

	if f.Search != "" {
		// Escape user input so regex metacharacters are treated literally —
		// same ReDoS guard used by wiki and credential filters.
		escaped := regexp.QuoteMeta(f.Search)
		rx := bson.M{"$regex": escaped, "$options": "i"}
		q["$or"] = bson.A{
			bson.M{"name": rx},
			bson.M{"description": rx},
		}
	}

	return q
}
