package models

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// TaskStage is the kanban column a task currently sits in. Tasks move
// backlog → todo → in_process → done, but the system enforces no specific
// path — operators may move cards freely. The only invariant tied to stage
// is that DONE requires a terminal Status (SUCCESS or FAIL); see Task.Validate.
type TaskStage string

const (
	TaskStageBacklog   TaskStage = "BACKLOG"
	TaskStageTodo      TaskStage = "TODO"
	TaskStageInProcess TaskStage = "IN_PROCESS"
	TaskStageDone      TaskStage = "DONE"
)

// IsValid reports whether the stage matches one of the known enum members.
func (s TaskStage) IsValid() bool {
	switch s {
	case TaskStageBacklog, TaskStageTodo, TaskStageInProcess, TaskStageDone:
		return true
	}
	return false
}

// TaskStatus is the outcome of a task. UNDEFINED is the default until the
// task reaches stage DONE, at which point the operator must pick SUCCESS or
// FAIL — the resolver enforces this invariant on stage transitions. Tasks
// moved out of DONE may keep their Status (it remains as history) or have
// it explicitly reset by the caller.
type TaskStatus string

const (
	TaskStatusUndefined TaskStatus = "UNDEFINED"
	TaskStatusSuccess   TaskStatus = "SUCCESS"
	TaskStatusFail      TaskStatus = "FAIL"
)

// IsValid reports whether the status matches one of the known enum members.
func (s TaskStatus) IsValid() bool {
	switch s {
	case TaskStatusUndefined, TaskStatusSuccess, TaskStatusFail:
		return true
	}
	return false
}

// IsTerminal reports whether the status represents an operator-confirmed
// outcome (SUCCESS or FAIL). Used by the stage/status invariant: DONE
// requires a terminal status.
func (s TaskStatus) IsTerminal() bool {
	return s == TaskStatusSuccess || s == TaskStatusFail
}

// TaskScoreMin and TaskScoreMax bound the risk and profit score range.
// The 5/5 midpoint is the matrix view's hardcoded quadrant threshold —
// scores < 5 are "low", scores >= 5 are "high".
const (
	TaskScoreMin uint8 = 0
	TaskScoreMax uint8 = 10
)

// Task is a unit of operator-planned action within an operation. Tasks
// carry risk/profit scoring so operators can triage via the matrix view,
// plus references to wiki documents and credentials in the same operation
// that informed the task.
//
// Soft-delete follows the wiki_document pattern (DeletedAt/DeletedByID);
// hard-delete is admin-only via the purge mutation. Reference arrays use
// multikey indexes so reverse lookups ("which tasks reference this
// credential?") are one index probe.
type Task struct {
	field.DefaultField `bson:",inline"`
	TaskID             uuid.UUID `bson:"task_id" json:"taskId"`
	OperationID        uuid.UUID `bson:"operation_id" json:"operationId"`

	Name        string `bson:"name" json:"name"`
	Description string `bson:"description" json:"description"`

	// RiskScore and ProfitScore are operator-assigned 0..10 ratings.
	// Stored as uint8 because they're bounded and small; validated at the
	// resolver boundary via Validate / normalize helpers.
	RiskScore         uint8  `bson:"risk_score" json:"riskScore"`
	RiskDescription   string `bson:"risk_description" json:"riskDescription"`
	ProfitScore       uint8  `bson:"profit_score" json:"profitScore"`
	ProfitDescription string `bson:"profit_description" json:"profitDescription"`

	Stage  TaskStage  `bson:"stage" json:"stage"`
	Status TaskStatus `bson:"status" json:"status"`

	// DoneAt is stamped each time the task transitions into stage DONE and
	// cleared on transitions out of DONE. Drives the DONE column's sort
	// order (newest-completed first); the other three stages sort by
	// createAt DESC. Null for tasks that have never been DONE; backfilled
	// at startup for historical DONE rows that predate this field.
	DoneAt *time.Time `bson:"done_at,omitempty" json:"doneAt,omitempty"`

	// AssigneeIDs lists the user IDs responsible for the task. Multikey-
	// indexed with operation_id so "tasks assigned to me in this operation"
	// is one index probe. Empty slice = unassigned; never nil after Create.
	AssigneeIDs []uuid.UUID `bson:"assignee_ids" json:"assigneeIds"`

	// WikiReferences and CredentialReferences point to entities in the same
	// operation. Multikey indexes on each enable cheap "tasks referencing
	// this wiki/credential" reverse queries used by the wiki/credential
	// delete cleanup paths. Empty slices, never nil.
	WikiReferences       []uuid.UUID `bson:"wiki_references" json:"wikiReferences"`
	CredentialReferences []uuid.UUID `bson:"credential_references" json:"credentialReferences"`

	CreatedByID uuid.UUID `bson:"created_by_id" json:"createdById"`

	// LastUpdatedByID + LastUpdatedAt attribute the most recent edit.
	// Nullable for symmetry with wiki documents; populated by every Update
	// call after creation.
	LastUpdatedByID *uuid.UUID `bson:"last_updated_by_id,omitempty" json:"lastUpdatedById,omitempty"`
	LastUpdatedAt   *time.Time `bson:"last_updated_at,omitempty" json:"lastUpdatedAt,omitempty"`

	// Soft-delete fields — same shape as WikiDocument. List queries filter
	// {deleted_at: nil}; trash queries filter {deleted_at: {$ne: nil}}.
	DeletedAt   *time.Time `bson:"deleted_at,omitempty" json:"deletedAt,omitempty"`
	DeletedByID *uuid.UUID `bson:"deleted_by_id,omitempty" json:"deletedById,omitempty"`
}

// ErrDoneRequiresTerminalStatus is returned when a caller attempts to move
// a task into stage DONE without supplying SUCCESS or FAIL. The resolver
// surfaces this verbatim to the client so the UI can prompt the operator
// to pick an outcome before completing the move.
var ErrDoneRequiresTerminalStatus = errors.New("stage DONE requires status SUCCESS or FAIL")

// ValidateStageStatus enforces the invariant that a task in stage DONE must
// carry a terminal status (SUCCESS or FAIL). All other stages accept any
// valid status, including UNDEFINED. Returns nil when the combination is
// allowed; otherwise an error suitable for surfacing as a validation
// failure at the resolver boundary.
func ValidateStageStatus(stage TaskStage, status TaskStatus) error {
	if !stage.IsValid() {
		return fmt.Errorf("invalid task stage %q", stage)
	}
	if !status.IsValid() {
		return fmt.Errorf("invalid task status %q", status)
	}
	if stage == TaskStageDone && !status.IsTerminal() {
		return ErrDoneRequiresTerminalStatus
	}
	return nil
}

