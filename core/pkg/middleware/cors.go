package middleware

import (
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func Cors() gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOrigins: []string{
			"http://localhost:5173",
		},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"},
		AllowHeaders: []string{
			"Origin",
			"Content-Type",
			"Authorization",
			"Accept",
		},
		// ExposeHeaders: []string{
		// 	"Content-Length",
		// 	"Access-Control-Allow-Origin",
		// 	"Content-Type",
		// 	"Cache-Control",
		// 	"Connection",
		// },

		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	})
}
