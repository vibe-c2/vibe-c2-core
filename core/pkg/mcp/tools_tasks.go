package mcp

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

type findTasksArgs struct {
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation id; omit for the operator's current one."`
	Stage       string `json:"stage,omitempty"        jsonschema:"BACKLOG, TODO, IN_PROCESS or DONE."`
	Search      string `json:"search,omitempty"       jsonschema:"Free-text match against name and description."`
	Limit       int    `json:"limit,omitempty"        jsonschema:"Page size, max 50."`
	Cursor      string `json:"cursor,omitempty"       jsonschema:"nextCursor from the previous page."`
}

type getTaskArgs struct {
	TaskID string `json:"task_id" jsonschema:"Task id."`
}

type createTaskArgs struct {
	IdempotencyKey
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation id; omit for the operator's current one."`
	Name        string `json:"name"                   jsonschema:"Short title."`
	Description string `json:"description,omitempty"  jsonschema:"What needs doing, and why."`
	RiskScore   int    `json:"risk_score,omitempty"   jsonschema:"Risk of attempting it, 0-10."`
	ProfitScore int    `json:"profit_score,omitempty" jsonschema:"Value of success, 0-10."`
	AssignToMe  bool   `json:"assign_to_me,omitempty" jsonschema:"Assign to the operator you act for; omit to propose without claiming."`

	WikiIDs       []string `json:"wiki_ids,omitempty"       jsonschema:"Wiki pages it comes out of or writes up."`
	CredentialIDs []string `json:"credential_ids,omitempty" jsonschema:"Credentials it depends on or produces."`
}

type setTaskAssignmentArgs struct {
	IdempotencyKey
	TaskID   string `json:"task_id"  jsonschema:"Task id."`
	Assigned bool   `json:"assigned" jsonschema:"True to put the operator you act for on the task, false to take them off."`
}

type updateTaskArgs struct {
	IdempotencyKey
	TaskID string `json:"task_id"                     jsonschema:"Task id."`
	Name   string `json:"name,omitempty"              jsonschema:"New name."`
	// Scores use -1 as "leave alone" because 0 is a legitimate score and the
	// two have to be distinguishable.
	Description       string `json:"description,omitempty"        jsonschema:"New description."`
	RiskScore         int    `json:"risk_score,omitempty"         jsonschema:"Risk 0-10; omit to keep."`
	RiskDescription   string `json:"risk_description,omitempty"   jsonschema:"Why that risk."`
	ProfitScore       int    `json:"profit_score,omitempty"       jsonschema:"Value 0-10; omit to keep."`
	ProfitDescription string `json:"profit_description,omitempty" jsonschema:"Why that value."`
}

type linkTaskArgs struct {
	IdempotencyKey
	TaskID        string   `json:"task_id"                  jsonschema:"Task id."`
	WikiIDs       []string `json:"wiki_ids,omitempty"       jsonschema:"Wiki page ids to link."`
	CredentialIDs []string `json:"credential_ids,omitempty" jsonschema:"Credential ids to link."`
}

type changeTaskStageArgs struct {
	IdempotencyKey
	TaskID  string `json:"task_id"           jsonschema:"Task id."`
	Stage   string `json:"stage"             jsonschema:"BACKLOG, TODO, IN_PROCESS or DONE."`
	Status  string `json:"status,omitempty"  jsonschema:"Outcome for the engagement, required for DONE: SUCCESS if the work advanced it (access, a credential, a confirmed vulnerability), FAIL if the lead was a dead end (technique failed, host not exploitable, vulnerability refuted). A cleanly finished task can still be FAIL."`
	Summary string `json:"summary,omitempty" jsonschema:"What happened; fill in when closing."`
}

func registerTaskTools(s *Server) {
	register(s, &mcp.Tool{
		Name:        "find_tasks",
		Description: "Search the task board.",
	}, readTool, handleFindTasks)

	register(s, &mcp.Tool{
		Name:        "get_task",
		Description: "One task in full, with its rationale and linked pages and credentials.",
	}, readTool, handleGetTask)

	register(s, &mcp.Tool{
		Name: "create_task",
		Description: "Add a task to the board, the way to propose work. Link the pages and " +
			"credentials it relates to.",
	}, writeTool, handleCreateTask)

	register(s, &mcp.Tool{
		Name: "set_task_assignment",
		Description: "Put the operator you act for on a task, or take them off. Other " +
			"assignees are left alone.",
	}, writeTool, handleSetTaskAssignment)

	register(s, &mcp.Tool{
		Name:        "update_task",
		Description: "Change a task's name, description or risk/profit scoring.",
	}, writeTool, handleUpdateTask)

	register(s, &mcp.Tool{
		Name: "link_task",
		Description: "Link wiki pages and credentials to a task. Idempotent: linking twice is " +
			"harmless.",
	}, writeTool, handleLinkTask)

	register(s, &mcp.Tool{
		Name:        "change_task_stage",
		Description: "Move a task between board columns. DONE needs status SUCCESS or FAIL, judged by the engagement outcome not task completion: a refuted lead or failed technique is FAIL even when the task was finished cleanly. Also flips SUCCESS/FAIL on a task already in DONE.",
	}, writeTool, handleChangeTaskStage)
}

func handleFindTasks(ctx context.Context, s *Server, args findTasksArgs) (toolResult, error) {
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleViewer)
	if err != nil {
		return toolResult{}, err
	}

	var stage *models.TaskStage
	if args.Stage != "" {
		parsed := models.TaskStage(args.Stage)
		if !parsed.IsValid() {
			return toolResult{}, fmt.Errorf("stage %q is not one of BACKLOG, TODO, IN_PROCESS, DONE", args.Stage)
		}
		stage = &parsed
	}

	limit := clampPageSize(args.Limit)
	conn, err := s.deps.Tasks.Tasks(ctx, opID.String(), stage, nil, nil, nil, nil, nil,
		optionalString(args.Search), &limit, optionalString(args.Cursor), nil, nil)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to search tasks: %w", err)
	}

	owner, err := agentOwnerID(ctx)
	if err != nil {
		return toolResult{}, err
	}

	// Filtered here rather than in the query. The restriction belongs to the
	// agent principal, not to the task API — a human on this board sees all of
	// it, and pushing an agent-only rule into the shared resolver would change
	// what everyone can do.
	//
	// The consequence is that a page can come back smaller than asked for.
	// That is said out loud below rather than papered over, because an agent
	// that reads "3 tasks" without being told some were withheld will conclude
	// the board is nearly empty.
	views := make([]taskView, 0, len(conn.Edges))
	hidden := 0
	for _, edge := range conn.Edges {
		if !taskInAgentScope(edge.Node, owner) {
			hidden++
			continue
		}
		views = append(views, toTaskView(edge.Node))
	}

	notes := totalNote(conn.TotalCount, len(views)+hidden)
	if hidden > 0 {
		notes = append(notes, fmt.Sprintf(
			"%d task(s) on this page are assigned to other operators and are not shown. "+
				"You can see tasks assigned to the operator you act for, and unassigned ones.",
			hidden))
	}

	// The cursor comes from the underlying page, not from what survived the
	// filter: paging has to continue from where the scan stopped, or the
	// withheld rows would be scanned again on every subsequent page.
	result, err := newPage(views, endCursor(conn.PageInfo), notes...)
	if err != nil {
		return toolResult{}, err
	}
	return toolResult{
		Payload:     result,
		OperationID: &opID,
		Summary:     fmt.Sprintf("searched tasks (%d shown, %d withheld)", len(views), hidden),
	}, nil
}

func handleGetTask(ctx context.Context, s *Server, args getTaskArgs) (toolResult, error) {
	task, err := s.loadTaskInScope(ctx, args.TaskID, models.OperationRoleViewer)
	if err != nil {
		return toolResult{}, err
	}

	view := struct {
		taskView
		RiskDescription   string `json:"riskDescription,omitempty"`
		ProfitDescription string `json:"profitDescription,omitempty"`
		Summary           string `json:"summary,omitempty"`
		// Named, and never omitted. An agent that cannot see what a task is
		// already linked to cannot tell a task that was deliberately left bare
		// from one whose links someone forgot — and will guess wrong in both
		// directions.
		WikiReferences       []referenceView `json:"wikiReferences"`
		CredentialReferences []referenceView `json:"credentialReferences"`
	}{
		taskView:             toTaskView(task),
		RiskDescription:      task.RiskDescription,
		ProfitDescription:    task.ProfitDescription,
		Summary:              task.Summary,
		WikiReferences:       s.namedWikiReferences(ctx, task.WikiReferences),
		CredentialReferences: s.namedCredentialReferences(ctx, task.CredentialReferences),
	}

	return toolResult{
		Payload:     view,
		OperationID: &task.OperationID,
		Summary:     fmt.Sprintf("read task %s", task.Name),
	}, nil
}

// namedWikiReferences resolves link targets to titles in one query.
//
// A reference whose target cannot be read comes back with its id and no name
// rather than being dropped: the link genuinely exists on the task, and
// hiding it would make a real relationship invisible for no benefit. Nothing
// here is authorized separately — these ids are already on a task the caller
// was allowed to load, and a title is not the document. The projection
// returns titles only, so ten references cost one round trip and no bodies.
func (s *Server) namedWikiReferences(ctx context.Context, ids []uuid.UUID) []referenceView {
	names := map[uuid.UUID]string{}
	if s.deps.WikiDocRepo != nil {
		if docs, err := s.deps.WikiDocRepo.FindTitlesByIDs(ctx, ids); err == nil {
			for _, d := range docs {
				names[d.DocumentID] = d.Title
			}
		}
	}
	return namedReferences(ids, names)
}

func (s *Server) namedCredentialReferences(ctx context.Context, ids []uuid.UUID) []referenceView {
	names := map[uuid.UUID]string{}
	if s.deps.CredentialRepo != nil {
		if creds, err := s.deps.CredentialRepo.FindNamesByIDs(ctx, ids); err == nil {
			for _, c := range creds {
				names[c.CredentialID] = c.Name
			}
		}
	}
	return namedReferences(ids, names)
}

// namedReferences pairs ids with the names that were found, in the task's
// own order, leaving unnamed what could not be resolved.
func namedReferences(ids []uuid.UUID, names map[uuid.UUID]string) []referenceView {
	out := make([]referenceView, 0, len(ids))
	for _, id := range ids {
		out = append(out, referenceView{ID: id.String(), Name: names[id]})
	}
	return out
}

func handleCreateTask(ctx context.Context, s *Server, args createTaskArgs) (toolResult, error) {
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}

	input := model.CreateTaskInput{
		OperationID: opID.String(),
		Name:        args.Name,
		Description: optionalString(args.Description),
		RiskScore:   args.RiskScore,
		ProfitScore: args.ProfitScore,
	}
	if args.AssignToMe {
		owner, err := agentOwnerID(ctx)
		if err != nil {
			return toolResult{}, err
		}
		input.AssigneeIds = []string{owner.String()}
	}

	task, err := s.deps.Tasks.CreateTask(ctx, input)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to create task: %w", err)
	}

	// Links are applied after creation because the create mutation does not
	// take them. A link that fails does not fail the task — the task exists,
	// and unwinding it would be worse than saying which link did not stick.
	task, notes := s.linkOnCreate(ctx, task, args)

	payload := struct {
		taskView
		Notes []string `json:"notes,omitempty"`
	}{taskView: toTaskView(task), Notes: notes}

	return toolResult{
		Payload:     payload,
		OperationID: &opID,
		Summary:     fmt.Sprintf("created task %s", task.Name),
	}, nil
}

// linkOnCreate applies the reference lists supplied to create_task, returning
// the latest task and a note for anything that would not link.
func (s *Server) linkOnCreate(ctx context.Context, task *models.Task, args createTaskArgs) (*models.Task, []string) {
	var notes []string
	id := task.TaskID.String()

	for _, wikiID := range args.WikiIDs {
		updated, err := s.deps.Tasks.AddTaskWikiReference(ctx, id, wikiID)
		if err != nil {
			notes = append(notes, fmt.Sprintf("could not link wiki page %s: %v", wikiID, err))
			continue
		}
		task = updated
	}
	for _, credID := range args.CredentialIDs {
		updated, err := s.deps.Tasks.AddTaskCredentialReference(ctx, id, credID)
		if err != nil {
			notes = append(notes, fmt.Sprintf("could not link credential %s: %v", credID, err))
			continue
		}
		task = updated
	}
	return task, notes
}

func handleUpdateTask(ctx context.Context, s *Server, args updateTaskArgs) (toolResult, error) {
	task, err := s.loadTaskInScope(ctx, args.TaskID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}

	// Zero is a real score, so an omitted field cannot be told apart from a
	// deliberate 0 through the JSON alone. Treat 0 as "unchanged" and require
	// an explicit range check on anything else — scoring a task 0 when the
	// agent meant to leave it alone is a quiet way to mislead the operator.
	if args.RiskScore != 0 {
		if err := validateScore("risk_score", args.RiskScore); err != nil {
			return toolResult{}, err
		}
	}
	if args.ProfitScore != 0 {
		if err := validateScore("profit_score", args.ProfitScore); err != nil {
			return toolResult{}, err
		}
	}

	updated, err := s.deps.Tasks.UpdateTask(ctx, args.TaskID, model.UpdateTaskInput{
		Name:              optionalString(args.Name),
		Description:       optionalString(args.Description),
		RiskScore:         optionalInt(args.RiskScore, 0),
		RiskDescription:   optionalString(args.RiskDescription),
		ProfitScore:       optionalInt(args.ProfitScore, 0),
		ProfitDescription: optionalString(args.ProfitDescription),
	})
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to update task: %w", err)
	}

	return toolResult{
		Payload:     toTaskView(updated),
		OperationID: &task.OperationID,
		Summary:     fmt.Sprintf("updated task %s", updated.Name),
	}, nil
}

// handleLinkTask attaches pages and credentials to a task in one call.
//
// Every target has to be readable by this key too, or a link could be used to
// point at a document or credential the agent is not allowed to open. A
// target that fails does not fail the rest: the links that stuck are real,
// and the result names the ones that did not.
func handleLinkTask(ctx context.Context, s *Server, args linkTaskArgs) (toolResult, error) {
	task, err := s.loadTaskInScope(ctx, args.TaskID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}
	if len(args.WikiIDs) == 0 && len(args.CredentialIDs) == 0 {
		return toolResult{}, refuse("give wiki_ids, credential_ids, or both.")
	}

	var notes []string
	linked := 0
	updated := task
	for _, wikiID := range args.WikiIDs {
		if _, err := s.loadWikiDocument(ctx, wikiID, models.OperationRoleViewer); err != nil {
			notes = append(notes, fmt.Sprintf("could not link wiki page %s: %v", wikiID, err))
			continue
		}
		next, err := s.deps.Tasks.AddTaskWikiReference(ctx, args.TaskID, wikiID)
		if err != nil {
			notes = append(notes, fmt.Sprintf("could not link wiki page %s: %v", wikiID, err))
			continue
		}
		updated = next
		linked++
	}
	for _, credID := range args.CredentialIDs {
		if _, err := s.loadCredential(ctx, credID, models.OperationRoleViewer); err != nil {
			notes = append(notes, fmt.Sprintf("could not link credential %s: %v", credID, err))
			continue
		}
		next, err := s.deps.Tasks.AddTaskCredentialReference(ctx, args.TaskID, credID)
		if err != nil {
			notes = append(notes, fmt.Sprintf("could not link credential %s: %v", credID, err))
			continue
		}
		updated = next
		linked++
	}

	if linked == 0 {
		return toolResult{}, fmt.Errorf("nothing could be linked: %s", strings.Join(notes, "; "))
	}

	payload := struct {
		taskView
		Notes []string `json:"notes,omitempty"`
	}{taskView: toTaskView(updated), Notes: notes}

	return toolResult{
		Payload:     payload,
		OperationID: &task.OperationID,
		Summary:     fmt.Sprintf("linked %d reference(s) to task %s", linked, task.Name),
	}, nil
}

func handleChangeTaskStage(ctx context.Context, s *Server, args changeTaskStageArgs) (toolResult, error) {
	task, err := s.loadTaskInScope(ctx, args.TaskID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}

	stage := models.TaskStage(args.Stage)
	if !stage.IsValid() {
		return toolResult{}, fmt.Errorf("stage %q is not one of BACKLOG, TODO, IN_PROCESS, DONE", args.Stage)
	}

	input := model.ChangeTaskStageInput{
		TaskID:  args.TaskID,
		Stage:   stage,
		Summary: optionalString(args.Summary),
	}
	if args.Status != "" {
		status := models.TaskStatus(args.Status)
		input.Status = &status
	}

	updated, err := s.deps.Tasks.ChangeTaskStage(ctx, input)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to change task stage: %w", err)
	}
	return toolResult{
		Payload:     toTaskView(updated),
		OperationID: &task.OperationID,
		Summary:     fmt.Sprintf("moved task %s to %s", task.Name, stage),
	}, nil
}

func handleSetTaskAssignment(ctx context.Context, s *Server, args setTaskAssignmentArgs) (toolResult, error) {
	return s.changeOwnAssignment(ctx, args.TaskID, args.Assigned)
}

// changeOwnAssignment adds or removes the owner, and only the owner. It reads
// the current list and edits it rather than replacing it, so a colleague who
// had also claimed the task keeps their claim — SetTaskAssignees overwrites
// outright, and handing an agent that verb directly is how someone else's work
// would quietly lose its owner.
func (s *Server) changeOwnAssignment(ctx context.Context, taskID string, assign bool) (toolResult, error) {
	task, err := s.loadTaskInScope(ctx, taskID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}
	owner, err := agentOwnerID(ctx)
	if err != nil {
		return toolResult{}, err
	}

	next := withOwnerUnassigned(task.AssigneeIDs, owner)
	verb := "unassigned the operator from"
	if assign {
		next = withOwnerAssigned(task.AssigneeIDs, owner)
		verb = "assigned the operator to"
	}

	updated, err := s.deps.Tasks.SetTaskAssignees(ctx, taskID, next)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to change the assignment: %w", err)
	}

	return toolResult{
		Payload:     toTaskView(updated),
		OperationID: &task.OperationID,
		Summary:     fmt.Sprintf("%s task %s", verb, task.Name),
	}, nil
}
