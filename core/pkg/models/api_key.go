package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// APIKey is a long-lived programmatic credential for a user. One row per user
// (enforced by a unique index on user_id) — regenerating overwrites the secret
// in place and bumps Version. The raw token is never stored: only KeyID (the
// public, indexed prefix) and SecretHash (SHA-256 hex of the random tail).
type APIKey struct {
	field.DefaultField `bson:",inline"`

	// KeyID is the short, public prefix that appears in the raw token. Used
	// by the middleware to find the row without scanning. Unique-indexed.
	KeyID string `bson:"key_id" json:"key_id"`

	// UserID is the owning user. Unique-indexed — one key per user.
	UserID uuid.UUID `bson:"user_id" json:"user_id"`

	// SecretHash is the lowercase hex SHA-256 of the random tail of the
	// raw token. Constant-time compared on every request.
	SecretHash string `bson:"secret_hash" json:"-"`

	// Enabled flips a key off without deleting it. Disabled keys still
	// resolve to a row but return 401 on use.
	Enabled bool `bson:"enabled" json:"enabled"`

	// LastUsedAt is updated lazily by the auth middleware (debounced via
	// Redis SETNX to once per minute). Nullable: never used → nil.
	LastUsedAt *time.Time `bson:"last_used_at,omitempty" json:"last_used_at,omitempty"`

	// Version increments every time the secret is regenerated. Useful for
	// audit log correlation; the live secret is the latest version.
	Version int `bson:"version" json:"version"`
}
