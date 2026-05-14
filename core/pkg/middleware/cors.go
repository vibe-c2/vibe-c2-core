package middleware

import (
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func Cors(allowOrigins []string) gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOrigins: allowOrigins,
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"},
		AllowHeaders: []string{
			"Origin",
			"Content-Type",
			"Accept",
		},

		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	})
}
