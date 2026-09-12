package mcp

import (
	"context"
	"fmt"
	"time"

	"go.uber.org/zap"
)

// Rate limiting for agent keys.
//
// A human clicking through a UI is self-limiting; an agent is not. A retry
// loop or a confused plan can drive these tools as fast as the network allows,
// which floods the activity rail and grows agent_actions without bound.
// Nothing else in this service throttles anything, so this is the only guard.
//
// A fixed window rather than a sliding one or a token bucket: it costs one
// Redis round trip, it is trivially auditable, and the worst case — a caller
// straddling a window boundary and briefly getting up to twice the limit — is
// irrelevant at these magnitudes. Precision here would buy nothing.
const (
	// rateWindow is the accounting period for both limits.
	rateWindow = time.Minute

	// defaultCallsPerWindow is generous on purpose. It is there to stop a
	// runaway, not to pace legitimate work: an agent orienting itself in a
	// large operation genuinely makes a lot of calls in a minute, and a limit
	// that interrupts real work would just teach operators to raise it.
	defaultCallsPerWindow = 120

	// defaultWritesPerWindow is much tighter. Writes are what an operator has
	// to live with afterwards, and no honest agent workflow needs to change
	// thirty things a minute.
	defaultWritesPerWindow = 30
)

// rateLimits holds the configured ceilings. Zero or negative disables that
// limit, which is what makes the feature switchable off without a code path
// that pretends to count.
type rateLimits struct {
	calls  int
	writes int
}

func (l rateLimits) callsPerWindow() int {
	if l.calls == 0 {
		return defaultCallsPerWindow
	}
	return l.calls
}

func (l rateLimits) writesPerWindow() int {
	if l.writes == 0 {
		return defaultWritesPerWindow
	}
	return l.writes
}

// rateLimitError is phrased for the model, not for a log. An agent that reads
// "wait 34 seconds" can wait; one that reads "429" will usually retry
// immediately and make it worse.
func rateLimitError(kind string, limit int, retryIn time.Duration) error {
	return refuse(
		"rate limit reached: this agent key is allowed %d %s per minute. Wait about %d seconds and continue — do not retry immediately",
		limit, kind, int(retryIn.Seconds())+1)
}

// checkRateLimit counts this call and refuses when either ceiling is passed.
//
// Counts per agent key, not per user: two keys owned by the same operator are
// separate agents doing separate work, and one running hot should not stall
// the other.
func (s *Server) checkRateLimit(ctx context.Context, kind toolKind) error {
	agent, err := agentFromContext(ctx)
	if err != nil {
		return err
	}
	if s.deps.Cache == nil || !s.deps.Cache.IsEnabled() {
		// Fail open. Refusing every call because the counter is unreachable
		// would turn a Redis outage into a total agent outage, which is a
		// worse failure than an unthrottled agent for the duration.
		return nil
	}

	window := time.Now().UTC().Truncate(rateWindow)

	if err := s.bump(ctx, "calls", "tool calls", agent.AgentKeyID, window, s.limits.callsPerWindow()); err != nil {
		return err
	}
	if kind != writeTool {
		return nil
	}
	return s.bump(ctx, "writes", "writes", agent.AgentKeyID, window, s.limits.writesPerWindow())
}

// bump counts one event in the named window and refuses once it passes limit.
// A counter that cannot be reached allows the call, for the reason given in
// checkRateLimit.
func (s *Server) bump(ctx context.Context, counter, label, agentKeyID string, window time.Time, limit int) error {
	if limit <= 0 {
		return nil
	}
	key := fmt.Sprintf("mcp:rl:%s:%s:%d", counter, agentKeyID, window.Unix())
	n, err := s.deps.Cache.IncrWithTTL(ctx, key, rateWindow)
	if err != nil {
		s.deps.Logger.Warn("mcp: rate limit counter failed, allowing the call",
			zap.String("counter", counter), zap.Error(err))
		return nil
	}
	if n > int64(limit) {
		return rateLimitError(label, limit, window.Add(rateWindow).Sub(time.Now().UTC()))
	}
	return nil
}
