package models

import (
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// SessionStatus indicates whether a session is currently active or has ended.
type SessionStatus string

const (
	SessionStatusActive   SessionStatus = "active"
	SessionStatusInactive SessionStatus = "inactive"
)

// SessionTerminationReason describes why a session ended.
type SessionTerminationReason string

const (
	TerminationLogout         SessionTerminationReason = "logout"
	TerminationExpired        SessionTerminationReason = "expired"
	TerminationEvicted        SessionTerminationReason = "evicted"
	TerminationReplayDetected SessionTerminationReason = "replay_detected"
	TerminationAdminRevoked   SessionTerminationReason = "admin_revoked"
	TerminationUserRevoked    SessionTerminationReason = "user_revoked"
)

// --- SessionStatus GraphQL marshaling ---

var validSessionStatuses = map[SessionStatus]bool{
	SessionStatusActive:   true,
	SessionStatusInactive: true,
}

func (s SessionStatus) IsValid() bool { return validSessionStatuses[s] }

// MarshalGQL writes the status as a quoted uppercase GraphQL enum value.
// Quoted because gqlgen field resolvers marshal to json.RawMessage first.
func (s SessionStatus) MarshalGQL(w io.Writer) {
	fmt.Fprintf(w, "%q", strings.ToUpper(string(s)))
}

// UnmarshalGQL reads a GraphQL enum value and converts to lowercase.
func (s *SessionStatus) UnmarshalGQL(v interface{}) error {
	str, ok := v.(string)
	if !ok {
		return fmt.Errorf("SessionStatus must be a string")
	}
	status := SessionStatus(strings.ToLower(str))
	if !status.IsValid() {
		return fmt.Errorf("invalid SessionStatus: %s", str)
	}
	*s = status
	return nil
}

// --- SessionTerminationReason GraphQL marshaling ---

var validTerminationReasons = map[SessionTerminationReason]bool{
	TerminationLogout:         true,
	TerminationExpired:        true,
	TerminationEvicted:        true,
	TerminationReplayDetected: true,
	TerminationAdminRevoked:   true,
	TerminationUserRevoked:    true,
}

func (r SessionTerminationReason) IsValid() bool { return validTerminationReasons[r] }

// MarshalGQL writes the reason as a quoted uppercase GraphQL enum value.
// Underscores are preserved (e.g. "replay_detected" -> "REPLAY_DETECTED").
// Quoted because gqlgen field resolvers marshal to json.RawMessage first.
func (r SessionTerminationReason) MarshalGQL(w io.Writer) {
	fmt.Fprintf(w, "%q", strings.ToUpper(string(r)))
}

// UnmarshalGQL reads a GraphQL enum value and converts to lowercase.
func (r *SessionTerminationReason) UnmarshalGQL(v interface{}) error {
	str, ok := v.(string)
	if !ok {
		return fmt.Errorf("SessionTerminationReason must be a string")
	}
	reason := SessionTerminationReason(strings.ToLower(str))
	if !reason.IsValid() {
		return fmt.Errorf("invalid SessionTerminationReason: %s", str)
	}
	*r = reason
	return nil
}

// Session represents a persistent session record in MongoDB.
// Active sessions have a corresponding refresh token in Redis.
// Inactive sessions form an audit trail of past authentication activity.
//
// The TokenHash field links this document to the Redis refresh token entry.
// On token rotation, TokenHash is updated to the new hash — one MongoDB session
// corresponds to one logical login, regardless of how many rotations occur.
type Session struct {
	field.DefaultField `bson:",inline"`

	// SessionID is the public identifier exposed in APIs.
	// A UUID rather than the token hash to avoid leaking token information.
	SessionID uuid.UUID `bson:"session_id" json:"session_id"`

	// UserID links to the owning user.
	UserID uuid.UUID `bson:"user_id" json:"user_id"`

	// TokenHash is the SHA-256 hash of the current refresh token.
	// Updated on rotation; used to correlate with the Redis token entry.
	TokenHash string `bson:"token_hash" json:"-"`

	// Request metadata captured at login time.
	IPAddress string `bson:"ip_address" json:"ip_address"`
	UserAgent string `bson:"user_agent" json:"user_agent"` // raw User-Agent header
	Browser   string `bson:"browser" json:"browser"`       // parsed: e.g. "Chrome 120"
	OS        string `bson:"os" json:"os"`                 // parsed: e.g. "macOS 14.2"
	Device    string `bson:"device" json:"device"`         // "Desktop", "Mobile", "Tablet", "Bot"

	// Lifecycle fields.
	Status            SessionStatus            `bson:"status" json:"status"`
	TerminationReason SessionTerminationReason  `bson:"termination_reason,omitempty" json:"termination_reason,omitempty"`
	LastActivityAt    time.Time                `bson:"last_activity_at" json:"last_activity_at"`
	ExpiresAt         time.Time                `bson:"expires_at" json:"expires_at"`
	TerminatedAt      *time.Time               `bson:"terminated_at,omitempty" json:"terminated_at,omitempty"`
}
