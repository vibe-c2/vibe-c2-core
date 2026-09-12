package mcp

import (
	"context"
	"fmt"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

type getTimelineArgs struct {
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation whose history to read. Defaults to whatever the operator currently has open."`
	Date        string `json:"date,omitempty"         jsonschema:"Any timestamp inside the day to read, RFC3339. Defaults to today."`
	Timezone    string `json:"timezone,omitempty"     jsonschema:"IANA timezone the day boundaries are computed in, e.g. 'Europe/Berlin'. Defaults to UTC."`
	Limit       int    `json:"limit,omitempty"        jsonschema:"Maximum events to return (default 25, maximum 50)."`
}

type createTimelineEventArgs struct {
	IdempotencyKey
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation to annotate. Defaults to whatever the operator currently has open."`
	Name        string `json:"name"                   jsonschema:"Short label for what happened."`
	Description string `json:"description,omitempty"  jsonschema:"Longer detail."`
	OccurredAt  string `json:"occurred_at,omitempty"  jsonschema:"When it happened, RFC3339. Defaults to now."`
	visualIdentity
}

func registerTimelineTools(s *Server) {
	register(s, &mcp.Tool{
		Name: "get_timeline",
		Description: "Read the operation's activity history for a given day — what was found, " +
			"changed and closed, and by whom.",
	}, readTool, handleGetTimeline)

	register(s, &mcp.Tool{
		Name: "create_timeline_event",
		Description: "Add a marker to the operation timeline. Use it to record something " +
			"noteworthy that no other record captures.",
	}, writeTool, handleCreateTimelineEvent)
}

func handleGetTimeline(ctx context.Context, s *Server, args getTimelineArgs) (toolResult, error) {
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleViewer)
	if err != nil {
		return toolResult{}, err
	}

	date := args.Date
	if date == "" {
		date = time.Now().UTC().Format(time.RFC3339)
	}
	timezone := args.Timezone
	if timezone == "" {
		timezone = "UTC"
	}

	limit := clampPageSize(args.Limit)
	granularity := repository.GranularityDay
	conn, err := s.deps.Timeline.TimelineEventsByDay(ctx, opID.String(), date, timezone,
		&granularity, nil, nil, &limit, nil)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to read timeline: %w", err)
	}

	views := make([]timelineEventView, 0, len(conn.Edges))
	for _, edge := range conn.Edges {
		// ActorLabel, not Actor. Actor resolves only for human rows, so an
		// agent's own work came back unattributed — the agent could not even
		// see what it had just done. ActorLabel renders every kind: a
		// username, "Claude (via alice)", or a service name.
		actor, err := s.deps.Timeline.ActorLabel(ctx, edge.Node)
		if err != nil {
			actor = ""
		}
		views = append(views, toTimelineEventView(edge.Node, actor))
	}

	result, err := newPage(views, endCursor(conn.PageInfo))
	if err != nil {
		return toolResult{}, err
	}
	return toolResult{
		Payload:     result,
		OperationID: &opID,
		Summary:     fmt.Sprintf("read %d timeline events", len(views)),
	}, nil
}

func handleCreateTimelineEvent(ctx context.Context, s *Server, args createTimelineEventArgs) (toolResult, error) {
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}

	occurredAt := args.OccurredAt
	if occurredAt == "" {
		occurredAt = time.Now().UTC().Format(time.RFC3339)
	}

	if err := args.validate(); err != nil {
		return toolResult{}, err
	}
	emoji, icon, color := args.apply()

	event, err := s.deps.Timeline.CreateCustomTimelineEvent(ctx, opID.String(),
		model.CreateCustomTimelineEventInput{
			Name:        args.Name,
			Description: optionalString(args.Description),
			OccurredAt:  occurredAt,
			Emoji:       emoji,
			Icon:        icon,
			Color:       color,
		})
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to create timeline event: %w", err)
	}

	return toolResult{
		Payload:     toTimelineEventView(event, ""),
		OperationID: &opID,
		// A marker is its own subject, the same way a human-authored custom
		// event is.
		Summary: fmt.Sprintf("added timeline marker %q", args.Name),
	}, nil
}
