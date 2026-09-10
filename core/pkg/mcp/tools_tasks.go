package mcp

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

type findTasksArgs struct {
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation to search. Defaults to whatever the operator currently has open."`
	Stage       string `json:"stage,omitempty"        jsonschema:"Restrict to one stage: BACKLOG, TODO, IN_PROCESS or DONE."`
	Search      string `json:"search,omitempty"       jsonschema:"Free-text match against name and description."`
	Limit       int    `json:"limit,omitempty"        jsonschema:"Maximum tasks to return (default 25, maximum 50)."`
	Cursor      string `json:"cursor,omitempty"       jsonschema:"Continue a previous page using its nextCursor."`
}

type getTaskArgs struct {
	TaskID string `json:"task_id" jsonschema:"The task's id, from find_tasks."`
}

type createTaskArgs struct {
	IdempotencyKey
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation to create the task in. Defaults to whatever the operator currently has open."`
	Name        string `json:"name"                   jsonschema:"Short title for the task."`
	Description string `json:"description,omitempty"  jsonschema:"What needs doing, and why."`
	RiskScore   int    `json:"risk_score,omitempty"   jsonschema:"How risky this is to attempt, 0-10."`
	ProfitScore int    `json:"profit_score,omitempty" jsonschema:"How valuable success would be, 0-10."`
	AssignToMe  bool   `json:"assign_to_me,omitempty" jsonschema:"Assign the task to the operator you act for. Leave it off to propose work without claiming it."`

	WikiIDs       []string `json:"wiki_ids,omitempty"       jsonschema:"Wiki pages this task comes out of or writes up, from search_wiki. Link them here rather than leaving the task to stand alone."`
	CredentialIDs []string `json:"credential_ids,omitempty" jsonschema:"Credentials this task depends on or is meant to produce, from find_credentials."`
}

type taskAssignmentArgs struct {
	IdempotencyKey
	TaskID string `json:"task_id" jsonschema:"The task, from find_tasks."`
}

type updateTaskArgs struct {
	IdempotencyKey
	TaskID string `json:"task_id"                     jsonschema:"The task to change, from find_tasks."`
	Name   string `json:"name,omitempty"              jsonschema:"Rename the task."`
	// Scores use -1 as "leave alone" because 0 is a legitimate score and the
	// two have to be distinguishable.
	Description       string `json:"description,omitempty"        jsonschema:"Replace the description."`
	RiskScore         int    `json:"risk_score,omitempty"         jsonschema:"How risky this is to attempt, 0-10. Omit to leave unchanged."`
	RiskDescription   string `json:"risk_description,omitempty"   jsonschema:"Why it carries that risk."`
	ProfitScore       int    `json:"profit_score,omitempty"       jsonschema:"How valuable success would be, 0-10. Omit to leave unchanged."`
	ProfitDescription string `json:"profit_description,omitempty" jsonschema:"Why it is worth that much."`
}

type addTaskWikiReferenceArgs struct {
	IdempotencyKey
	TaskID string `json:"task_id"     jsonschema:"The task to attach the page to."`
	WikiID string `json:"wiki_id"     jsonschema:"The wiki page to attach, from search_wiki."`
}

type addTaskCredentialReferenceArgs struct {
	IdempotencyKey
	TaskID       string `json:"task_id"       jsonschema:"The task to attach the credential to."`
	CredentialID string `json:"credential_id" jsonschema:"The credential to attach, from find_credentials."`
}

type changeTaskStageArgs struct {
	IdempotencyKey
	TaskID  string `json:"task_id"           jsonschema:"The task to move."`
	Stage   string `json:"stage"             jsonschema:"Target stage: BACKLOG, TODO, IN_PROCESS or DONE."`
	Status  string `json:"status,omitempty"  jsonschema:"Required when moving to DONE: SUCCESS or FAIL."`
	Summary string `json:"summary,omitempty" jsonschema:"What happened. Worth filling in when closing a task."`
}

func registerTaskTools(s *Server) {
	register(s, &mcp.Tool{
		Name:        "find_tasks",
		Description: "Search the operation's task board.",
	}, readTool, handleFindTasks)

	register(s, &mcp.Tool{
		Name:        "get_task",
		Description: "One task in full, including its risk and profit rationale.",
	}, readTool, handleGetTask)

	register(s, &mcp.Tool{
		Name: "create_task",
		Description: "Add a task to the board. Use this to propose work rather than doing " +
			"something the operator has not asked for. Link the wiki pages and credentials the " +
			"task came out of or will produce — a task with no references leaves the next person " +
			"to work out by hand what it meant.",
	}, writeTool, handleCreateTask)

	register(s, &mcp.Tool{
		Name: "assign_task_to_me",
		Description: "Put the operator you act for on a task's assignee list. Other assignees " +
			"are left alone — you can only ever add or remove that one operator.",
	}, writeTool, handleAssignTaskToMe)

	register(s, &mcp.Tool{
		Name: "unassign_task_from_me",
		Description: "Take the operator you act for off a task's assignee list, leaving any " +
			"other assignees in place.",
	}, writeTool, handleUnassignTaskFromMe)

	register(s, &mcp.Tool{
		Name: "update_task",
		Description: "Change a task's name, description or risk/profit scoring. Use " +
			"change_task_stage to move it between columns.",
	}, writeTool, handleUpdateTask)

	register(s, &mcp.Tool{
		Name: "add_task_wiki_reference",
		Description: "Link a wiki page to a task, so the notes and the work that produced them " +
			"stay connected. Idempotent — linking the same page twice is harmless.",
	}, writeTool, handleAddTaskWikiReference)

	register(s, &mcp.Tool{
		Name: "add_task_credential_reference",
		Description: "Link a credential to a task, so the task carries the access it depends on " +
			"or the access it produced. Idempotent — linking the same credential twice is " +
			"harmless.",
	}, writeTool, handleAddTaskCredentialReference)

	register(s, &mcp.Tool{
		Name: "change_task_stage",
		Description: "Move a task between board columns. Moving to DONE requires a status of " +
			"SUCCESS or FAIL.",
	}, writeTool, handleChangeTaskStage)
}

func handleFindTasks(ctx context.Context, s *Server, args findTasksArgs) (toolResult, error) {
	opID, err := s.resolveOperation(ctx, args.OperationID)
	if err != nil {
		return toolResult{}, err
	}
	if _, err := s.authorizeOperation(ctx, opID, models.OperationRoleViewer); err != nil {
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

// namedWikiReferences resolves link targets to titles.
//
// A reference whose target cannot be read comes back with its id and no name
// rather than being dropped: the link genuinely exists on the task, and
// hiding it would make a real relationship invisible for no benefit. Nothing
// here is authorized separately — these ids are already on a task the caller
// was allowed to load, and a title is not the document.
func (s *Server) namedWikiReferences(ctx context.Context, ids []uuid.UUID) []referenceView {
	out := make([]referenceView, 0, len(ids))
	for _, id := range ids {
		ref := referenceView{ID: id.String()}
		if doc, err := s.deps.WikiDocs.WikiDocument(ctx, id.String()); err == nil {
			ref.Name = doc.Title
		}
		out = append(out, ref)
	}
	return out
}

func (s *Server) namedCredentialReferences(ctx context.Context, ids []uuid.UUID) []referenceView {
	out := make([]referenceView, 0, len(ids))
	for _, id := range ids {
		ref := referenceView{ID: id.String()}
		if cred, err := s.deps.Credentials.Credential(ctx, id.String()); err == nil {
			ref.Name = cred.Name
		}
		out = append(out, ref)
	}
	return out
}

func handleCreateTask(ctx context.Context, s *Server, args createTaskArgs) (toolResult, error) {
	opID, err := s.resolveOperation(ctx, args.OperationID)
	if err != nil {
		return toolResult{}, err
	}
	if _, err := s.authorizeOperation(ctx, opID, models.OperationRoleOperator); err != nil {
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

func handleAddTaskWikiReference(ctx context.Context, s *Server, args addTaskWikiReferenceArgs) (toolResult, error) {
	task, err := s.loadTaskInScope(ctx, args.TaskID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}

	// The page has to be reachable by this key too, or a link could be used to
	// point at a document the agent is not allowed to read.
	doc, err := s.deps.WikiDocs.WikiDocument(ctx, args.WikiID)
	if err != nil {
		return toolResult{}, fmt.Errorf("wiki page not found")
	}
	if _, err := s.authorizeOperation(ctx, doc.OperationID, models.OperationRoleViewer); err != nil {
		return toolResult{}, err
	}

	updated, err := s.deps.Tasks.AddTaskWikiReference(ctx, args.TaskID, args.WikiID)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to link the page: %w", err)
	}

	return toolResult{
		Payload:     toTaskView(updated),
		OperationID: &task.OperationID,
		Summary:     fmt.Sprintf("linked %q to task %s", doc.Title, task.Name),
	}, nil
}

func handleAddTaskCredentialReference(ctx context.Context, s *Server, args addTaskCredentialReferenceArgs) (toolResult, error) {
	task, err := s.loadTaskInScope(ctx, args.TaskID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}

	// Readable by this key too — a link must not become a way to point at a
	// credential the agent could not otherwise open.
	cred, err := s.deps.Credentials.Credential(ctx, args.CredentialID)
	if err != nil {
		return toolResult{}, fmt.Errorf("credential not found")
	}
	if _, err := s.authorizeOperation(ctx, cred.OperationID, models.OperationRoleViewer); err != nil {
		return toolResult{}, err
	}

	updated, err := s.deps.Tasks.AddTaskCredentialReference(ctx, args.TaskID, args.CredentialID)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to link the credential: %w", err)
	}

	return toolResult{
		Payload:     toTaskView(updated),
		OperationID: &task.OperationID,
		Summary:     fmt.Sprintf("linked credential %q to task %s", cred.Name, task.Name),
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

func handleAssignTaskToMe(ctx context.Context, s *Server, args taskAssignmentArgs) (toolResult, error) {
	return s.changeOwnAssignment(ctx, args.TaskID, true)
}

func handleUnassignTaskFromMe(ctx context.Context, s *Server, args taskAssignmentArgs) (toolResult, error) {
	return s.changeOwnAssignment(ctx, args.TaskID, false)
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

// loadTaskInScope fetches a task and applies both gates: the operation role,
// and whether this agent may touch that particular task at all.
func (s *Server) loadTaskInScope(ctx context.Context, taskID string, minRole models.OperationRole) (*models.Task, error) {
	task, err := s.deps.Tasks.Task(ctx, taskID)
	if err != nil {
		return nil, fmt.Errorf("task not found")
	}
	if _, err := s.authorizeOperation(ctx, task.OperationID, minRole); err != nil {
		return nil, err
	}
	owner, err := agentOwnerID(ctx)
	if err != nil {
		return nil, err
	}
	if err := requireTaskInScope(task, owner); err != nil {
		return nil, err
	}
	return task, nil
}
