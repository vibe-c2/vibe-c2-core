package session

import (
	"context"
	"fmt"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// Cleaner periodically marks expired sessions as inactive in MongoDB
// and reconciles orphaned sessions where the Redis token was deleted
// but the MongoDB record was not updated (dual-write consistency gap).
type Cleaner struct {
	sessionRepo repository.ISessionRepository
	tokenStore  auth.TokenStore
	logger      *zap.Logger
	interval    time.Duration
	ctx         context.Context
	cancel      context.CancelFunc
}

// NewCleaner creates a session cleaner with the given interval.
func NewCleaner(sessionRepo repository.ISessionRepository, tokenStore auth.TokenStore, logger *zap.Logger, interval time.Duration) *Cleaner {
	ctx, cancel := context.WithCancel(context.Background())
	return &Cleaner{
		sessionRepo: sessionRepo,
		tokenStore:  tokenStore,
		logger:      logger,
		interval:    interval,
		ctx:         ctx,
		cancel:      cancel,
	}
}

// Start begins the periodic cleanup in a background goroutine.
func (c *Cleaner) Start() {
	go func() {
		ticker := time.NewTicker(c.interval)
		defer ticker.Stop()

		c.logger.Info("Session cleaner started", zap.Duration("interval", c.interval))

		for {
			select {
			case <-ticker.C:
				c.cleanExpired()
				c.reconcileOrphaned()
			case <-c.ctx.Done():
				c.logger.Info("Session cleaner stopped")
				return
			}
		}
	}()
}

// Stop signals the cleaner goroutine to exit and cancels any in-flight operations.
func (c *Cleaner) Stop() {
	c.cancel()
}

// cleanExpired marks sessions past their expires_at as inactive.
func (c *Cleaner) cleanExpired() {
	count, err := c.sessionRepo.MarkExpiredSessions(c.ctx)
	if err != nil {
		c.logger.Error("Session cleanup failed", zap.Error(err))
	} else if count > 0 {
		c.logger.Info("Expired sessions cleaned", zap.Int64("count", count))
	}
}

// reconcileOrphaned finds active MongoDB sessions whose Redis token
// has been deleted (e.g. due to a failed dual-write) and terminates them.
func (c *Cleaner) reconcileOrphaned() {
	sessions, err := c.sessionRepo.FindActiveSessions(c.ctx, 500)
	if err != nil {
		c.logger.Error("Reconciliation: failed to fetch active sessions", zap.Error(err))
		return
	}

	reconciled := 0
	for _, sess := range sessions {
		if sess.TokenHash == "" {
			continue
		}

		// Skip sessions with recent activity — they may be mid-rotation.
		if time.Since(sess.LastActivityAt) < 2*time.Minute {
			continue
		}

		key := fmt.Sprintf("%s:%s:%s", auth.RefreshTokenPrefix, sess.UserID.String(), sess.TokenHash)
		if _, err := c.tokenStore.Lookup(c.ctx, key); err == nil {
			continue // Token exists in Redis — session is consistent
		}

		// Token appears missing. Re-fetch to guard against TOCTOU race:
		// the user may have refreshed (rotating to a new token hash)
		// between our snapshot and the Redis check.
		current, err := c.sessionRepo.FindByID(c.ctx, sess.SessionID)
		if err != nil || current.Status != models.SessionStatusActive {
			continue // Session already terminated or gone
		}
		if current.TokenHash != sess.TokenHash {
			continue // Token was rotated — not orphaned, skip
		}

		// Token confirmed missing from Redis and unchanged in MongoDB — terminate.
		if err := c.sessionRepo.Terminate(c.ctx, sess.SessionID, models.TerminationExpired); err != nil {
			c.logger.Warn("Reconciliation: failed to terminate orphaned session",
				zap.String("session_id", sess.SessionID.String()), zap.Error(err))
			continue
		}
		reconciled++
	}

	if reconciled > 0 {
		c.logger.Info("Orphaned sessions reconciled", zap.Int("count", reconciled))
	}
}
