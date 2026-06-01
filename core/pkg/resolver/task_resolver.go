package resolver

import (
	"context"
	"errors"
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

// Soft caps on free-form task fields. Match the user-confirmed plan: 200
// chars on the name (single-line UI), 16KB on the description (textarea
// with markdown). Risk/profit descriptions ride on the same value cap.
const (
	maxTaskNameLen        = 200
	maxTaskDescriptionLen = 16 * 1024
)

// maxTaskAssignees / maxTaskReferences bound the multikey arrays so a
// single task can't balloon into a giant BSON document. Chosen to be
// roomy for any realistic operation team and link-out density.
const (
	maxTaskAssignees   = 64
	maxTaskReferences  = 64
)

// maxTaskBacklinks caps the reverse-reference listings (the "tasks that
// reference this wiki doc / credential" lookups). Mirrors maxBacklinks on
// the wiki side — past 200 the UI degrades anyway and the right fix is
// pruning the source tasks, not paginating the list.
const maxTaskBacklinks = 200

// ITaskResolver defines the business logic methods for the Task entity.
// Maps 1:1 to the GraphQL query, mutation, subscription, and field
// resolvers declared in tasks.graphql.
type ITaskResolver interface {
	// Mutations
	CreateTask(ctx context.Context, input model.CreateTaskInput) (*models.Task, error)
	UpdateTask(ctx context.Context, id string, input model.UpdateTaskInput) (*models.Task, error)
	ChangeTaskStage(ctx context.Context, input model.ChangeTaskStageInput) (*models.Task, error)
	SetTaskAssignees(ctx context.Context, taskID string, assigneeIDs []string) (*models.Task, error)
	SetTaskWikiReferences(ctx context.Context, taskID string, wikiIDs []string) (*models.Task, error)
	AddTaskWikiReference(ctx context.Context, taskID string, wikiID string) (*models.Task, error)
	SetTaskCredentialReferences(ctx context.Context, taskID string, credentialIDs []string) (*models.Task, error)
	DeleteTask(ctx context.Context, id string) (bool, error)
	RestoreTask(ctx context.Context, id string) (*models.Task, error)
	PurgeTask(ctx context.Context, id string) (bool, error)

	// Queries
	Task(ctx context.Context, id string) (*models.Task, error)
	Tasks(ctx context.Context, operationID string, stage *models.TaskStage, excludeStages []models.TaskStage, riskScoreMin *int, riskScoreMax *int, profitScoreMin *int, profitScoreMax *int, search *string, first *int, after *string, last *int, before *string) (*model.TaskConnection, error)
	TaskTrash(ctx context.Context, operationID string, first *int, after *string, last *int, before *string) (*model.TaskConnection, error)

	// Cross-domain backlink queries. Standalone paths re-auth at viewer+ on
	// the resolved entity's operation; the field-path resolvers skip the
	// extra auth check since gqlgen has already resolved the parent from an
	// authorized query.
	TasksReferencingWikiDocument(ctx context.Context, documentID string) ([]*models.Task, error)
	TasksReferencingCredential(ctx context.Context, credentialID string) ([]*models.Task, error)
	TaskBacklinksForWikiDocument(ctx context.Context, doc *models.WikiDocument) ([]*models.Task, error)
	TaskBacklinksForCredential(ctx context.Context, cred *models.Credential) ([]*models.Task, error)

	// Field resolvers
	ID(ctx context.Context, obj *models.Task) (string, error)
	OperationIDField(ctx context.Context, obj *models.Task) (string, error)
	Operation(ctx context.Context, obj *models.Task) (*models.Operation, error)
	RiskScore(ctx context.Context, obj *models.Task) (int, error)
	ProfitScore(ctx context.Context, obj *models.Task) (int, error)
	Assignees(ctx context.Context, obj *models.Task) ([]*models.User, error)
	WikiReferences(ctx context.Context, obj *models.Task) ([]*models.WikiDocument, error)
	CredentialReferences(ctx context.Context, obj *models.Task) ([]*models.Credential, error)
	CreatedBy(ctx context.Context, obj *models.Task) (*models.User, error)
	LastUpdatedBy(ctx context.Context, obj *models.Task) (*models.User, error)
	LastUpdatedAt(ctx context.Context, obj *models.Task) (*string, error)
	DeletedAt(ctx context.Context, obj *models.Task) (*string, error)
	DoneAt(ctx context.Context, obj *models.Task) (*string, error)
	CreatedAt(ctx context.Context, obj *models.Task) (string, error)
	UpdatedAt(ctx context.Context, obj *models.Task) (string, error)

	// Cross-feature cleanup hooks. Called from wiki / credential delete
	// paths so dangling pointers don't accumulate in the task reference
	// arrays. Best-effort — callers log on error and never block the
	// upstream delete on this failing.
	CleanupWikiReferences(ctx context.Context, operationID, wikiID uuid.UUID) error
	CleanupCredentialReferences(ctx context.Context, operationID, credentialID uuid.UUID) error
}

type taskResolver struct {
	taskRepo      repository.ITaskRepository
	operationRepo repository.IOperationRepository
	userRepo      repository.IUserRepository
	wikiRepo      repository.IWikiDocumentRepository
	credRepo      repository.ICredentialRepository
	eventBus      eventbus.IEventBus
}

// NewTaskResolver constructs the resolver with explicit dependencies — no
// global state, mirrors the credential resolver constructor. A nil event
// bus is replaced with the no-op implementation so tests can omit it.
func NewTaskResolver(
	taskRepo repository.ITaskRepository,
	operationRepo repository.IOperationRepository,
	userRepo repository.IUserRepository,
	wikiRepo repository.IWikiDocumentRepository,
	credRepo repository.ICredentialRepository,
	bus eventbus.IEventBus,
) ITaskResolver {
	if bus == nil {
		bus = eventbus.NewNopEventBus()
	}
	return &taskResolver{
		taskRepo:      taskRepo,
		operationRepo: operationRepo,
		userRepo:      userRepo,
		wikiRepo:      wikiRepo,
		credRepo:      credRepo,
		eventBus:      bus,
	}
}

// authorizeForOperation enforces a minimum operation role on the caller.
// Mirrors credentialResolver.authorizeForOperation — uses the shared
// AuthorizeOperationRole helper which handles the Public-operation
// short-circuit and the app-admin bypass uniformly.
func (r *taskResolver) authorizeForOperation(ctx context.Context, operationID uuid.UUID, minRole models.OperationRole) error {
	op, err := r.operationRepo.FindByID(ctx, operationID)
	if err != nil {
		return fmt.Errorf("operation not found: %w", err)
	}
	return authorization.AuthorizeOperationRole(ctx, &op, minRole)
}

// CreateTask creates a new task in an operation. Requires operator+ on the op.
// Enforces the stage/status invariant: a task created directly in DONE must
// carry SUCCESS or FAIL; otherwise status falls back to UNDEFINED.
func (r *taskResolver) CreateTask(ctx context.Context, input model.CreateTaskInput) (*models.Task, error) {
	opUID, err := uuid.Parse(input.OperationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if len(name) > maxTaskNameLen {
		return nil, fmt.Errorf("name exceeds %d characters", maxTaskNameLen)
	}

	description := strDeref(input.Description)
	if len(description) > maxTaskDescriptionLen {
		return nil, fmt.Errorf("description exceeds %d characters", maxTaskDescriptionLen)
	}

	if err := validateScoreInput(int(input.RiskScore), "risk"); err != nil {
		return nil, err
	}
	if err := validateScoreInput(int(input.ProfitScore), "profit"); err != nil {
		return nil, err
	}

	stage := models.TaskStageBacklog
	if input.Stage != nil {
		stage = *input.Stage
	}
	status := models.TaskStatusUndefined
	if input.Status != nil {
		status = *input.Status
	}
	if err := models.ValidateStageStatus(stage, status); err != nil {
		return nil, err
	}

	assigneeIDs, err := parseTaskUUIDList(input.AssigneeIds, "assigneeIds", maxTaskAssignees)
	if err != nil {
		return nil, err
	}
	wikiRefs, err := parseTaskUUIDList(input.WikiReferenceIds, "wikiReferenceIds", maxTaskReferences)
	if err != nil {
		return nil, err
	}
	credRefs, err := parseTaskUUIDList(input.CredentialReferenceIds, "credentialReferenceIds", maxTaskReferences)
	if err != nil {
		return nil, err
	}

	callerUID, err := callerUIDFromCtx(ctx)
	if err != nil {
		return nil, err
	}

	task := &models.Task{
		TaskID:               uuid.New(),
		OperationID:          opUID,
		Name:                 name,
		Description:          description,
		RiskScore:            uint8(input.RiskScore),
		RiskDescription:      strDeref(input.RiskDescription),
		ProfitScore:          uint8(input.ProfitScore),
		ProfitDescription:    strDeref(input.ProfitDescription),
		Stage:                stage,
		Status:               status,
		AssigneeIDs:          assigneeIDs,
		WikiReferences:       wikiRefs,
		CredentialReferences: credRefs,
		CreatedByID:          callerUID,
	}
	// Tasks created directly in DONE need done_at stamped at creation so
	// they sort alongside tasks moved into DONE later. The other stages
	// leave it nil; ChangeTaskStage stamps it on the first transition into
	// DONE.
	if stage == models.TaskStageDone {
		now := time.Now().UTC()
		task.DoneAt = &now
	}

	if err := r.taskRepo.Create(ctx, task); err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	r.publishTaskEvent(ctx, eventbus.TopicTaskCreated, task, "")

	return task, nil
}

// UpdateTask modifies the editable scalar fields (name, description,
// scores, score descriptions). Stage and status changes flow through
// ChangeTaskStage so the invariant is enforced uniformly. Operator+ on op.
func (r *taskResolver) UpdateTask(ctx context.Context, id string, input model.UpdateTaskInput) (*models.Task, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid task ID: %w", err)
	}

	task, err := r.taskRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("task not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, task.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	updates := make(map[string]interface{})
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, fmt.Errorf("name cannot be empty")
		}
		if len(name) > maxTaskNameLen {
			return nil, fmt.Errorf("name exceeds %d characters", maxTaskNameLen)
		}
		updates["name"] = name
	}
	if input.Description != nil {
		if len(*input.Description) > maxTaskDescriptionLen {
			return nil, fmt.Errorf("description exceeds %d characters", maxTaskDescriptionLen)
		}
		updates["description"] = *input.Description
	}
	if input.RiskScore != nil {
		if err := validateScoreInput(*input.RiskScore, "risk"); err != nil {
			return nil, err
		}
		updates["risk_score"] = uint8(*input.RiskScore)
	}
	if input.RiskDescription != nil {
		updates["risk_description"] = *input.RiskDescription
	}
	if input.ProfitScore != nil {
		if err := validateScoreInput(*input.ProfitScore, "profit"); err != nil {
			return nil, err
		}
		updates["profit_score"] = uint8(*input.ProfitScore)
	}
	if input.ProfitDescription != nil {
		updates["profit_description"] = *input.ProfitDescription
	}

	if len(updates) == 0 {
		return &task, nil
	}

	if err := r.stampLastUpdatedAndApply(ctx, &task, updates); err != nil {
		return nil, err
	}

	updated, err := r.taskRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated task: %w", err)
	}

	r.publishTaskEvent(ctx, eventbus.TopicTaskUpdated, &updated, "")

	return &updated, nil
}

// ChangeTaskStage moves a task between kanban columns and (for DONE)
// commits the terminal status. The DONE-requires-SUCCESS-or-FAIL
// invariant is enforced by models.ValidateStageStatus; the error returned
// here is the signal the frontend uses to prompt the operator for an
// outcome before retrying.
//
// Two events fire when the move actually changes the stored fields: the
// dedicated TopicTaskStageChanged (carrying old → new in the payload)
// and, when the status was reset to a terminal value, TopicTaskStatusSet.
// This split lets the timeline subscriber render specific lines instead
// of a generic "updated" entry.
func (r *taskResolver) ChangeTaskStage(ctx context.Context, input model.ChangeTaskStageInput) (*models.Task, error) {
	uid, err := uuid.Parse(input.TaskID)
	if err != nil {
		return nil, fmt.Errorf("invalid task ID: %w", err)
	}

	task, err := r.taskRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("task not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, task.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	newStage := input.Stage
	// Status resolution:
	//   - explicit input.Status wins
	//   - moving INTO DONE without an explicit status is an error
	//   - moving OUT OF DONE keeps the existing status as history
	//   - everything else preserves the existing status
	newStatus := task.Status
	if input.Status != nil {
		newStatus = *input.Status
	}
	if err := models.ValidateStageStatus(newStage, newStatus); err != nil {
		return nil, err
	}

	oldStage := task.Stage
	oldStatus := task.Status

	if newStage == oldStage && newStatus == oldStatus {
		return &task, nil
	}

	updates := map[string]interface{}{
		"stage":  newStage,
		"status": newStatus,
	}
	// Maintain done_at so the DONE column can sort by completion time:
	//   - moving INTO DONE stamps a fresh timestamp (re-completing pushes
	//     the card back to the top — "done again, now" is the useful order)
	//   - moving OUT OF DONE clears done_at so a future re-completion
	//     stamps fresh, not a stale historical value
	//   - intra-DONE no-ops (status flip while still DONE) leave done_at
	//     alone
	if newStage == models.TaskStageDone && oldStage != models.TaskStageDone {
		updates["done_at"] = time.Now().UTC()
	} else if oldStage == models.TaskStageDone && newStage != models.TaskStageDone {
		updates["done_at"] = nil
	}
	if err := r.stampLastUpdatedAndApply(ctx, &task, updates); err != nil {
		return nil, err
	}

	updated, err := r.taskRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated task: %w", err)
	}

	if newStage != oldStage {
		r.publishTaskEvent(ctx, eventbus.TopicTaskStageChanged, &updated, string(oldStage))
	}
	if newStatus != oldStatus {
		r.publishTaskEvent(ctx, eventbus.TopicTaskStatusSet, &updated, "")
	}

	return &updated, nil
}

// SetTaskAssignees replaces the assignee list outright. Pass an empty
// array to clear assignees. Operator+ on op.
func (r *taskResolver) SetTaskAssignees(ctx context.Context, taskID string, assigneeIDs []string) (*models.Task, error) {
	task, parsedIDs, err := r.loadAndAuthorize(ctx, taskID, assigneeIDs, "assigneeIds", maxTaskAssignees)
	if err != nil {
		return nil, err
	}

	if err := r.stampLastUpdatedAndApply(ctx, task, map[string]interface{}{
		"assignee_ids": parsedIDs,
	}); err != nil {
		return nil, err
	}

	updated, err := r.taskRepo.FindByID(ctx, task.TaskID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated task: %w", err)
	}

	r.publishTaskEvent(ctx, eventbus.TopicTaskAssigneesChanged, &updated, "")
	return &updated, nil
}

// SetTaskWikiReferences replaces the wiki document link list.
func (r *taskResolver) SetTaskWikiReferences(ctx context.Context, taskID string, wikiIDs []string) (*models.Task, error) {
	task, parsedIDs, err := r.loadAndAuthorize(ctx, taskID, wikiIDs, "wikiIds", maxTaskReferences)
	if err != nil {
		return nil, err
	}

	if err := r.stampLastUpdatedAndApply(ctx, task, map[string]interface{}{
		"wiki_references": parsedIDs,
	}); err != nil {
		return nil, err
	}

	updated, err := r.taskRepo.FindByID(ctx, task.TaskID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated task: %w", err)
	}

	r.publishTaskEvent(ctx, eventbus.TopicTaskReferencesChanged, &updated, "")
	return &updated, nil
}

// AddTaskWikiReference atomically appends a single wiki document to a task's
// reference list. Used by the wiki editor's "Add to task" picker — separate
// from SetTaskWikiReferences so the operator's intent ("add this one") can't
// race-clobber concurrent edits coming from the task edit dialog.
//
// Idempotent: re-adding an already-linked doc returns the task unchanged and
// does not emit a references-changed event. The size cap is checked before
// the write so the soft-limit error surfaces consistently with the
// set-style mutations.
func (r *taskResolver) AddTaskWikiReference(ctx context.Context, taskID string, wikiID string) (*models.Task, error) {
	tUID, err := uuid.Parse(taskID)
	if err != nil {
		return nil, fmt.Errorf("invalid task ID: %w", err)
	}
	wUID, err := uuid.Parse(wikiID)
	if err != nil {
		return nil, fmt.Errorf("invalid wiki ID: %w", err)
	}

	task, err := r.taskRepo.FindByID(ctx, tUID)
	if err != nil {
		return nil, fmt.Errorf("task not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, task.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	// Enforce same-operation scope at write time — the wiki picker only
	// surfaces docs in the active operation but the API contract has to
	// hold even when called directly.
	doc, err := r.wikiRepo.FindByID(ctx, wUID)
	if err != nil {
		return nil, fmt.Errorf("wiki document not found: %w", err)
	}
	if doc.OperationID != task.OperationID {
		return nil, fmt.Errorf("wiki document is not in the task's operation")
	}
	if doc.DeletedAt != nil {
		return nil, fmt.Errorf("wiki document is trashed")
	}

	// Idempotent short-circuit: already linked → return current task,
	// no event, no write.
	for _, existing := range task.WikiReferences {
		if existing == wUID {
			return &task, nil
		}
	}

	if len(task.WikiReferences) >= maxTaskReferences {
		return nil, fmt.Errorf("wiki references exceed max %d entries", maxTaskReferences)
	}

	callerUID, err := callerUIDFromCtx(ctx)
	if err != nil {
		return nil, err
	}

	if err := r.taskRepo.AddWikiReference(ctx, tUID, wUID, callerUID); err != nil {
		return nil, err
	}

	updated, err := r.taskRepo.FindByID(ctx, tUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated task: %w", err)
	}

	r.publishTaskEvent(ctx, eventbus.TopicTaskReferencesChanged, &updated, "")
	return &updated, nil
}

// SetTaskCredentialReferences replaces the credential link list.
func (r *taskResolver) SetTaskCredentialReferences(ctx context.Context, taskID string, credentialIDs []string) (*models.Task, error) {
	task, parsedIDs, err := r.loadAndAuthorize(ctx, taskID, credentialIDs, "credentialIds", maxTaskReferences)
	if err != nil {
		return nil, err
	}

	if err := r.stampLastUpdatedAndApply(ctx, task, map[string]interface{}{
		"credential_references": parsedIDs,
	}); err != nil {
		return nil, err
	}

	updated, err := r.taskRepo.FindByID(ctx, task.TaskID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated task: %w", err)
	}

	r.publishTaskEvent(ctx, eventbus.TopicTaskReferencesChanged, &updated, "")
	return &updated, nil
}

// loadAndAuthorize is the shared prologue of the three setX-references
// mutations: parse the task id, fetch the row, authorize at operator,
// parse and cap the supplied UUID list. Returns the loaded task plus the
// parsed slice so the caller can hand it straight to the repo.
func (r *taskResolver) loadAndAuthorize(ctx context.Context, taskID string, ids []string, fieldName string, maxLen int) (*models.Task, []uuid.UUID, error) {
	uid, err := uuid.Parse(taskID)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid task ID: %w", err)
	}

	task, err := r.taskRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, nil, fmt.Errorf("task not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, task.OperationID, models.OperationRoleOperator); err != nil {
		return nil, nil, err
	}

	parsed, err := parseTaskUUIDList(ids, fieldName, maxLen)
	if err != nil {
		return nil, nil, err
	}
	return &task, parsed, nil
}

// DeleteTask soft-deletes a task. Operator+ on op.
func (r *taskResolver) DeleteTask(ctx context.Context, id string) (bool, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("invalid task ID: %w", err)
	}

	task, err := r.taskRepo.FindByID(ctx, uid)
	if err != nil {
		return false, fmt.Errorf("task not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, task.OperationID, models.OperationRoleOperator); err != nil {
		return false, err
	}

	callerUID, err := callerUIDFromCtx(ctx)
	if err != nil {
		return false, err
	}

	if err := r.taskRepo.SoftDelete(ctx, &task, callerUID); err != nil {
		return false, fmt.Errorf("failed to delete task: %w", err)
	}

	r.publishTaskEvent(ctx, eventbus.TopicTaskSoftDeleted, &task, "")
	return true, nil
}

// RestoreTask un-trashes a previously soft-deleted task. Operator+ on op.
func (r *taskResolver) RestoreTask(ctx context.Context, id string) (*models.Task, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid task ID: %w", err)
	}

	task, err := r.taskRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("task not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, task.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	if task.DeletedAt == nil {
		return nil, errors.New("task is not deleted")
	}

	if err := r.taskRepo.Restore(ctx, &task); err != nil {
		return nil, fmt.Errorf("failed to restore task: %w", err)
	}

	updated, err := r.taskRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch restored task: %w", err)
	}

	r.publishTaskEvent(ctx, eventbus.TopicTaskRestored, &updated, "")
	return &updated, nil
}

// PurgeTask permanently removes a trashed task. Admin in op only.
func (r *taskResolver) PurgeTask(ctx context.Context, id string) (bool, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("invalid task ID: %w", err)
	}

	task, err := r.taskRepo.FindByID(ctx, uid)
	if err != nil {
		return false, fmt.Errorf("task not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, task.OperationID, models.OperationRoleAdmin); err != nil {
		return false, err
	}

	if err := r.taskRepo.HardDelete(ctx, &task); err != nil {
		return false, fmt.Errorf("failed to purge task: %w", err)
	}

	r.publishTaskEvent(ctx, eventbus.TopicTaskHardDeleted, &task, "")
	return true, nil
}

// Task fetches a single task by id, gated by viewer+ on the operation.
func (r *taskResolver) Task(ctx context.Context, id string) (*models.Task, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid task ID: %w", err)
	}

	task, err := r.taskRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("task not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, task.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	return &task, nil
}

// Tasks lists active tasks in an operation. Viewer+ on the operation.
//
// stage narrows to a single kanban column. excludeStages drops rows in the
// listed stages (used by the matrix view to skip DONE and optionally
// BACKLOG). riskScoreMin/Max and profitScoreMin/Max are inclusive bounds
// driving the per-quadrant matrix queries — each quadrant fetches its own
// virtualized list independently.
func (r *taskResolver) Tasks(ctx context.Context, operationID string, stage *models.TaskStage, excludeStages []models.TaskStage, riskScoreMin *int, riskScoreMax *int, profitScoreMin *int, profitScoreMax *int, search *string, first *int, after *string, last *int, before *string) (*model.TaskConnection, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	args, err := pagination.ParseArgs(first, after, last, before)
	if err != nil {
		return nil, fmt.Errorf("invalid pagination args: %w", err)
	}

	filter := repository.TaskFilter{}
	if stage != nil {
		if !stage.IsValid() {
			return nil, fmt.Errorf("invalid task stage: %s", *stage)
		}
		filter.Stage = *stage
	}
	for _, s := range excludeStages {
		if !s.IsValid() {
			return nil, fmt.Errorf("invalid task stage: %s", s)
		}
		filter.ExcludeStages = append(filter.ExcludeStages, s)
	}
	if err := validateScoreBound(riskScoreMin, "riskScoreMin"); err != nil {
		return nil, err
	}
	if err := validateScoreBound(riskScoreMax, "riskScoreMax"); err != nil {
		return nil, err
	}
	if err := validateScoreBound(profitScoreMin, "profitScoreMin"); err != nil {
		return nil, err
	}
	if err := validateScoreBound(profitScoreMax, "profitScoreMax"); err != nil {
		return nil, err
	}
	filter.RiskScoreMin = riskScoreMin
	filter.RiskScoreMax = riskScoreMax
	filter.ProfitScoreMin = profitScoreMin
	filter.ProfitScoreMax = profitScoreMax
	if search != nil {
		filter.Search = strings.TrimSpace(*search)
	}

	return r.listTasks(ctx, opUID, filter, args)
}

// validateScoreBound is the optional-pointer form of validateScoreInput
// used by the Tasks query's range filters. Nil passes through unchanged.
func validateScoreBound(v *int, field string) error {
	if v == nil {
		return nil
	}
	return validateScoreInput(*v, field)
}

// TaskTrash lists soft-deleted tasks in an operation. Viewer+ on the op
// (so non-operators can see the trash size for awareness, even though
// they can't restore or purge from it).
func (r *taskResolver) TaskTrash(ctx context.Context, operationID string, first *int, after *string, last *int, before *string) (*model.TaskConnection, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	args, err := pagination.ParseArgs(first, after, last, before)
	if err != nil {
		return nil, fmt.Errorf("invalid pagination args: %w", err)
	}

	total, err := r.taskRepo.CountByOperationID(ctx, opUID, repository.TaskFilter{Trashed: true})
	if err != nil {
		return nil, fmt.Errorf("failed to count trashed tasks: %w", err)
	}

	tasks, err := r.taskRepo.FindTrashedByOperationIDWithCursor(ctx, opUID, args.Cursor, args.Limit+1, args.Forward)
	if err != nil {
		return nil, fmt.Errorf("failed to list trashed tasks: %w", err)
	}

	return buildTaskConnection(tasks, args, total, false), nil
}

// listTasks is the shared body of the active tasks query — counts, fetches
// (limit+1 to detect hasMore), and packs into a TaskConnection.
func (r *taskResolver) listTasks(ctx context.Context, opUID uuid.UUID, filter repository.TaskFilter, args pagination.Args) (*model.TaskConnection, error) {
	total, err := r.taskRepo.CountByOperationID(ctx, opUID, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to count tasks: %w", err)
	}

	tasks, err := r.taskRepo.FindByOperationIDWithCursor(ctx, opUID, filter, args.Cursor, args.Limit+1, args.Forward)
	if err != nil {
		return nil, fmt.Errorf("failed to list tasks: %w", err)
	}

	// Cursor time field must match the repo's sort field for this list mode
	// or hasNextPage skipping rows mid-page. DONE column sorts by done_at;
	// every other stage sorts by createAt. Falls back to createAt when
	// done_at is unexpectedly nil (legacy row pre-backfill).
	useDoneAt := filter.Stage == models.TaskStageDone
	return buildTaskConnection(tasks, args, total, useDoneAt), nil
}

// buildTaskConnection turns a slice of tasks plus pagination args into a
// GraphQL TaskConnection. Identical shape to the credential pagination
// path — kept as a free function so both list and trash queries can reuse.
// useDoneAt controls which field is encoded in the cursor: true uses
// done_at (DONE column), false uses createAt (every other list mode).
func buildTaskConnection(tasks []models.Task, args pagination.Args, total int64, useDoneAt bool) *model.TaskConnection {
	hasMore := int64(len(tasks)) > args.Limit
	if hasMore {
		tasks = tasks[:args.Limit]
	}

	edges := make([]*model.TaskEdge, len(tasks))
	for i := range tasks {
		cursorTime := tasks[i].CreateAt
		if useDoneAt && tasks[i].DoneAt != nil {
			cursorTime = *tasks[i].DoneAt
		}
		cursor := pagination.EncodeCursor(cursorTime, tasks[i].Id)
		edges[i] = &model.TaskEdge{
			Node:   &tasks[i],
			Cursor: cursor,
		}
	}

	pageInfo := pagination.PageInfo{
		HasNextPage:     args.Forward && hasMore,
		HasPreviousPage: (!args.Forward && hasMore) || (args.Forward && args.Cursor != nil),
	}
	if len(edges) > 0 {
		pageInfo.StartCursor = &edges[0].Cursor
		pageInfo.EndCursor = &edges[len(edges)-1].Cursor
	}

	return &model.TaskConnection{
		Edges:      edges,
		PageInfo:   &pageInfo,
		TotalCount: int(total),
	}
}

// TasksReferencingWikiDocument resolves the standalone backlinks query.
// Loads the wiki document to learn its operation, authorizes the caller at
// viewer+ in that op, then defers to the shared fetcher. Mirrors
// wikiDocumentResolver.WikiDocumentBacklinks.
func (r *taskResolver) TasksReferencingWikiDocument(ctx context.Context, documentID string) ([]*models.Task, error) {
	uid, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := r.wikiRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("document not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, doc.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	return r.fetchWikiReferrers(ctx, doc.OperationID, doc.DocumentID)
}

// TasksReferencingCredential is the credential counterpart to
// TasksReferencingWikiDocument.
func (r *taskResolver) TasksReferencingCredential(ctx context.Context, credentialID string) ([]*models.Task, error) {
	uid, err := uuid.Parse(credentialID)
	if err != nil {
		return nil, fmt.Errorf("invalid credential ID: %w", err)
	}

	cred, err := r.credRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("credential not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, cred.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	return r.fetchCredentialReferrers(ctx, cred.OperationID, cred.CredentialID)
}

// TaskBacklinksForWikiDocument is the field resolver for
// WikiDocument.taskBacklinks. Auth is upstream — gqlgen has already
// authorized whatever query resolved the parent document.
func (r *taskResolver) TaskBacklinksForWikiDocument(ctx context.Context, doc *models.WikiDocument) ([]*models.Task, error) {
	if doc == nil {
		return []*models.Task{}, nil
	}
	return r.fetchWikiReferrers(ctx, doc.OperationID, doc.DocumentID)
}

// TaskBacklinksForCredential is the field resolver for
// Credential.taskBacklinks. Same upstream-auth assumption.
func (r *taskResolver) TaskBacklinksForCredential(ctx context.Context, cred *models.Credential) ([]*models.Task, error) {
	if cred == nil {
		return []*models.Task{}, nil
	}
	return r.fetchCredentialReferrers(ctx, cred.OperationID, cred.CredentialID)
}

// fetchWikiReferrers is the shared body of the standalone query and the
// WikiDocument.taskBacklinks field resolver. Capped at maxTaskBacklinks.
func (r *taskResolver) fetchWikiReferrers(ctx context.Context, opID, wikiID uuid.UUID) ([]*models.Task, error) {
	referrers, err := r.taskRepo.FindWikiReferrers(ctx, opID, wikiID, maxTaskBacklinks)
	if err != nil {
		return nil, fmt.Errorf("failed to list task wiki referrers: %w", err)
	}
	out := make([]*models.Task, len(referrers))
	for i := range referrers {
		out[i] = &referrers[i]
	}
	return out, nil
}

// fetchCredentialReferrers is the credential counterpart to
// fetchWikiReferrers.
func (r *taskResolver) fetchCredentialReferrers(ctx context.Context, opID, credentialID uuid.UUID) ([]*models.Task, error) {
	referrers, err := r.taskRepo.FindCredentialReferrers(ctx, opID, credentialID, maxTaskBacklinks)
	if err != nil {
		return nil, fmt.Errorf("failed to list task credential referrers: %w", err)
	}
	out := make([]*models.Task, len(referrers))
	for i := range referrers {
		out[i] = &referrers[i]
	}
	return out, nil
}

// CleanupWikiReferences is invoked by the wiki document delete path to
// strip a deleted document's id from every task's wiki_references array.
// Best-effort: the caller logs on error and does not roll back the wiki
// delete.
func (r *taskResolver) CleanupWikiReferences(ctx context.Context, operationID, wikiID uuid.UUID) error {
	return r.taskRepo.PullWikiReference(ctx, operationID, wikiID)
}

// CleanupCredentialReferences is invoked by the credential delete path to
// strip a deleted credential's id from every task's credential_references
// array. Same semantics as CleanupWikiReferences.
func (r *taskResolver) CleanupCredentialReferences(ctx context.Context, operationID, credentialID uuid.UUID) error {
	return r.taskRepo.PullCredentialReference(ctx, operationID, credentialID)
}

// --- Field resolvers ---

func (r *taskResolver) ID(_ context.Context, obj *models.Task) (string, error) {
	return obj.TaskID.String(), nil
}

func (r *taskResolver) OperationIDField(_ context.Context, obj *models.Task) (string, error) {
	return obj.OperationID.String(), nil
}

func (r *taskResolver) Operation(ctx context.Context, obj *models.Task) (*models.Operation, error) {
	op, err := r.operationRepo.FindByID(ctx, obj.OperationID)
	if err != nil {
		return nil, fmt.Errorf("failed to load operation: %w", err)
	}
	return &op, nil
}

func (r *taskResolver) RiskScore(_ context.Context, obj *models.Task) (int, error) {
	return int(obj.RiskScore), nil
}

func (r *taskResolver) ProfitScore(_ context.Context, obj *models.Task) (int, error) {
	return int(obj.ProfitScore), nil
}

// Assignees fetches the User rows for the assignee_ids array. Users whose
// account was deleted are silently dropped (the resolver never returns a
// nil entry in a non-nullable list).
func (r *taskResolver) Assignees(ctx context.Context, obj *models.Task) ([]*models.User, error) {
	if len(obj.AssigneeIDs) == 0 {
		return []*models.User{}, nil
	}
	out := make([]*models.User, 0, len(obj.AssigneeIDs))
	for _, uid := range obj.AssigneeIDs {
		u, err := r.userRepo.FindByID(ctx, uid)
		if err != nil {
			continue
		}
		uCopy := u
		out = append(out, &uCopy)
	}
	return out, nil
}

// WikiReferences fetches the WikiDocument rows for the wiki_references
// array. Trashed/missing documents are silently dropped — the UI can't
// link to nothing, and cleanup hooks make this rare. We deliberately do
// not check the operation match here: invariant is enforced at write
// time, and a mismatch would simply not surface (FindByID would still
// return the doc, but the operation scope is consistent by construction).
func (r *taskResolver) WikiReferences(ctx context.Context, obj *models.Task) ([]*models.WikiDocument, error) {
	if len(obj.WikiReferences) == 0 {
		return []*models.WikiDocument{}, nil
	}
	out := make([]*models.WikiDocument, 0, len(obj.WikiReferences))
	for _, did := range obj.WikiReferences {
		doc, err := r.wikiRepo.FindByID(ctx, did)
		if err != nil || doc.DeletedAt != nil {
			continue
		}
		docCopy := doc
		out = append(out, &docCopy)
	}
	return out, nil
}

// CredentialReferences fetches the Credential rows for the
// credential_references array. Missing credentials are silently dropped.
func (r *taskResolver) CredentialReferences(ctx context.Context, obj *models.Task) ([]*models.Credential, error) {
	if len(obj.CredentialReferences) == 0 {
		return []*models.Credential{}, nil
	}
	out := make([]*models.Credential, 0, len(obj.CredentialReferences))
	for _, cid := range obj.CredentialReferences {
		c, err := r.credRepo.FindByID(ctx, cid)
		if err != nil {
			continue
		}
		cCopy := c
		out = append(out, &cCopy)
	}
	return out, nil
}

func (r *taskResolver) CreatedBy(ctx context.Context, obj *models.Task) (*models.User, error) {
	if obj.CreatedByID == uuid.Nil {
		return nil, nil
	}
	u, err := r.userRepo.FindByID(ctx, obj.CreatedByID)
	if err != nil {
		return nil, nil // creator deleted — render as null
	}
	return &u, nil
}

func (r *taskResolver) LastUpdatedBy(ctx context.Context, obj *models.Task) (*models.User, error) {
	if obj.LastUpdatedByID == nil || *obj.LastUpdatedByID == uuid.Nil {
		return nil, nil
	}
	u, err := r.userRepo.FindByID(ctx, *obj.LastUpdatedByID)
	if err != nil {
		return nil, nil
	}
	return &u, nil
}

func (r *taskResolver) LastUpdatedAt(_ context.Context, obj *models.Task) (*string, error) {
	if obj.LastUpdatedAt == nil {
		return nil, nil
	}
	s := obj.LastUpdatedAt.UTC().Format(time.RFC3339)
	return &s, nil
}

func (r *taskResolver) DeletedAt(_ context.Context, obj *models.Task) (*string, error) {
	if obj.DeletedAt == nil {
		return nil, nil
	}
	s := obj.DeletedAt.UTC().Format(time.RFC3339)
	return &s, nil
}

func (r *taskResolver) DoneAt(_ context.Context, obj *models.Task) (*string, error) {
	if obj.DoneAt == nil {
		return nil, nil
	}
	s := obj.DoneAt.UTC().Format(time.RFC3339)
	return &s, nil
}

func (r *taskResolver) CreatedAt(_ context.Context, obj *models.Task) (string, error) {
	return obj.CreateAt.UTC().Format(time.RFC3339), nil
}

func (r *taskResolver) UpdatedAt(_ context.Context, obj *models.Task) (string, error) {
	return obj.UpdateAt.UTC().Format(time.RFC3339), nil
}

// --- Helpers ---

// stampLastUpdatedAndApply layers attribution stamps on top of a partial
// update patch and applies it via the repo. The attribution columns are
// nullable in the model (LastUpdatedByID is *uuid.UUID, LastUpdatedAt is
// *time.Time), so passing the bare values via $set is fine — qmgo
// serializes them as concrete types.
func (r *taskResolver) stampLastUpdatedAndApply(ctx context.Context, task *models.Task, updates map[string]interface{}) error {
	callerUID, err := callerUIDFromCtx(ctx)
	if err != nil {
		return err
	}
	updates["last_updated_by_id"] = callerUID
	updates["last_updated_at"] = time.Now().UTC()
	if err := r.taskRepo.Update(ctx, task, updates); err != nil {
		return fmt.Errorf("failed to update task: %w", err)
	}
	return nil
}

// publishTaskEvent is the single fan-out point for task events. Snapshots
// the relevant primitives off the task so the bus payload stays decoupled
// from the model, and stamps DeletedAt for the soft-delete topic so
// timeline subscribers can render the trash entry without an extra
// lookup. oldStage is only relevant for stage transitions; pass "" for
// every other topic.
func (r *taskResolver) publishTaskEvent(ctx context.Context, topic eventbus.Topic, task *models.Task, oldStage string) {
	auth := gqlctx.AuthFromContext(ctx)
	payload := eventbus.TaskEventPayload{
		TaskID:      task.TaskID.String(),
		OperationID: task.OperationID.String(),
		Name:        task.Name,
		Stage:       string(task.Stage),
		Status:      string(task.Status),
		OldStage:    oldStage,
	}
	if task.DeletedAt != nil {
		payload.DeletedAt = task.DeletedAt.UTC().Format(time.RFC3339)
	}

	actor := eventbus.UserActor(auth.UserID)
	var event eventbus.Event
	switch topic {
	case eventbus.TopicTaskCreated:
		event = eventbus.NewTaskCreatedEvent(actor, payload)
	case eventbus.TopicTaskUpdated:
		event = eventbus.NewTaskUpdatedEvent(actor, payload)
	case eventbus.TopicTaskStageChanged:
		event = eventbus.NewTaskStageChangedEvent(actor, payload)
	case eventbus.TopicTaskStatusSet:
		event = eventbus.NewTaskStatusSetEvent(actor, payload)
	case eventbus.TopicTaskAssigneesChanged:
		event = eventbus.NewTaskAssigneesChangedEvent(actor, payload)
	case eventbus.TopicTaskReferencesChanged:
		event = eventbus.NewTaskReferencesChangedEvent(actor, payload)
	case eventbus.TopicTaskSoftDeleted:
		event = eventbus.NewTaskSoftDeletedEvent(actor, payload)
	case eventbus.TopicTaskRestored:
		event = eventbus.NewTaskRestoredEvent(actor, payload)
	case eventbus.TopicTaskHardDeleted:
		event = eventbus.NewTaskHardDeletedEvent(actor, payload)
	default:
		logger.From(ctx).Warn("unknown task topic, dropping event", zap.String("topic", string(topic)))
		return
	}
	r.eventBus.Publish(event)
}

// validateScoreInput bridges the GraphQL Int input (signed) into the
// uint8 model range while emitting a typed error that names the field
// for the validation message.
func validateScoreInput(score int, field string) error {
	if score < int(models.TaskScoreMin) || score > int(models.TaskScoreMax) {
		return fmt.Errorf("%s score %d out of range [%d, %d]", field, score, models.TaskScoreMin, models.TaskScoreMax)
	}
	return nil
}

// parseTaskUUIDList parses a string slice into UUIDs, enforces a maximum
// length, deduplicates while preserving first-seen order, and returns a
// non-nil empty slice for empty input. Returns a descriptive error with
// the field name on any parse failure.
func parseTaskUUIDList(in []string, field string, maxLen int) ([]uuid.UUID, error) {
	if len(in) == 0 {
		return []uuid.UUID{}, nil
	}
	if len(in) > maxLen {
		return nil, fmt.Errorf("%s exceeds max %d entries", field, maxLen)
	}
	seen := make(map[uuid.UUID]struct{}, len(in))
	out := make([]uuid.UUID, 0, len(in))
	for _, raw := range in {
		uid, err := uuid.Parse(raw)
		if err != nil {
			return nil, fmt.Errorf("invalid %s entry %q: %w", field, raw, err)
		}
		if _, dup := seen[uid]; dup {
			continue
		}
		seen[uid] = struct{}{}
		out = append(out, uid)
	}
	return out, nil
}
