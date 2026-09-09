package mcp

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// coalesceWindow is how long an agent's repeated writes to the same subject
// fold into one timeline row. Long enough to collapse a burst of edits into
// "Claude edited Recon Notes — 14 changes", short enough that work an hour
// apart still reads as two separate visits.
const coalesceWindow = 60 * time.Second

// domainEchoWindow is how recently a row for the same subject must exist for
// this layer to treat the domain path as having already recorded the action.
const domainEchoWindow = 10 * time.Second

// domainEchoDelay is how long to wait before deciding the domain path is not
// going to write a row of its own.
//
// events.Logger persists its topics from a bus subscriber, on its own
// goroutine, so its row lands AFTER the tool call returns. Checking
// immediately therefore loses the race and writes a second row for the same
// action. Waiting first is what makes the check mean what it says.
//
// Deferring costs nothing that matters: the timeline is a historical
// narrative, not a live feed. The live feed is the activity rail, which is
// published synchronously, and the durable record of what the agent did is
// the audit row, also written synchronously.
const domainEchoDelay = 2 * time.Second

// recordOnTimeline puts an agent's write into the operator's timeline.
//
// Written here rather than by extending events.Logger.Topics() on purpose.
// That subscriber currently persists five topics, and widening it would change
// what HUMAN activity lands on the timeline as a side effect of adding agent
// support — a much larger behavioural change than this feature asked for. The
// custom-timeline-event resolver already establishes the pattern of writing a
// row inline and publishing TopicOperationEventLogged for the live path.
func (s *Server) recordOnTimeline(ctx context.Context, e auditEntry) {
	if e.kind != writeTool || e.err != nil || e.result.OperationID == nil {
		return
	}

	auth := gqlctx.AuthFromContext(ctx)
	agent := auth.Agent
	if agent == nil {
		return
	}
	ownerID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return
	}

	subjectID, subjectKind := e.result.subject()

	// No subject means no timeline row.
	//
	// Both of this layer's safeguards key on the subject: deduplicating
	// against the domain path, and coalescing repeated work. A subject-less
	// row gets neither, so it lands as a duplicate whenever the resolver
	// already recorded the action — which is exactly the case that produces
	// one, a bulk import, where the domain row is its own subject and there is
	// no shared id to match on.
	//
	// Failing by omission is the right way round here. The audit trail records
	// every call regardless, and the activity rail still shows it live; what
	// is lost is a timeline row for an action the timeline usually already
	// has. A duplicate, by contrast, tells the operator something happened
	// twice when it happened once.
	if subjectID == uuid.Nil {
		return
	}

	// Everything the write needs is captured here, because the work below runs
	// after this request's context is gone.
	row := &models.OperationEvent{
		EventID:     uuid.New(),
		OperationID: *e.result.OperationID,
		Topic:       "agent." + e.tool,
		SubjectKind: subjectKind,
		SubjectID:   subjectID,
		SubjectName: e.result.SubjectName,
		ActorType:   models.EventActorAgent,
		// The OWNER's id, so filtering the timeline by an operator still
		// surfaces what their agent did for them. ActorName says which agent.
		ActorID:   &ownerID,
		ActorName: agent.Name,
		Metadata:  map[string]any{"tool": e.tool, "count": 1},
	}
	agentCopy := *agent

	go s.writeTimelineRow(row, &agentCopy, ownerID)
}

// writeTimelineRow defers, deduplicates, coalesces, and writes.
//
// Detached from the request: the caller has already been answered, and the
// wait below outlives the HTTP handler by design.
func (s *Server) writeTimelineRow(row *models.OperationEvent, agent *gqlctx.AgentInfo, ownerID uuid.UUID) {
	defer func() {
		if r := recover(); r != nil {
			s.deps.Logger.Error("mcp: timeline attribution panicked", zap.Any("panic", r))
		}
	}()

	time.Sleep(domainEchoDelay)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	now := time.Now().UTC()
	row.OccurredAt = now

	// Did the normal domain path already record this action? Some tools act
	// through resolvers that publish an event events.Logger persists — a task
	// reaching DONE, a custom timeline marker. Those rows now carry agent
	// attribution of their own (see resolver.eventActor), so a row here would
	// show the operator the same action twice.
	exists, err := s.deps.OperationEventRepo.HasRecentEventForSubject(
		ctx, row.OperationID, row.SubjectID, now.Add(-domainEchoWindow))
	if err == nil && exists {
		return
	}

	// Fold repeated work on the same subject into one row rather than adding
	// another. An agent edits a page twenty times in a minute; a person does
	// not, and a row per edit would bury the human narrative.
	key := repository.AgentEventKey{
		OperationID: row.OperationID,
		ActorID:     ownerID,
		ActorName:   agent.Name,
		Topic:       row.Topic,
		SubjectID:   row.SubjectID,
	}
	if existing, err := s.deps.OperationEventRepo.FindRecentAgentEvent(ctx, key, now.Add(-coalesceWindow)); err == nil {
		if err := s.deps.OperationEventRepo.CoalesceAgentEvent(ctx, existing.EventID, now, 1); err != nil {
			s.deps.Logger.Error("mcp: failed to coalesce timeline row", zap.Error(err))
			return
		}
		s.publishLogged(agent, ownerID, existing.EventID, row.OperationID)
		return
	}

	if err := s.deps.OperationEventRepo.Insert(ctx, row); err != nil {
		s.deps.Logger.Error("mcp: failed to write timeline row", zap.Error(err))
		return
	}
	s.publishLogged(agent, ownerID, row.EventID, row.OperationID)
}

// publishLogged drives the live timeline subscription, the same way the
// custom-event resolver does.
func (s *Server) publishLogged(agent *gqlctx.AgentInfo, ownerID, eventID, operationID uuid.UUID) {
	if s.deps.Bus == nil {
		return
	}
	s.deps.Bus.Publish(eventbus.NewOperationEventLoggedEvent(
		eventbus.AgentActor(agent.AgentKeyID, agent.Name, ownerID.String()),
		eventbus.OperationEventLoggedPayload{
			EventID:     eventID.String(),
			OperationID: operationID.String(),
		},
	))
}

// subject resolves what a write acted on. uuid.Nil means the tool did not act
// on one identifiable thing — see recordOnTimeline for why that skips the row.
func (r toolResult) subject() (uuid.UUID, models.SubjectKind) {
	return r.SubjectID, r.SubjectKind
}
