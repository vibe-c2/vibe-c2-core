package auth

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// ActiveSession is everything Redis stores about an authorized session: its
// stable session ID and the timestamp of the most recent refresh. The full
// device metadata (IP, UA, browser, OS, device) lives in the Mongo
// creation log, not here.
type ActiveSession struct {
	SessionID      uuid.UUID
	LastActivityAt time.Time
}

// GracePayload is the shadow record written after a successful token rotation.
// It allows a second tab presenting the old (now-deleted) refresh token hash
// to receive the same new token that the first tab got, preventing a spurious
// logout in multi-tab scenarios. The raw refresh token is encrypted at rest.
type GracePayload struct {
	NewRawEncrypted string    // AES-256-GCM ciphertext of the new raw refresh token
	NewHash         string    // SHA-256 hex of the new raw token (for verification)
	SessionID       uuid.UUID // stable session ID (preserved across rotations)
}

// TokenStore is the single source of truth for *active* refresh tokens.
// Implementations are backed by Redis. The store maintains two structures:
//
//   - refresh:<user_id>:<token_hash>  STRING — "<session_id>|<last_activity_unix>"
//   - session_index:<user_id>         SET    — all live token keys for a user
//
// Both expire via native Redis TTL. There is no sweeper, no expiry queue,
// no audit-on-termination side effect — terminations just delete the key.
// All multi-key operations go through Lua scripts so concurrent rotations
// across multiple API pods are linearizable on the Redis side.
//
// Mongo plays no role in token validation. Authorization touches only Redis.
type TokenStore interface {
	// Create persists a new active session under (userID, tokenHash) with
	// the given session_id and TTL. The Redis key TTL equals ttl.
	Create(ctx context.Context, userID, sessionID uuid.UUID, tokenHash string, ttl time.Duration) error

	// Rotate atomically swaps the current refresh token hash for a session.
	// The Lua script:
	//   1. GETs refresh:<user>:<oldHash>. If absent → returns ErrTokenInvalid
	//      (loser-of-race / replay signal).
	//   2. Parses out the existing session_id (SessionID is stable across
	//      rotations).
	//   3. Writes refresh:<user>:<newHash> with "<session_id>|<now_unix>"
	//      and the same ttl.
	//   4. SADD new key, SREM old key on session_index, EXPIRE the index.
	//   5. DEL old key.
	//
	// Returns the session_id parsed from the old value so the caller can
	// mint a new access JWT carrying the unchanged session_id.
	Rotate(ctx context.Context, userID uuid.UUID, oldHash, newHash string, ttl time.Duration) (uuid.UUID, error)

	// Lookup fetches the active session record for (userID, tokenHash).
	// Returns ErrTokenInvalid if the key is missing.
	Lookup(ctx context.Context, userID uuid.UUID, tokenHash string) (*ActiveSession, error)

	// DeleteBySessionID scans the user's index, finds the token key whose
	// value carries the given session_id, deletes it, and returns the
	// removed record. Returns ErrTokenInvalid if no live session matches.
	// Used by /logout and revokeSession.
	DeleteBySessionID(ctx context.Context, userID, sessionID uuid.UUID) (*ActiveSession, error)

	// ListByUser returns all live active sessions for a user. The returned
	// slice is unordered. Stale index entries (where the underlying token
	// key has expired) are cleaned as a side effect.
	ListByUser(ctx context.Context, userID uuid.UUID) ([]ActiveSession, error)

	// DeleteAllForUser removes every live session for a user. Used by
	// AdminRevokeAllUserSessions and RevokeAllMySessions.
	DeleteAllForUser(ctx context.Context, userID uuid.UUID) error

	// SaveGrace stores a short-lived shadow record mapping oldHash to the
	// new token data produced by the most recent Rotate. Within the grace
	// TTL, a second tab presenting the same old hash can retrieve this
	// record and receive the same new refresh token — preventing a spurious
	// logout caused by the multi-tab rotation race. Best-effort: callers
	// should log failures but not fail the primary refresh response.
	SaveGrace(ctx context.Context, userID uuid.UUID, oldHash string, payload GracePayload, ttl time.Duration) error

	// LookupGrace retrieves the shadow record written by SaveGrace.
	// Returns ErrTokenInvalid if the key is absent or expired.
	LookupGrace(ctx context.Context, userID uuid.UUID, oldHash string) (*GracePayload, error)

	// Close releases resources.
	Close() error
}
