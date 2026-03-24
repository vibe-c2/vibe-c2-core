package app

import (
	"net/http"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/permissions"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/controller"
	gql "github.com/vibe-c2/vibe-c2-core/core/pkg/graphql"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/middleware"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/resolver"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"

	_ "github.com/vibe-c2/vibe-c2-core/core/docs"
)

func (a *App) NewRouter() *gin.Engine {
	if a.env.StageStatus != "development" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()

	// Global middleware
	r.Use(middleware.Recovery(a.logger))
	r.Use(middleware.Cors())
	r.Use(middleware.Logger(a.logger))

	// Controllers
	authCtrl := controller.NewAuthController(a.repos.User, a.authProvider, a.logger)
	enrollCtrl := controller.NewEnrollController(a.repos.User, a.authProvider, a.logger)
	statusCtrl := controller.NewStatusController(a.repos.User, a.logger)

	// Resolvers (GraphQL business logic, same pattern as controllers)
	userRes := resolver.NewUserResolver(a.repos.User)
	opRes := resolver.NewOperationResolver(a.repos.Operation, a.repos.User,
		resolver.WithSchemeNetworkPointRepo(a.repos.SchemeNetworkPoint))
	snpRes := resolver.NewSchemeNetworkPointResolver(a.repos.SchemeNetworkPoint, a.repos.Operation)

	// Swagger documentation
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	v1 := r.Group("/api/v1")
	{
		v1.GET("/", healthcheck)

		// Public routes
		v1.GET("/status", statusCtrl.Status)
		v1.POST("/enroll", enrollCtrl.Enroll)
		v1.POST("/login", authCtrl.Login)
		v1.POST("/login/refresh", authCtrl.Refresh)

		// GraphQL Playground — browser-based IDE for testing queries (dev only).
		// Served publicly because browsers can't set Authorization headers on page loads.
		// The actual GraphQL queries from Playground go through POST /graphql, which is protected.
		if a.env.StageStatus == "development" {
			v1.GET("/graphql", gql.NewPlaygroundHandler("/api/v1/graphql"))
		}

		// Protected routes (JWT required)
		v1.Use(middleware.JWTAuth(a.authProvider))

		v1.GET("/login/me", middleware.RBAC(permissions.BasicPermission), authCtrl.Me)
		v1.POST("/logout", middleware.RBAC(permissions.BasicPermission), authCtrl.Logout)

		// GraphQL endpoint — all user management queries and mutations.
		// Authentication is handled by the JWTAuth middleware above (same as REST).
		// Authorization (RBAC) is handled by the @hasPermission directive inside
		// the GraphQL schema — each query/mutation declares what permission it needs.
		v1.POST("/graphql", gql.NewHandler(userRes, opRes, snpRes))

	}

	return r
}

func healthcheck(c *gin.Context) {
	c.JSON(http.StatusOK, responses.SuccessResponse{Message: "ok"})
}
