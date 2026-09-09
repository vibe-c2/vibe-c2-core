package mcp

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

func agentCtx(agent *gqlctx.AgentInfo) context.Context {
	return gqlctx.WithAuthInfo(context.Background(), gqlctx.AuthInfo{
		UserID: uuid.New().String(),
		Roles:  []string{"user"},
		Agent:  agent,
	})
}

// requireWrites is the second, independent gate on top of the role cap: an
// operator-capable key can still be read-only, and turning writes off must
// hold even where the role would permit them.
func TestRequireWrites(t *testing.T) {
	t.Run("refused when the key is read-only", func(t *testing.T) {
		ctx := agentCtx(&gqlctx.AgentInfo{MaxRole: models.OperationRoleOperator, AllowWrites: false})
		err := requireWrites(ctx)
		if err == nil {
			t.Fatal("a read-only key was allowed to write")
		}
		if !strings.Contains(err.Error(), "read-only") {
			t.Fatalf("error should say why: %v", err)
		}
	})

	t.Run("allowed when the key permits writes", func(t *testing.T) {
		ctx := agentCtx(&gqlctx.AgentInfo{MaxRole: models.OperationRoleOperator, AllowWrites: true})
		if err := requireWrites(ctx); err != nil {
			t.Fatalf("a write-enabled key was refused: %v", err)
		}
	})

	t.Run("refused when there is no agent at all", func(t *testing.T) {
		ctx := gqlctx.WithAuthInfo(context.Background(), gqlctx.AuthInfo{UserID: uuid.New().String()})
		if err := requireWrites(ctx); err == nil {
			t.Fatal("a caller with no agent identity was allowed to write")
		}
	})
}

// resolveOperation decides which engagement a tool acts on. Getting it wrong
// writes to the wrong one, so guessing is not acceptable — when it cannot tell,
// it must say so.
func TestResolveOperation(t *testing.T) {
	// No cache, so the focus beacon never resolves and the fallback rules are
	// what is under test here.
	s := &Server{deps: Deps{}}
	scopeA, scopeB := uuid.New(), uuid.New()

	t.Run("an explicit id wins", func(t *testing.T) {
		explicit := uuid.New()
		ctx := agentCtx(&gqlctx.AgentInfo{OperationScopes: []uuid.UUID{scopeA}})

		got, err := s.resolveOperation(ctx, explicit.String())
		if err != nil {
			t.Fatalf("resolveOperation: %v", err)
		}
		if got != explicit {
			t.Fatalf("got %s, want the explicit %s", got, explicit)
		}
	})

	t.Run("a malformed explicit id is rejected, not ignored", func(t *testing.T) {
		ctx := agentCtx(&gqlctx.AgentInfo{OperationScopes: []uuid.UUID{scopeA}})
		if _, err := s.resolveOperation(ctx, "not-a-uuid"); err == nil {
			t.Fatal("a malformed operation_id silently fell back to the key's scope")
		}
	})

	t.Run("a single-scope key needs no argument", func(t *testing.T) {
		ctx := agentCtx(&gqlctx.AgentInfo{OperationScopes: []uuid.UUID{scopeA}})

		got, err := s.resolveOperation(ctx, "")
		if err != nil {
			t.Fatalf("resolveOperation: %v", err)
		}
		if got != scopeA {
			t.Fatalf("got %s, want the sole scope %s", got, scopeA)
		}
	})

	t.Run("a multi-scope key must be told which", func(t *testing.T) {
		ctx := agentCtx(&gqlctx.AgentInfo{OperationScopes: []uuid.UUID{scopeA, scopeB}})

		_, err := s.resolveOperation(ctx, "")
		if err == nil {
			t.Fatal("picked an operation arbitrarily from an ambiguous scope list")
		}
		if !strings.Contains(err.Error(), "operation_id") {
			t.Fatalf("error should tell the agent what to do: %v", err)
		}
	})

	t.Run("an unscoped key must be told which", func(t *testing.T) {
		ctx := agentCtx(&gqlctx.AgentInfo{})

		_, err := s.resolveOperation(ctx, "")
		if err == nil {
			t.Fatal("resolved an operation for a key scoped to all of them")
		}
		if !strings.Contains(err.Error(), "list_operations") {
			t.Fatalf("error should point at the tool that helps: %v", err)
		}
	})
}

// The audit trail distinguishes "you may not" from "something broke", so a
// reviewer can ask what an agent was stopped from doing separately from what
// failed. The classification is typed rather than matched on message text —
// an earlier version compared against a list of phrases and misfiled every
// refusal whose wording nobody had thought to add.
func TestIsRefusal(t *testing.T) {
	t.Run("this package's own gates are refusals", func(t *testing.T) {
		for _, err := range []error{
			refuse("this agent key is read-only; ask the operator to enable writes on it"),
			refuse("rate limit reached: allowed 120 tool calls per minute"),
			// Wording nobody anticipated is still classified correctly,
			// because the type carries the meaning, not the string.
			refuse("some future policy nobody has written yet"),
		} {
			if !isRefusal(err) {
				t.Errorf("not classified as a refusal: %q", err)
			}
		}
	})

	t.Run("authorization denials are refusals", func(t *testing.T) {
		// package authorization prefixes every denial this way, on every path.
		for _, msg := range []string{
			"forbidden: requires at least 'operator' role in this operation",
			"forbidden: agent key is not scoped to this operation",
			"forbidden: agent owner is not a member of this operation",
		} {
			if !isRefusal(errString(msg)) {
				t.Errorf("not classified as a refusal: %q", msg)
			}
		}
	})

	t.Run("wrapping preserves the classification", func(t *testing.T) {
		wrapped := fmt.Errorf("failed to save the page: %w",
			refuse("this agent key is read-only"))
		if !isRefusal(wrapped) {
			t.Fatal("a wrapped refusal was classified as an error")
		}
	})

	t.Run("faults and bad input are not refusals", func(t *testing.T) {
		for _, msg := range []string{
			"failed to search hosts: connection reset",
			"host not found",
			`status "BANANA" is not one of NOT_PROCESSED, QUEUED, CRACKING, CRACKED, FAILED`,
		} {
			if isRefusal(errString(msg)) {
				t.Errorf("classified as a refusal: %q", msg)
			}
		}
	})
}

type errString string

func (e errString) Error() string { return string(e) }
