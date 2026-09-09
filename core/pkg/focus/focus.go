// Package focus holds the attention channel: what the operator is currently
// looking at.
//
// It sits in its own package because both ends need it and neither can import
// the other — the GraphQL resolvers write it as the operator navigates, and
// package mcp reads it so an agent can follow along.
package focus

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
)

// Focus is what the operator is looking at right now: which operation is
// scoped, which page they are on, which record is selected.
//
// This is the attention channel — the thing that separates an agent with an
// API from one working alongside someone. It lets the agent answer "which
// operation?" without being told, and lets it say "I see you're on the
// topology users lens" instead of asking.
//
// Deliberately ephemeral: it lives in Redis under a short TTL and is never
// persisted. When the operator closes the tab the key expires and the agent
// correctly sees nobody there, rather than a stale location it would treat as
// current. Losing it costs nothing.
type Focus struct {
	Route       string `json:"route,omitempty"`
	OperationID string `json:"operationId,omitempty"`
	// The wiki can target the synthetic Public operation independently of the
	// scoped one, so it is reported separately rather than folded in.
	WikiOperationID       string `json:"wikiOperationId,omitempty"`
	WikiDocumentID        string `json:"wikiDocumentId,omitempty"`
	HostID                string `json:"hostId,omitempty"`
	CredentialID          string `json:"credentialId,omitempty"`
	HashID                string `json:"hashId,omitempty"`
	TaskID                string `json:"taskId,omitempty"`
	FindingsTab           string `json:"findingsTab,omitempty"`
	TopologyLens          string `json:"topologyLens,omitempty"`
	TopologyFocusedNodeID string `json:"topologyFocusedNodeId,omitempty"`
	TopologyFocusedEdgeID string `json:"topologyFocusedEdgeId,omitempty"`
	SearchSummary         string `json:"searchSummary,omitempty"`
	UpdatedAt             string `json:"updatedAt,omitempty"`
}

// TTL bounds how long a beacon stays current. Comfortably longer than the
// SPA's heartbeat so an ordinary gap does not read as "gone", short enough
// that a closed tab stops looking present within about a minute and a half.
const TTL = 90 * time.Second

func cacheKey(userID string) string { return "focus:" + userID }

// Publish records where a user currently is. Called by the SPA through
// the GraphQL mutation, once per meaningful navigation.
func Publish(ctx context.Context, c cache.Cache, userID string, f Focus) error {
	if c == nil || !c.IsEnabled() {
		// Without Redis there is no attention channel. That degrades the
		// agent's awareness; it does not break anything, so it is not an
		// error the operator needs to see on every navigation.
		return nil
	}
	f.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	payload, err := json.Marshal(f)
	if err != nil {
		return fmt.Errorf("failed to encode focus: %w", err)
	}
	return c.Set(ctx, cacheKey(userID), string(payload), TTL)
}

// Read returns a user's current focus, or ok=false when they have not
// published one recently — which is the normal "not at their desk" state, not
// an error.
func Read(ctx context.Context, c cache.Cache, userID string) (Focus, bool) {
	if c == nil || !c.IsEnabled() {
		return Focus{}, false
	}
	raw, err := c.Get(ctx, cacheKey(userID))
	if err != nil || raw == "" {
		return Focus{}, false
	}
	var f Focus
	if err := json.Unmarshal([]byte(raw), &f); err != nil {
		return Focus{}, false
	}
	return f, true
}
