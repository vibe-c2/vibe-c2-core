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
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation id; omit for the operator's current one."`
	Date        string `json:"date,omitempty"         jsonschema:"Any RFC3339 time inside the day to read; default today."`
	Timezone    string `json:"timezone,omitempty"     jsonschema:"IANA zone for day boundaries; default UTC."`
	Limit       int    `json:"limit,omitempty"        jsonschema:"Page size, max 50."`
}

type createTimelineEventArgs struct {
	IdempotencyKey
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation id; omit for the operator's current one."`
	Name        string `json:"name"                   jsonschema:"Short label."`
	Description string `json:"description,omitempty"  jsonschema:"Detail."`
	OccurredAt  string `json:"occurred_at,omitempty"  jsonschema:"RFC3339; default now."`
	visualIdentity
}

func registerTimelineTools(s *Server) {
	register(s, &mcp.Tool{
		Name:        "get_timeline",
		Description: "The operation's milestones for one day, and who did them.",
	}, readTool, handleGetTimeline)

	register(s, &mcp.Tool{
		Name: "create_timeline_event",
		Description: "Add a milestone to the timeline: a host owned, a domain controller " +
			"taken, a login form patched, a foothold lost. Use it for anything the operator " +
			"would want on the engagement's history that no other tool records.",
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

	// ActorLabels, not Actor. Actor resolves only for human rows, so an
	// agent's own work came back unattributed — the agent could not even see
	// what it had just done. Labels render every kind: a username, "Claude
	// (via alice)", or a service name — and for the whole page in one user
	// lookup rather than one per event.
	events := make([]*models.OperationEvent, 0, len(conn.Edges))
	for _, edge := range conn.Edges {
		events = append(events, edge.Node)
	}
	labels := s.deps.Timeline.ActorLabels(ctx, events)

	views := make([]timelineEventView, 0, len(events))
	for i, event := range events {
		views = append(views, toTimelineEventView(event, labels[i]))
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
