package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
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

// FocusTTL bounds how long a beacon stays current. Comfortably longer than the
// SPA's heartbeat so an ordinary gap does not read as "gone", short enough
// that a closed tab stops looking present within about a minute and a half.
const FocusTTL = 90 * time.Second

func focusCacheKey(userID string) string { return "focus:" + userID }

// PublishFocus records where a user currently is. Called by the SPA through
// the GraphQL mutation, once per meaningful navigation.
func PublishFocus(ctx context.Context, c cache.Cache, userID string, f Focus) error {
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
	return c.Set(ctx, focusCacheKey(userID), string(payload), FocusTTL)
}

// ReadFocus returns a user's current focus, or ok=false when they have not
// published one recently — which is the normal "not at their desk" state, not
// an error.
func ReadFocus(ctx context.Context, c cache.Cache, userID string) (Focus, bool) {
	if c == nil || !c.IsEnabled() {
		return Focus{}, false
	}
	raw, err := c.Get(ctx, focusCacheKey(userID))
	if err != nil || raw == "" {
		return Focus{}, false
	}
	var f Focus
	if err := json.Unmarshal([]byte(raw), &f); err != nil {
		return Focus{}, false
	}
	return f, true
}

// focusOperation reports the operation the key's OWNER is currently looking
// at. Only ever the owner's own focus: an agent follows the person who
// delegated to it, not whoever else happens to be online.
func (s *Server) focusOperation(ctx context.Context) (uuid.UUID, bool) {
	auth := gqlctx.AuthFromContext(ctx)
	if auth.UserID == "" {
		return uuid.Nil, false
	}
	f, ok := ReadFocus(ctx, s.deps.Cache, auth.UserID)
	if !ok || f.OperationID == "" {
		return uuid.Nil, false
	}
	opID, err := uuid.Parse(f.OperationID)
	if err != nil {
		return uuid.Nil, false
	}
	return opID, true
}
