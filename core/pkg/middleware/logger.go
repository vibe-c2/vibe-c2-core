package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/logger"
	"go.uber.org/zap"
)

// Logger seeds a zap logger into the request context (so logger.From(ctx)
// works inside controllers) and logs each request on completion.
func Logger(log *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		// Seed logger into request context.
		ctx := logger.With(c.Request.Context(), log)
		c.Request = c.Request.WithContext(ctx)

		c.Next()

		log.Info("request",
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.Int("status", c.Writer.Status()),
			zap.Duration("duration", time.Since(start)),
			zap.String("client_ip", c.ClientIP()),
		)
	}
}
