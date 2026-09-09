package mcp

import (
	"context"
	"fmt"

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
			"something the operator has not asked for.",
	}, writeTool, handleCreateTask)

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

	views := make([]taskView, 0, len(conn.Edges))
	for _, edge := range conn.Edges {
		views = append(views, toTaskView(edge.Node))
	}

	result, err := newPage(views, endCursor(conn.PageInfo), totalNote(conn.TotalCount, len(views))...)
	if err != nil {
		return toolResult{}, err
	}
	return toolResult{
		Payload:     result,
		OperationID: &opID,
		Summary:     fmt.Sprintf("searched tasks (%d shown of %d)", len(views), conn.TotalCount),
	}, nil
}

func handleGetTask(ctx context.Context, s *Server, args getTaskArgs) (toolResult, error) {
	task, err := s.deps.Tasks.Task(ctx, args.TaskID)
	if err != nil {
		return toolResult{}, fmt.Errorf("task not found")
	}
	if _, err := s.authorizeOperation(ctx, task.OperationID, models.OperationRoleViewer); err != nil {
		return toolResult{}, err
	}

	view := struct {
		taskView
		RiskDescription   string `json:"riskDescription,omitempty"`
		ProfitDescription string `json:"profitDescription,omitempty"`
		Summary           string `json:"summary,omitempty"`
	}{
		taskView:          toTaskView(task),
		RiskDescription:   task.RiskDescription,
		ProfitDescription: task.ProfitDescription,
		Summary:           task.Summary,
	}

	return toolResult{
		Payload:     view,
		OperationID: &task.OperationID,
		Summary:     fmt.Sprintf("read task %s", task.Name),
	}, nil
}

func handleCreateTask(ctx context.Context, s *Server, args createTaskArgs) (toolResult, error) {
	opID, err := s.resolveOperation(ctx, args.OperationID)
	if err != nil {
		return toolResult{}, err
	}
	if _, err := s.authorizeOperation(ctx, opID, models.OperationRoleOperator); err != nil {
		return toolResult{}, err
	}

	task, err := s.deps.Tasks.CreateTask(ctx, model.CreateTaskInput{
		OperationID: opID.String(),
		Name:        args.Name,
		Description: optionalString(args.Description),
		RiskScore:   args.RiskScore,
		ProfitScore: args.ProfitScore,
	})
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to create task: %w", err)
	}
	return toolResult{
		Payload:     toTaskView(task),
		OperationID: &opID,
		SubjectID:   task.TaskID,
		SubjectKind: models.SubjectKindTask,
		SubjectName: task.Name,
		Summary:     fmt.Sprintf("created task %s", task.Name),
	}, nil
}

func handleUpdateTask(ctx context.Context, s *Server, args updateTaskArgs) (toolResult, error) {
	task, err := s.deps.Tasks.Task(ctx, args.TaskID)
	if err != nil {
		return toolResult{}, fmt.Errorf("task not found")
	}
	if _, err := s.authorizeOperation(ctx, task.OperationID, models.OperationRoleOperator); err != nil {
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
		SubjectID:   task.TaskID,
		SubjectKind: models.SubjectKindTask,
		SubjectName: updated.Name,
		Summary:     fmt.Sprintf("updated task %s", updated.Name),
	}, nil
}

func handleAddTaskWikiReference(ctx context.Context, s *Server, args addTaskWikiReferenceArgs) (toolResult, error) {
	task, err := s.deps.Tasks.Task(ctx, args.TaskID)
	if err != nil {
		return toolResult{}, fmt.Errorf("task not found")
	}
	if _, err := s.authorizeOperation(ctx, task.OperationID, models.OperationRoleOperator); err != nil {
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
		SubjectID:   task.TaskID,
		SubjectKind: models.SubjectKindTask,
		SubjectName: task.Name,
		Summary:     fmt.Sprintf("linked %q to task %s", doc.Title, task.Name),
	}, nil
}

func handleChangeTaskStage(ctx context.Context, s *Server, args changeTaskStageArgs) (toolResult, error) {
	task, err := s.deps.Tasks.Task(ctx, args.TaskID)
	if err != nil {
		return toolResult{}, fmt.Errorf("task not found")
	}
	if _, err := s.authorizeOperation(ctx, task.OperationID, models.OperationRoleOperator); err != nil {
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
		SubjectID:   task.TaskID,
		SubjectKind: models.SubjectKindTask,
		SubjectName: task.Name,
		Summary:     fmt.Sprintf("moved task %s to %s", task.Name, stage),
	}, nil
}
