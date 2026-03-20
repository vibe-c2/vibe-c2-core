package auth

import (
	"context"
	"time"
)

// TokenStore manages durable refresh token state.
// This is NOT a cache — data stored here must persist until
// explicitly deleted or expired. Implementations must not evict.
//
// Atomicity guarantees: StoreWithIndex and DeleteAndUnindex execute
// their respective operations in a single Redis pipeline. Callers
// can rely on all-or-nothing semantics within each method.
type TokenStore interface {
	// StoreWithIndex persists token metadata and adds the key to the
	// user's session index atomically in a single pipeline.
	StoreWithIndex(ctx context.Context, key string, meta RefreshTokenMeta, userID string, ttl time.Duration) error

	// Lookup retrieves token metadata. Returns ErrTokenNotFound if absent.
	Lookup(ctx context.Context, key string) (*RefreshTokenMeta, error)

	// DeleteAndUnindex removes a token and its entry from the user's
	// session index atomically in a single pipeline.
	DeleteAndUnindex(ctx context.Context, key string, userID string) error

	// UserSessionCount returns the number of active sessions for a user.
	UserSessionCount(ctx context.Context, userID string) (int64, error)

	// DeleteAllUserSessions removes all tokens and the index for a user.
	DeleteAllUserSessions(ctx context.Context, userID string) error

	// Close releases resources.
	Close() error
}
