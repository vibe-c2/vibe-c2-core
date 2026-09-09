package mcp

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.uber.org/zap"
)

func limitedServer(calls, writes int) (*Server, *memCache) {
	c := newMemCache()
	return &Server{
		deps:   Deps{Cache: c, Logger: zap.NewNop()},
		limits: rateLimits{calls: calls, writes: writes},
	}, c
}

func agentCtxNamed(keyID string) context.Context {
	return gqlctx.WithAuthInfo(context.Background(), gqlctx.AuthInfo{
		UserID: uuid.New().String(),
		Agent: &gqlctx.AgentInfo{
			AgentKeyID:  keyID,
			MaxRole:     models.OperationRoleOperator,
			AllowWrites: true,
		},
	})
}

func TestRateLimit_RefusesPastTheCeiling(t *testing.T) {
	s, _ := limitedServer(3, 100)
	ctx := agentCtxNamed("key-a")

	for i := 1; i <= 3; i++ {
		if err := s.checkRateLimit(ctx, readTool); err != nil {
			t.Fatalf("call %d was refused inside the limit: %v", i, err)
		}
	}

	err := s.checkRateLimit(ctx, readTool)
	if err == nil {
		t.Fatal("the call past the ceiling was allowed")
	}
	// The message has to tell the agent to wait, or it retries immediately and
	// makes the situation worse.
	if !strings.Contains(err.Error(), "rate limit") || !strings.Contains(err.Error(), "seconds") {
		t.Fatalf("refusal does not tell the agent how to back off: %v", err)
	}
}

// Writes are counted against both ceilings, and the tighter one binds.
func TestRateLimit_WritesHaveTheirOwnCeiling(t *testing.T) {
	s, _ := limitedServer(100, 2)
	ctx := agentCtxNamed("key-b")

	for i := 1; i <= 2; i++ {
		if err := s.checkRateLimit(ctx, writeTool); err != nil {
			t.Fatalf("write %d was refused inside the limit: %v", i, err)
		}
	}
	if err := s.checkRateLimit(ctx, writeTool); err == nil {
		t.Fatal("the write past the write ceiling was allowed")
	}
	// Reads are unaffected: the call ceiling is nowhere near.
	if err := s.checkRateLimit(ctx, readTool); err != nil {
		t.Fatalf("a read was refused by the WRITE ceiling: %v", err)
	}
}

// Counted per key, not per user: one agent running hot must not stall another
// the same operator is using for different work.
func TestRateLimit_IsPerAgentKey(t *testing.T) {
	s, _ := limitedServer(2, 100)

	busy := agentCtxNamed("key-busy")
	for i := 0; i < 3; i++ {
		_ = s.checkRateLimit(busy, readTool)
	}
	if err := s.checkRateLimit(busy, readTool); err == nil {
		t.Fatal("the busy key was not limited")
	}

	if err := s.checkRateLimit(agentCtxNamed("key-quiet"), readTool); err != nil {
		t.Fatalf("a different key was stalled by the busy one: %v", err)
	}
}

// A refusal must be classified as a refusal, not a failure, so reviewing what
// an agent was stopped from doing stays separable from things that broke.
func TestRateLimit_ClassifiedAsRefusal(t *testing.T) {
	s, _ := limitedServer(1, 100)
	ctx := agentCtxNamed("key-c")
	_ = s.checkRateLimit(ctx, readTool)

	err := s.checkRateLimit(ctx, readTool)
	if err == nil {
		t.Fatal("expected a refusal")
	}
	if !isRefusal(err) {
		t.Fatalf("rate-limit refusal was classified as an error: %v", err)
	}
}

// Without Redis there is no shared counter. Refusing everything would turn a
// cache outage into a total agent outage, which is the worse failure.
func TestRateLimit_FailsOpenWithoutCache(t *testing.T) {
	s := &Server{deps: Deps{Logger: zap.NewNop()}, limits: rateLimits{calls: 1, writes: 1}}
	ctx := agentCtxNamed("key-d")

	for i := 0; i < 10; i++ {
		if err := s.checkRateLimit(ctx, writeTool); err != nil {
			t.Fatalf("call %d refused with no cache configured: %v", i, err)
		}
	}
}

// A negative limit switches that ceiling off entirely, rather than counting to
// a number that can never be reached.
func TestRateLimit_NegativeDisables(t *testing.T) {
	s, _ := limitedServer(-1, -1)
	ctx := agentCtxNamed("key-e")

	for i := 0; i < 50; i++ {
		if err := s.checkRateLimit(ctx, writeTool); err != nil {
			t.Fatalf("call %d refused with limits disabled: %v", i, err)
		}
	}
}

func TestRateLimits_Defaults(t *testing.T) {
	var zero rateLimits
	if got := zero.callsPerWindow(); got != defaultCallsPerWindow {
		t.Fatalf("calls default = %d, want %d", got, defaultCallsPerWindow)
	}
	if got := zero.writesPerWindow(); got != defaultWritesPerWindow {
		t.Fatalf("writes default = %d, want %d", got, defaultWritesPerWindow)
	}
	// Writes must be the tighter of the two — they are what an operator has to
	// live with afterwards.
	if defaultWritesPerWindow >= defaultCallsPerWindow {
		t.Fatal("the write ceiling should be tighter than the overall call ceiling")
	}
}
