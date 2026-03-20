package app

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/permissions"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/controller"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/middleware"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
)

func (a *App) NewRouter() *gin.Engine {
	if a.env.StageStatus != "dev" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()

	// Global middleware
	r.Use(middleware.Recovery(a.logger))
	r.Use(middleware.Cors())
	r.Use(middleware.Logger(a.logger))

	// Controllers
	authCtrl := controller.NewAuthController(a.repos.User, a.authProvider, a.logger)

	v1 := r.Group("/api/v1")
	{
		v1.GET("/", healthcheck)

		// Public auth routes
		v1.POST("/login", authCtrl.Login)
		v1.POST("/login/refresh", authCtrl.Refresh)

		// Protected routes (JWT required)
		v1.Use(middleware.JWTAuth(a.authProvider))

		v1.GET("/login/me", middleware.RBAC(permissions.BasicPermission), authCtrl.Me)
		v1.POST("/logout", middleware.RBAC(permissions.BasicPermission), authCtrl.Logout)
	}

	return r
}

func healthcheck(c *gin.Context) {
	c.JSON(http.StatusOK, responses.SuccessResponse{Message: "ok"})
}
