package mcp

import (
	"context"
	"time"

	"go.uber.org/zap"
)

// idempotencyTTL is how long a completed write can be replayed. A day covers
// any realistic retry — a network blip, a resumed conversation, a client that
// reconnects and re-sends — without keeping results around indefinitely.
const idempotencyTTL = 24 * time.Hour

// idempotent is implemented by write-tool argument structs that accept a
// caller-supplied key.
//
// Agents retry. Without this, one flaky connection turns into two tasks, two
// wiki pages, or two credential comments, and the operator has to work out
// which duplicate to delete. An interface rather than reflection so a write
// tool that forgets to offer a key is visible in the type, not at runtime.
type idempotent interface {
	idempotencyKey() string
}

// IdempotencyKey is embedded by write-tool argument structs. Embedding rather
// than repeating the field keeps the JSON name and the description identical
// across every tool that offers it.
type IdempotencyKey struct {
	Key string `json:"idempotency_key,omitempty" jsonschema:"Optional. Pass any unique string to make this call safe to retry: repeating it returns the original result instead of performing the action twice."`
}

func (k IdempotencyKey) idempotencyKey() string { return k.Key }

// idempotencyCacheKey namespaces by agent key as well as tool, so two agents
// that happen to choose the same key do not read each other's results.
func idempotencyCacheKey(agentKeyID, tool, key string) string {
	return "mcp:idem:" + agentKeyID + ":" + tool + ":" + key
}

// replay returns a previously recorded result for this key, if there is one.
func (s *Server) replay(ctx context.Context, agentKeyID, tool, key string) (string, bool) {
	if key == "" || s.deps.Cache == nil || !s.deps.Cache.IsEnabled() {
		return "", false
	}
	stored, err := s.deps.Cache.Get(ctx, idempotencyCacheKey(agentKeyID, tool, key))
	if err != nil || stored == "" {
		return "", false
	}
	return stored, true
}

// remember records a successful result so a retry can replay it.
//
// Best-effort: failing to record costs a duplicate on retry, which is bad, but
// failing the write the agent just made successfully would be worse.
func (s *Server) remember(ctx context.Context, agentKeyID, tool, key, encoded string) {
	if key == "" || s.deps.Cache == nil || !s.deps.Cache.IsEnabled() {
		return
	}
	if err := s.deps.Cache.Set(ctx, idempotencyCacheKey(agentKeyID, tool, key), encoded, idempotencyTTL); err != nil {
		s.deps.Logger.Warn("mcp: failed to record idempotency result",
			zap.String("tool", tool), zap.Error(err))
	}
}
