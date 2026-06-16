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
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikiexport"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikiimport"

	_ "github.com/vibe-c2/vibe-c2-core/core/docs"
)

func (a *App) NewRouter() *gin.Engine {
	if a.env.StageStatus != "development" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()

	// Global middleware
	r.Use(middleware.Recovery(a.logger))
	r.Use(middleware.Cors(a.env.CORSAllowedOrigins))
	r.Use(middleware.Logger(a.logger))

	// Controllers
	isDev := a.env.StageStatus == "development"
	ctrlCfg := controller.AuthControllerConfig{
		RefreshTTL:         a.authCfg.refreshTTL,
		RefreshGraceTTL:    a.authCfg.refreshGraceTTL,
		GraceEncryptionKey: a.authCfg.graceKey,
		IsDev:              isDev,
	}
	authCtrl := controller.NewAuthController(a.repos.User, a.repos.Session, a.authProvider, a.tokenStore, a.eventBus, a.logger, ctrlCfg)
	enrollCtrl := controller.NewEnrollController(a.repos.User, a.repos.Session, a.authProvider, a.tokenStore, a.eventBus, a.logger, ctrlCfg)
	statusCtrl := controller.NewStatusController(a.repos.User, a.logger)

	// Resolvers (GraphQL business logic, same pattern as controllers)
	userRes := resolver.NewUserResolver(a.repos.User, a.eventBus)
	opRes := resolver.NewOperationResolver(a.repos.Operation, a.repos.User,
		resolver.WithWikiDocumentRepo(a.repos.WikiDocument),
		resolver.WithWikiDocumentBackupRepo(a.repos.WikiDocumentBackup),
		resolver.WithCredentialRepo(a.repos.Credential),
		resolver.WithHostRepo(a.repos.Host),
		resolver.WithEventBus(a.eventBus))
	sessRes := resolver.NewSessionResolver(a.repos.Session, a.repos.User, a.tokenStore, a.eventBus)
	wikiDocRes := resolver.NewWikiDocumentResolver(
		a.repos.WikiDocument, a.repos.WikiDocumentBackup,
		a.repos.Operation, a.repos.User,
		a.repos.WikiDocumentVisit,
		a.repos.Credential,
		a.repos.Hash,
		a.repos.Task,
		a.eventBus, a.presenceTracker,
	)
	wikiVisitRes := resolver.NewWikiDocumentVisitResolver(
		a.repos.WikiDocumentVisit, a.repos.WikiDocument, a.repos.Operation,
	)
	// credRes depends on wikiDocRes for the backlinks field resolvers — the
	// cross-domain join lives on wikiDocRes (where the wiki repo lives) so
	// the dependency arrow points from credentials → wiki, not the other way.
	credRes := resolver.NewCredentialResolver(
		a.repos.Credential, a.repos.Operation, a.repos.User, wikiDocRes, a.repos.Task, a.eventBus,
	)
	// hashRes depends on credRes because MarkHashCracked may need to create a
	// new credential inline — going through the credential resolver keeps the
	// validation, event publishing, and timeline write paths consistent.
	// hashRes also depends on wikiDocRes for the backlinks field resolvers —
	// same cross-domain join shape as credRes.
	hashRes := resolver.NewHashResolver(
		a.repos.Hash, a.repos.Credential, a.repos.Operation, a.repos.User, credRes, wikiDocRes, a.eventBus,
	)
	// hostRes depends on wikiDocRes only to strip the inverse host_references
	// index on host hard-delete (mirrors the credential/hash cleanup paths).
	hostRes := resolver.NewHostResolver(
		a.repos.Host, a.repos.Operation, a.repos.User, wikiDocRes, a.eventBus,
	)
	taskRes := resolver.NewTaskResolver(
		a.repos.Task, a.repos.Operation, a.repos.User, a.repos.WikiDocument, a.repos.Credential, a.eventBus,
	)
	timelineRes := resolver.NewTimelineResolver(
		a.repos.OperationEvent, a.repos.Operation, a.repos.User, a.eventBus,
	)
	apiKeyRes := resolver.NewAPIKeyResolver(a.repos.APIKey)

	// Wiki controller (REST endpoints)
	wikiCtrl := controller.NewWikiController(a.repos.WikiDocument, a.repos.Operation, a.env.HocuspocusTicketSecret, a.logger)
	wikiImageCtrl := controller.NewWikiImageController(
		a.repos.WikiDocument, a.repos.WikiImage, a.repos.Operation,
		a.imageStore, a.imageProcessor, a.logger,
		controller.WikiImageControllerConfig{MaxSize: a.env.WikiImageMaxSize},
	)
	wikiFileCtrl := controller.NewWikiFileController(
		a.repos.WikiDocument, a.repos.WikiFile, a.repos.Operation,
		a.fileStore, a.logger,
		controller.WikiFileControllerConfig{
			MaxSize:            a.env.WikiFileMaxSize,
			DeniedContentTypes: a.env.WikiFileDeniedContentTypes,
		},
	)

	// Outline-export importer. Reuses the image/file ingest helpers from
	// the controllers above and delegates markdown→Y.js conversion to the
	// Hocuspocus sidecar via the existing HocuspocusClient.
	wikiImportOrch := wikiimport.NewOrchestrator(
		a.repos.WikiDocument,
		a.repos.Credential,
		wikiImageCtrl,
		wikiFileCtrl,
		a.hpClient,
		a.eventBus,
		a.logger,
	)
	wikiImportCtrl := controller.NewWikiImportController(
		wikiImportOrch, a.repos.Operation, a.logger,
		controller.WikiImportControllerConfig{MaxZipSize: a.env.WikiImportZipMaxSize},
	)

	// Outline-flavored markdown exporter. Inverse of the importer above:
	// renders an operation's wiki (or a subtree) to a zip whose layout
	// matches the importer's input contract, so the result round-trips.
	wikiExportOrch := wikiexport.NewOrchestrator(
		a.repos.WikiDocument,
		a.repos.WikiImage,
		a.repos.WikiFile,
		a.imageStore,
		a.fileStore,
		a.hpClient,
		wikiexport.NewCredentialRepoLookup(a.repos.Credential),
		a.logger,
		wikiexport.Config{},
	)
	wikiExportCtrl := controller.NewWikiExportController(
		wikiExportOrch, a.repos.WikiDocument, a.repos.Operation, a.logger,
	)

	// Wiki webhook handler (Hocuspocus callbacks — internal, HMAC-validated, not behind JWTAuth)
	webhookHandler := wiki.NewWebhookHandler(a.presenceTracker, a.eventBus, a.env.HocuspocusWebhookSecret, a.logger)

	// Swagger documentation
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	v1 := r.Group("/api/v1")
	{
		v1.GET("/", healthcheck)

		// Public routes (no JWT, no CSRF — these initiate the cookie set).
		v1.GET("/status", statusCtrl.Status)
		v1.POST("/enroll", enrollCtrl.Enroll)
		v1.POST("/login", authCtrl.Login)

		// /login/refresh requires the CSRF double-submit cookie (set on
		// the previous login/refresh) but no JWT — the access cookie may
		// be expired by the time refresh is called.
		v1.POST("/login/refresh", middleware.CSRF(a.authCfg.csrfEnabled), authCtrl.Refresh)

		// Internal webhook endpoint (not behind JWTAuth, behind HMAC validation)
		internal := v1.Group("/internal")
		internal.POST("/wiki/webhook", webhookHandler.Handle)

		// GraphQL Playground — browser-based IDE for testing queries (dev only).
		// Served publicly so browsers can load the page without auth cookies.
		// The actual GraphQL queries from Playground go through POST /graphql, which is protected.
		if a.env.StageStatus == "development" {
			v1.GET("/graphql", gql.NewPlaygroundHandler("/api/v1/graphql"))
		}

		// Protected routes. Authentication runs first: either Authorization:
		// Bearer vc2_... resolves to an API key, or the access_token cookie
		// is validated as a JWT. CSRF then runs against the resolved identity
		// — API-key callers skip it because they have no cookie surface.
		v1.Use(middleware.AuthN(a.authProvider, a.repos.APIKey, a.repos.User, a.cache))
		v1.Use(middleware.CSRF(a.authCfg.csrfEnabled))

		v1.GET("/login/me", middleware.RBAC(permissions.BasicPermission), authCtrl.Me)
		v1.POST("/logout", middleware.RBAC(permissions.BasicPermission), authCtrl.Logout)

		// Wiki collab ticket (protected by JWT, issues short-lived ticket for Hocuspocus)
		wikiGroup := v1.Group("/wiki")
		wikiGroup.POST("/collab-ticket", wikiCtrl.CollabTicket)

		// Wiki image uploads & proxy reads. GET bypasses CSRF (safe method)
		// and authenticates via the httpOnly access_token cookie so `<img>`
		// tags resolve natively without custom headers.
		wikiGroup.POST("/images", wikiImageCtrl.Upload)
		wikiGroup.GET("/images/:id", wikiImageCtrl.Download)

		// Wiki file attachments (non-image files). Same auth/CSRF model as
		// images; GET authenticates via the httpOnly access_token cookie so
		// download/preview links work without custom headers.
		wikiGroup.POST("/files", wikiFileCtrl.Upload)
		wikiGroup.GET("/files/:id", wikiFileCtrl.Download)

		// Outline-export importer (operator+ only; auth check is inside
		// the handler since it depends on the operationId query param).
		wikiGroup.POST("/import/outline", wikiImportCtrl.UploadOutlineExport)

		// Outline-format markdown exporter. Reader+ on the operation;
		// the GET method is exempt from CSRF by the middleware above.
		wikiGroup.GET("/export", wikiExportCtrl.Export)

		// GraphQL endpoint — all queries, mutations, and subscriptions.
		// Authentication is handled by the JWTAuth middleware above (same as REST).
		// Authorization (RBAC) is handled by the @hasPermission directive inside
		// the GraphQL schema — each query/mutation declares what permission it needs.
		//
		// /graphql (POST)     — queries, mutations, and legacy SSE subscriptions
		// /graphql/ws (GET)   — graphql-transport-ws WebSocket transport. The
		//                       Upgrade header routes it to the WS transport
		//                       inside gqlgen; one socket multiplexes every
		//                       active subscription on the page.
		gqlHandler := gql.NewHandler(
			userRes, opRes, sessRes, wikiDocRes, wikiVisitRes, credRes, hashRes, hostRes, taskRes, timelineRes, apiKeyRes,
			a.eventBus,
			a.repos.User, a.repos.Operation, a.repos.Session, a.repos.WikiDocument, a.repos.Credential, a.repos.Hash, a.repos.Host, a.repos.Task,
			a.presenceTracker,
			a.env.CORSAllowedOrigins,
		)
		v1.POST("/graphql", gqlHandler)
		v1.GET("/graphql/ws", gqlHandler)

	}

	return r
}

func healthcheck(c *gin.Context) {
	c.JSON(http.StatusOK, responses.SuccessResponse{Message: "ok"})
}
