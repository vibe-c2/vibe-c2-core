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
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"

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
	isDev := a.env.StageStatus == "development"
	authCtrl := controller.NewAuthController(a.repos.User, a.repos.Session, a.authProvider, a.tokenStore, a.eventBus, a.logger, isDev)
	enrollCtrl := controller.NewEnrollController(a.repos.User, a.repos.Session, a.authProvider, a.eventBus, a.logger, isDev)
	statusCtrl := controller.NewStatusController(a.repos.User, a.logger)

	// Resolvers (GraphQL business logic, same pattern as controllers)
	userRes := resolver.NewUserResolver(a.repos.User, a.eventBus)
	opRes := resolver.NewOperationResolver(a.repos.Operation, a.repos.User,
		resolver.WithSchemeNetworkPointRepo(a.repos.SchemeNetworkPoint),
		resolver.WithWikiDocumentRepo(a.repos.WikiDocument),
		resolver.WithWikiDocumentBackupRepo(a.repos.WikiDocumentBackup),
		resolver.WithEventBus(a.eventBus))
	snpRes := resolver.NewSchemeNetworkPointResolver(a.repos.SchemeNetworkPoint, a.repos.Operation)
	sessRes := resolver.NewSessionResolver(a.repos.Session, a.repos.User, a.tokenStore, a.authProvider, a.eventBus)
	wikiDocRes := resolver.NewWikiDocumentResolver(
		a.repos.WikiDocument, a.repos.WikiDocumentBackup,
		a.repos.Operation, a.repos.User,
		a.eventBus, a.presenceTracker,
	)

	// Wiki controller (REST endpoints)
	wikiCtrl := controller.NewWikiController(a.repos.WikiDocument, a.repos.Operation, a.env.HocuspocusTicketSecret, a.logger)

	// Wiki webhook handler (Hocuspocus callbacks — internal, HMAC-validated, not behind JWTAuth)
	webhookHandler := wiki.NewWebhookHandler(a.presenceTracker, a.eventBus, a.env.HocuspocusWebhookSecret, a.logger)

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

		// Internal webhook endpoint (not behind JWTAuth, behind HMAC validation)
		internal := v1.Group("/internal")
		internal.POST("/wiki/webhook", webhookHandler.Handle)

		// GraphQL Playground — browser-based IDE for testing queries (dev only).
		// Served publicly so browsers can load the page without auth cookies.
		// The actual GraphQL queries from Playground go through POST /graphql, which is protected.
		if a.env.StageStatus == "development" {
			v1.GET("/graphql", gql.NewPlaygroundHandler("/api/v1/graphql"))
		}

		// Protected routes (JWT required)
		v1.Use(middleware.JWTAuth(a.authProvider))

		v1.GET("/login/me", middleware.RBAC(permissions.BasicPermission), authCtrl.Me)
		v1.POST("/logout", middleware.RBAC(permissions.BasicPermission), authCtrl.Logout)

		// Wiki collab ticket (protected by JWT, issues short-lived ticket for Hocuspocus)
		wikiGroup := v1.Group("/wiki")
		wikiGroup.POST("/collab-ticket", wikiCtrl.CollabTicket)

		// GraphQL endpoint — all queries, mutations, and subscriptions.
		// Authentication is handled by the JWTAuth middleware above (same as REST).
		// Authorization (RBAC) is handled by the @hasPermission directive inside
		// the GraphQL schema — each query/mutation declares what permission it needs.
		v1.POST("/graphql", gql.NewHandler(
			userRes, opRes, snpRes, sessRes, wikiDocRes,
			a.eventBus,
			a.repos.User, a.repos.Operation, a.repos.Session, a.repos.WikiDocument,
			a.presenceTracker,
		))

	}

	return r
}

func healthcheck(c *gin.Context) {
	c.JSON(http.StatusOK, responses.SuccessResponse{Message: "ok"})
}
