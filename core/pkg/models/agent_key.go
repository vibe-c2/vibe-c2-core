package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// AgentKey is a delegated credential minted by a user for an AI agent to reach
// the MCP endpoint. It is deliberately a separate principal from APIKey rather
// than a flag on it:
//
//   - Attribution. Timeline rows and the activity rail must be able to say
//     "Claude (via eugen)", which is impossible if the agent authenticates as
//     the user.
//   - Revocation. Disabling the agent must not disable the user's own scripts.
//   - Scope. An agent key can only ever narrow the owner's authority — see
//     OperationScopes, MaxRole and AllowWrites. It can never widen it: every
//     request still resolves the owner's live roles and operation membership,
//     so losing access to an operation shrinks the agent's reach on the next
//     call with no key edit required.
//
// Unlike APIKey there may be several rows per user (no unique index on
// user_id), so an operator can run one narrowly-scoped long-lived agent and a
// broader ad-hoc one, and revoke them independently.
type AgentKey struct {
	field.DefaultField `bson:",inline"`

	// AgentKeyID is the stable row identity used by the GraphQL API. KeyID is
	// the public token prefix and rotates on regenerate, so it cannot serve as
	// the external id.
	AgentKeyID uuid.UUID `bson:"agent_key_id" json:"agent_key_id"`

	// KeyID is the short, public prefix carried in the raw token
	// (vca_<key_id>_<secret>). Unique-indexed for O(1) middleware lookup.
	KeyID string `bson:"key_id" json:"key_id"`

	// UserID is the owning user — the human accountable for what the agent
	// does. Indexed, but NOT unique.
	UserID uuid.UUID `bson:"user_id" json:"user_id"`

	// Name is operator-supplied and shown wherever the agent is attributed,
	// e.g. "Claude — Operation Nightfall".
	Name string `bson:"name" json:"name"`

	// SecretHash is the lowercase hex SHA-256 of the random tail of the raw
	// token. Constant-time compared on every request.
	SecretHash string `bson:"secret_hash" json:"-"`

	// Enabled is the kill switch. A disabled key resolves to a row but returns
	// 401, so the operator can stop an agent mid-run without losing the token.
	Enabled bool `bson:"enabled" json:"enabled"`

	// OperationScopes limits the key to specific operations. Empty means
	// "every operation the owner is a member of" — still a live check, never a
	// snapshot. A non-empty list is an intersection, not a grant: being listed
	// here does nothing unless the owner is also a member.
	OperationScopes []uuid.UUID `bson:"operation_scopes,omitempty" json:"operation_scopes,omitempty"`

	// MaxRole caps the effective operation role regardless of what the owner
	// holds. An admin's agent capped to viewer is a viewer. Never admin — see
	// IsValidAgentMaxRole.
	MaxRole OperationRole `bson:"max_role" json:"max_role"`

	// AllowWrites gates every mutating MCP tool. False makes the key strictly
	// observational even where MaxRole would otherwise permit changes.
	AllowWrites bool `bson:"allow_writes" json:"allow_writes"`

	// LastUsedAt is updated lazily by the auth middleware, debounced to once
	// per minute. Nullable: never used → nil.
	LastUsedAt *time.Time `bson:"last_used_at,omitempty" json:"last_used_at,omitempty"`

	// Version increments on every secret regeneration.
	Version int `bson:"version" json:"version"`
}

// IsValidAgentMaxRole reports whether r is permissible as an agent cap.
// Operation admin is excluded on purpose: agent keys exist to work inside an
// operation, not to administer membership or delete it. Widening this is a
// deliberate decision, not an oversight to be fixed by adding a case.
func IsValidAgentMaxRole(r OperationRole) bool {
	return r == OperationRoleViewer || r == OperationRoleOperator
}

// CapRole returns the lower of two roles. Used to intersect the owner's live
// membership role with the key's MaxRole.
func CapRole(memberRole, cap OperationRole) OperationRole {
	if operationRoleLevel[cap] < operationRoleLevel[memberRole] {
		return cap
	}
	return memberRole
}
