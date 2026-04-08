package models

import (
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// SessionStatus is a derived field on the GraphQL Session type. It is NOT
// persisted in Mongo. The resolver decorates each Mongo session row with
// SessionStatusActive if a corresponding Redis entry still exists,
// SessionStatusInactive otherwise.
type SessionStatus string

const (
	SessionStatusActive   SessionStatus = "active"
	SessionStatusInactive SessionStatus = "inactive"
)

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

// Session is the persisted creation log for one authentication. It is
// inserted exactly once on login and never updated. Active state lives
// elsewhere (Redis); this struct is just the immutable record of who
// authenticated, when, and from where.
//
// The resolver decorates instances of this struct in-memory with derived
// `Status` and `LastActivityAt` values from Redis before returning them
// over GraphQL — those fields are NOT bson-tagged so qmgo never round-trips
// them to Mongo.
type Session struct {
	field.DefaultField `bson:",inline"`

	// SessionID is the public identifier exposed in APIs.
	SessionID uuid.UUID `bson:"session_id" json:"session_id"`

	// UserID links to the owning user.
	UserID uuid.UUID `bson:"user_id" json:"user_id"`

	// Request metadata captured at login time.
	IPAddress string `bson:"ip_address" json:"ip_address"`
	UserAgent string `bson:"user_agent" json:"user_agent"`
	Browser   string `bson:"browser" json:"browser"`
	OS        string `bson:"os" json:"os"`
	Device    string `bson:"device" json:"device"`

	// --- Derived (decorated by resolver, never persisted) ---

	// Status is set to SessionStatusActive if the session has a live
	// Redis entry, SessionStatusInactive otherwise. Not persisted.
	Status SessionStatus `bson:"-" json:"-"`

	// LastActivityAt is the unix timestamp of the last refresh, sourced
	// from the Redis value. Nil for inactive sessions. Not persisted.
	LastActivityAt *int64 `bson:"-" json:"-"`
}
