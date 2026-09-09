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
