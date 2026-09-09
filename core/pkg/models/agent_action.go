package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// AgentActionOutcome records how a tool call ended.
type AgentActionOutcome string

const (
	AgentActionOK      AgentActionOutcome = "ok"
	AgentActionError   AgentActionOutcome = "error"
	AgentActionRefused AgentActionOutcome = "refused" // failed a scope, role or write check
)

// AgentAction is one MCP tool call: what the agent did, on whose behalf, to
// which operation, and how it went.
//
// This is a complete trace, reads included, and that is the point. Domain
// events record what changed; only this records what the agent LOOKED at.
// "The user can see everything the agent does" is not satisfiable from the
// timeline alone, because reading a whole operation's credentials changes
// nothing and would leave no trace at all.
//
// Kept separate from operation_events for the same reason: the timeline is a
// shared, human-scale narrative of an engagement, and flooding it with every
// read would destroy it. Writes are additionally published there; everything
// lands here.
type AgentAction struct {
	field.DefaultField `bson:",inline"`

	ActionID uuid.UUID `bson:"action_id" json:"action_id"`

	AgentKeyID uuid.UUID `bson:"agent_key_id" json:"agent_key_id"`
	// AgentName is captured at call time so the row still reads correctly
	// after the key is renamed or deleted.
	AgentName   string    `bson:"agent_name"    json:"agent_name"`
	OwnerUserID uuid.UUID `bson:"owner_user_id" json:"owner_user_id"`

	// OperationID is nil for calls that are not operation-scoped, such as
	// list_operations or a refusal that never resolved one.
	OperationID *uuid.UUID `bson:"operation_id,omitempty" json:"operation_id,omitempty"`

	Tool string `bson:"tool" json:"tool"`
	// Write distinguishes the calls that changed something, so the common
	// "show me what it altered" query does not have to know the tool names.
	Write bool `bson:"write" json:"write"`

	// Arguments is the JSON-encoded tool input, truncated to
	// MaxAuditArgumentBytes. Enough to reconstruct intent without letting one
	// call write an unbounded document.
	Arguments string `bson:"arguments,omitempty" json:"arguments,omitempty"`

	Outcome    AgentActionOutcome `bson:"outcome"          json:"outcome"`
	Error      string             `bson:"error,omitempty"  json:"error,omitempty"`
	DurationMs int64              `bson:"duration_ms"      json:"duration_ms"`
	OccurredAt time.Time          `bson:"occurred_at"      json:"occurred_at"`
}

// MaxAuditArgumentBytes bounds the recorded argument blob.
const MaxAuditArgumentBytes = 4096
