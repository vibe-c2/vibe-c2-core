package session

import (
	"context"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// Cleaner periodically marks expired sessions as inactive in MongoDB.
// Sessions expire when their refresh token TTL elapses (7 days).
// The cleaner runs on a fixed interval and bulk-updates any active sessions
// whose expires_at timestamp has passed.
type Cleaner struct {
	sessionRepo repository.ISessionRepository
	logger      *zap.Logger
	interval    time.Duration
	stopCh      chan struct{}
}

// NewCleaner creates a session cleaner with the given interval.
func NewCleaner(sessionRepo repository.ISessionRepository, logger *zap.Logger, interval time.Duration) *Cleaner {
	return &Cleaner{
		sessionRepo: sessionRepo,
		logger:      logger,
		interval:    interval,
		stopCh:      make(chan struct{}),
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
				count, err := c.sessionRepo.MarkExpiredSessions(context.Background())
				if err != nil {
					c.logger.Error("Session cleanup failed", zap.Error(err))
				} else if count > 0 {
					c.logger.Info("Expired sessions cleaned", zap.Int64("count", count))
				}
			case <-c.stopCh:
				c.logger.Info("Session cleaner stopped")
				return
			}
		}
	}()
}

// Stop signals the cleaner goroutine to exit.
func (c *Cleaner) Stop() {
	close(c.stopCh)
}
