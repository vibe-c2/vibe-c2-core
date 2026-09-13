package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.uber.org/zap"
)

// toolKind separates the tools that change something from the ones that only
// look. It drives the write gate, the audit row, and whether the call earns a
// place on the operator's timeline.
type toolKind int

const (
	readTool toolKind = iota
	writeTool
)

// toolResult is what a tool handler returns: the payload to encode, plus the
// operation it touched so the dispatcher can attribute the call without every
// handler having to remember to report it.
type toolResult struct {
	Payload any
	// OperationID is the operation acted on, if any. Left nil by tools that
	// are not operation-scoped.
	OperationID *uuid.UUID
	// Summary is one human-readable line for the activity rail and the
	// timeline: "read 24 hosts", "appended to Recon Notes".
	Summary string

	// Content overrides the default JSON encoding of Payload. Set it only when
	// a tool returns something that is not data — an image, chiefly, where
	// base64 inside a JSON string would be an image the model cannot look at.
	Content []mcp.Content
}

// handlerFunc is the shape every tool in this package implements. Args are
// already decoded and schema-validated by the SDK.
type handlerFunc[A any] func(ctx context.Context, s *Server, args A) (toolResult, error)

// register wires one tool onto the MCP server, wrapped in the dispatcher.
//
// Everything that must happen for EVERY tool lives here rather than in the
// handlers: the write gate, the audit row, the live publish, panic recovery,
// and error shaping. A handler that forgets one of these cannot exist, because
// no handler is reachable except through this wrapper.
func register[A any](s *Server, tool *mcp.Tool, kind toolKind, fn handlerFunc[A]) {
	// Record it so the generated skill is assembled from what is actually
	// registered. A hand-maintained list would be stale the moment somebody
	// adds a tool, which is exactly what happened ten times in one day.
	s.tools = append(s.tools, toolDoc{
		Name:        tool.Name,
		Description: tool.Description,
		Write:       kind == writeTool,
	})

	mcp.AddTool(s.server, tool, func(ctx context.Context, req *mcp.CallToolRequest, args A) (*mcp.CallToolResult, any, error) {
		started := time.Now()

		// Replay a completed write rather than repeating it. Checked before
		// the handler runs, so a retry costs nothing and changes nothing.
		idemKey := ""
		if keyed, ok := any(args).(idempotent); ok {
			idemKey = keyed.idempotencyKey()
		}
		agentKeyID := agentKeyIDFromContext(ctx)
		if cached, hit := s.replay(ctx, agentKeyID, tool.Name, idemKey); hit {
			return &mcp.CallToolResult{
				Content: []mcp.Content{&mcp.TextContent{Text: cached}},
			}, nil, nil
		}

		result, err := invoke(ctx, s, tool.Name, kind, args, fn)

		entry := auditEntry{
			tool:     tool.Name,
			kind:     kind,
			args:     args,
			result:   result,
			err:      err,
			duration: time.Since(started),
		}
		s.record(ctx, entry)

		if err != nil {
			// Tool errors are returned to the model as content, not as
			// protocol errors: the agent is supposed to read them and adjust.
			// A protocol error would abort the turn instead.
			return &mcp.CallToolResult{
				IsError: true,
				Content: []mcp.Content{&mcp.TextContent{Text: err.Error()}},
			}, nil, nil
		}

		if len(result.Content) > 0 {
			// Deliberately not remembered for idempotency: the cache stores an
			// encoded string, and these results are not that. Replaying a read
			// costs nothing anyway — the guarantee that matters is for writes.
			return &mcp.CallToolResult{Content: result.Content}, nil, nil
		}

		encoded, encErr := encodeResult(result.Payload)
		if encErr != nil {
			return &mcp.CallToolResult{
				IsError: true,
				Content: []mcp.Content{&mcp.TextContent{Text: "failed to encode result: " + encErr.Error()}},
			}, nil, nil
		}

		s.remember(ctx, agentKeyID, tool.Name, idemKey, string(encoded))

		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: string(encoded)}},
		}, nil, nil
	})
}

// invoke runs the gate and the handler, converting a panic into an error so a
// bug in one tool cannot take down the process an operator is depending on.
//
// A free function rather than a method because Go methods cannot take type
// parameters.
func invoke[A any](
	ctx context.Context, s *Server, name string, kind toolKind, args A, fn handlerFunc[A],
) (result toolResult, err error) {
	defer func() {
		if r := recover(); r != nil {
			s.deps.Logger.Error("mcp: tool panicked",
				zap.String("tool", name), zap.Any("panic", r))
			err = fmt.Errorf("internal error in %s", name)
		}
	}()

	// Order matters: the throttle runs first so a runaway agent is stopped
	// before it can do any work, and a read-only key hammering write tools is
	// still counted rather than being refused for free.
	if limitErr := s.checkRateLimit(ctx, kind); limitErr != nil {
		return toolResult{}, limitErr
	}

	if kind == writeTool {
		if gateErr := requireWrites(ctx); gateErr != nil {
			return toolResult{}, gateErr
		}
	}

	return fn(ctx, s, args)
}

type auditEntry struct {
	tool     string
	kind     toolKind
	args     any
	result   toolResult
	err      error
	duration time.Duration
}

// record builds the audit row and hands it to the audit worker.
//
// The row and the live event are written off the request path. They were
// synchronous before, which put a Mongo insert and a bus publish between the
// handler finishing and the agent seeing its result — on every call, reads
// included. Both are best-effort by design (a failed audit write must not
// fail the tool), so nothing about the tool's outcome depends on them and
// there is no reason for the agent to wait.
//
// The action is assembled here, on the request, because it reads the auth
// context and the request's clock; only the I/O is deferred.
func (s *Server) record(ctx context.Context, e auditEntry) {
	auth := gqlctx.AuthFromContext(ctx)
	agent := auth.Agent
	if agent == nil {
		return
	}

	outcome := models.AgentActionOK
	errText := ""
	if e.err != nil {
		outcome = models.AgentActionError
		errText = e.err.Error()
		if isRefusal(e.err) {
			outcome = models.AgentActionRefused
		}
	}

	action := &models.AgentAction{
		ActionID:    uuid.New(),
		AgentName:   agent.Name,
		OperationID: e.result.OperationID,
		Tool:        e.tool,
		Write:       e.kind == writeTool,
		Arguments:   encodeArgs(e.args),
		Outcome:     outcome,
		Error:       errText,
		DurationMs:  e.duration.Milliseconds(),
		OccurredAt:  time.Now().UTC(),
	}
	if keyID, parseErr := uuid.Parse(agent.AgentKeyID); parseErr == nil {
		action.AgentKeyID = keyID
	}
	if ownerID, parseErr := uuid.Parse(auth.UserID); parseErr == nil {
		action.OwnerUserID = ownerID
	}

	s.enqueueAudit(auditJob{
		action:        action,
		agent:         agent,
		ownerUsername: auth.Username,
		summary:       e.result.Summary,
	})
}

// auditJob is one recorded call, waiting for the worker.
type auditJob struct {
	action        *models.AgentAction
	agent         *gqlctx.AgentInfo
	ownerUsername string
	summary       string
}

// auditQueueSize bounds how many recorded calls can wait for the worker. At
// the rate limit's ceiling of 120 calls a minute per key this is minutes of
// backlog, so it only fills when Mongo is unreachable — and then dropping
// audit rows with a loud log beats stalling every agent.
const auditQueueSize = 1024

// auditWriteTimeout bounds one insert. The request context is gone by the
// time the worker runs, so the worker uses its own.
const auditWriteTimeout = 5 * time.Second

// enqueueAudit hands a job to the worker, or drops it when the queue is full.
func (s *Server) enqueueAudit(job auditJob) {
	select {
	case s.audit <- job:
	default:
		s.deps.Logger.Error("mcp: audit queue full, dropping agent action",
			zap.String("tool", job.action.Tool))
	}
}

// runAuditWorker drains the queue until Close.
func (s *Server) runAuditWorker() {
	defer s.auditDone.Done()
	for job := range s.audit {
		s.writeAudit(job)
	}
}

// writeAudit is the I/O that record used to do inline.
func (s *Server) writeAudit(job auditJob) {
	if s.deps.AgentActionRepo != nil {
		ctx, cancel := context.WithTimeout(context.Background(), auditWriteTimeout)
		if err := s.deps.AgentActionRepo.Insert(ctx, job.action); err != nil {
			s.deps.Logger.Error("mcp: failed to record agent action",
				zap.String("tool", job.action.Tool), zap.Error(err))
		}
		cancel()
	}
	s.publishActivity(job.action, job.agent, job.ownerUsername, job.summary)
}

// Close stops accepting audit jobs and waits for the queued ones to be
// written. Call it during shutdown, after the HTTP server has stopped taking
// requests and before the database closes.
func (s *Server) Close() {
	s.closeOnce.Do(func() {
		close(s.audit)
		s.auditDone.Wait()
	})
}

// publishActivity pushes the call to the SPA's activity rail. Reads are
// published too — "Claude is reading hosts…" is most of what makes the agent
// feel present rather than occasionally surprising.
func (s *Server) publishActivity(action *models.AgentAction, agent *gqlctx.AgentInfo, ownerUsername, summary string) {
	if s.deps.Bus == nil {
		return
	}
	payload := eventbus.AgentActionPayload{
		AgentKeyID:  agent.AgentKeyID,
		AgentName:   agent.Name,
		AgentLabel:  agent.Label(ownerUsername),
		OwnerUserID: action.OwnerUserID.String(),
		Tool:        action.Tool,
		Write:       action.Write,
		Outcome:     string(action.Outcome),
		Summary:     summary,
	}
	if action.OperationID != nil {
		payload.OperationID = action.OperationID.String()
	}
	s.deps.Bus.Publish(eventbus.NewAgentActionEvent(
		eventbus.AgentActor(agent.AgentKeyID, agent.Name, action.OwnerUserID.String()),
		payload,
	))
}

// encodeArgs renders the tool input for the audit row, bounded so one call
// cannot write an unbounded document.
func encodeArgs(args any) string {
	encoded, err := json.Marshal(args)
	if err != nil {
		return ""
	}
	if len(encoded) > models.MaxAuditArgumentBytes {
		return string(encoded[:models.MaxAuditArgumentBytes]) + "…(truncated)"
	}
	return string(encoded)
}
