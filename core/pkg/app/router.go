package app

import (
	"net/http"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/permissions"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/controller"
	gql "github.com/vibe-c2/vibe-c2-core/core/pkg/graphql"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/mcp"
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
	r.Use(middleware.Cors(a.env.CORSAllowedOrigins))
	r.Use(middleware.Logger(a.logger))

	// Controllers
	isDev := a.env.StageStatus == "development"
	ctrlCfg := controller.AuthControllerConfig{
		RefreshTTL:         a.authCfg.refreshTTL,
		RefreshGraceTTL:    a.authCfg.refreshGraceTTL,
		GraceEncryptionKey: a.authCfg.graceKey,
		IsDev:              isDev,
		LocalLoginEnabled:  a.authCfg.localLoginEnabled,
	}
	authCtrl := controller.NewAuthController(a.repos.User, a.repos.Session, a.authProvider, a.tokenStore, a.eventBus, a.logger, ctrlCfg)
	enrollCtrl := controller.NewEnrollController(a.repos.User, a.repos.Session, a.authProvider, a.tokenStore, a.eventBus, a.logger, ctrlCfg)
	statusCtrl := controller.NewStatusController(a.repos.User, a.logger, controller.LoginOptions{
		LocalLoginEnabled: a.authCfg.localLoginEnabled,
		OIDCStatus:        a.oidcStatus,
	})

	// Single sign-on (nil provider = OIDC_ENABLED=false, routes not mounted).
	var oidcCtrl controller.IOIDCController
	if a.oidcProvider != nil {
		oidcCtrl = controller.NewOIDCController(
			a.oidcProvider, a.repos.User, a.repos.Session, a.authProvider, a.tokenStore, a.eventBus, a.logger,
			ctrlCfg,
			controller.OIDCControllerConfig{
				Claims:                 oidcConfigFromEnv(a.env),
				AllowedOrigins:         a.env.CORSAllowedOrigins,
				HandshakeKey:           a.authCfg.oidcHandshakeKey,
				LinkExistingByUsername: a.env.OIDC.LinkExistingByUsername,
			},
		)
	}
	channelCtrl := controller.NewChannelController(a.cache, a.moduleGate, a.logger)

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
		a.hpClient,
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
	agentKeyRes := resolver.NewAgentKeyResolver(a.repos.AgentKey, a.repos.Operation)
	focusRes := resolver.NewFocusResolver(a.cache)
	agentActionRes := resolver.NewAgentActionResolver(a.repos.AgentAction, a.repos.Operation, a.repos.User)
	// moduleRes is the app-admin Modules surface. removeModule routes through the
	// lifecycle service so the GraphQL deregister and the RPC deregister share one
	// transition (registry update + gate bust + audit + bus event).
	moduleRes := resolver.NewModuleResolver(a.repos.ModuleRegistry, a.moduleService)
	skillRes := resolver.NewSkillResolver(a.skillService, a.repos.Skill, a.repos.SkillSubscription, a.repos.User)

	// Wiki controller (REST endpoints)
	wikiCtrl := controller.NewWikiController(a.repos.WikiDocument, a.repos.Operation, a.env.HocuspocusTicketSecret, a.logger)
	// Attachment controllers are built in app.go (the transfer pipeline
	// ingests through them); mount the shared instances.
	wikiImageCtrl := a.wikiImageCtrl
	wikiFileCtrl := a.wikiFileCtrl

	// Wiki transfer (export/import as background jobs). The runner and its
	// pipeline are built in app.go; the controller only stages uploads,
	// queues jobs and serves status and downloads.
	wikiTransferCtrl := controller.NewWikiTransferController(
		a.transferRunner, a.repos.WikiTransferJob, a.repos.Operation, a.repos.WikiDocument,
		a.fileStore, a.logger,
		controller.WikiTransferControllerConfig{MaxUploadSize: a.env.WikiImportZipMaxSize},
	)

	// Wiki webhook handler (Hocuspocus callbacks — internal, HMAC-validated, not behind JWTAuth)
	webhookHandler := wiki.NewWebhookHandler(a.presenceTracker, a.eventBus, a.env.HocuspocusWebhookSecret, a.logger)

	// Swagger documentation
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	// Channel data-plane (machine-to-machine). Mounted at the literal contract
	// path POST /api/channel/sync — external channel modules hardcode it — and
	// kept outside the /api/v1 AuthN/CSRF chain. The handler gates each message
	// on module registration (source.module_instance must be a registered
	// instance); this is a registration check, not authentication — cryptographic
	// channel auth (shared secret / mTLS) is still a follow-up.
	channel := r.Group("/api/channel")
	channel.POST("/sync", channelCtrl.Sync)

	v1 := r.Group("/api/v1")
	{
		v1.GET("/", healthcheck)

		// Public routes (no JWT, no CSRF — these initiate the cookie set).
		v1.GET("/status", statusCtrl.Status)
		v1.POST("/enroll", enrollCtrl.Enroll)
		v1.POST("/login", authCtrl.Login)

		// SSO start + provider callback. Both are top-level GET navigations
		// with no cookie-authenticated state to protect, so they sit outside
		// AuthN/CSRF; the sealed handshake cookie + state + PKCE bind the
		// callback to the browser that started the flow.
		if oidcCtrl != nil {
			v1.GET("/auth/oidc/login", oidcCtrl.Login)
			v1.GET("/auth/oidc/callback", oidcCtrl.Callback)
		}

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

		// Protected routes. Authentication runs first: Authorization: Bearer
		// vc2_... resolves to an API key, vca_... to a delegated agent key,
		// or the access_token cookie is validated as a JWT. CSRF then runs
		// against the resolved identity — programmatic callers skip it
		// because they have no cookie surface.
		v1.Use(middleware.AuthN(a.authProvider, a.repos.APIKey, a.repos.AgentKey, a.repos.User, a.cache))
		v1.Use(middleware.CSRF(a.authCfg.csrfEnabled))

		// --- Agent-reachable routes: above RequireHuman ---
		//
		// The MCP endpoint is the ONLY thing a delegated agent key can reach.
		// Its own handler additionally refuses human and API-key callers, so
		// the two principals never cross in either direction.
		mcpServer := mcp.New(mcp.Deps{
			Hosts:           hostRes,
			Credentials:     credRes,
			Hashes:          hashRes,
			Tasks:           taskRes,
			WikiDocs:        wikiDocRes,
			Timeline:        timelineRes,
			OperationRepo:   a.repos.Operation,
			WikiFileRepo:    a.repos.WikiFile,
			AgentActionRepo: a.repos.AgentAction,
			WikiDocRepo:     a.repos.WikiDocument,
			CredentialRepo:  a.repos.Credential,
			UserRepo:        a.repos.User,
			Files:           wikiFileCtrl,
			Images:          wikiImageCtrl,
			Skills:          a.skillService,
			Cache:           a.cache,
			Blobs:           a.fileStore,
			Hocuspocus:      a.hpClient,
			Bus:             a.eventBus,
			Logger:          a.logger,
			CallsPerMinute:  a.env.MCPCallsPerMinute,
			WritesPerMinute: a.env.MCPWritesPerMinute,
		})
		a.mcpServer = mcpServer
		v1.POST("/mcp", mcpServer.Handler())
		// Raw-bytes form of attach_file_to_wiki_document. Agent-only like
		// /mcp, and audited as the same tool.
		v1.POST("/mcp/upload", mcpServer.UploadHandler())
		// The community skill registry, for agents. Publishing and downloading
		// move a zip, so both are plain HTTP rather than tool calls; they are
		// audited under the tool names publish_skill and download_skill.
		v1.POST("/mcp/skills/upload", mcpServer.PublishSkillHandler())
		v1.GET("/mcp/skills/download", mcpServer.DownloadSkillHandler())
		// The other two Streamable HTTP methods, answered rather than left to
		// the router's 404. A client that probes with GET and sees 404 reads
		// it as "no MCP server here"; 405 + Allow tells it to use POST.
		// OPTIONS is for browser clients' preflight.
		v1.GET("/mcp", mcpServer.MethodNotAllowedHandler())
		v1.DELETE("/mcp", mcpServer.MethodNotAllowedHandler())
		v1.OPTIONS("/mcp", mcpServer.PreflightHandler())

		// Everything below is closed to agent keys. gin.RouterGroup.Use only
		// affects routes registered after it, so this single line — rather
		// than a check inside every resolver — is what confines an agent to
		// the MCP surface. Do not move route registrations above it without
		// meaning to widen the agent blast radius.
		v1.Use(middleware.RequireHuman())

		// The agent skill: generated from the live tool registry so an
		// operator's installed copy always matches this server. Below
		// RequireHuman because a skill is installed by a person into their own
		// client — it cannot be delivered over MCP.
		v1.GET("/mcp/skill", middleware.RBAC(permissions.BasicPermission), mcpServer.SkillHandler())

		// The community skill registry, for operators. Publishing is open to
		// anyone who can sign in: a name is claimed by whoever takes it first
		// and only they can publish new versions of it, which is the whole
		// of the trust model. Listing and the small mutations are GraphQL.
		skillCtrl := controller.NewSkillController(a.skillService, a.logger)
		v1.POST("/skills", middleware.RBAC(permissions.BasicPermission), skillCtrl.Publish)
		v1.GET("/skills/:name/download", middleware.RBAC(permissions.BasicPermission), skillCtrl.Download)

		v1.GET("/login/me", middleware.RBAC(permissions.BasicPermission), authCtrl.Me)
		v1.POST("/logout", middleware.RBAC(permissions.BasicPermission), authCtrl.Logout)

		// Wiki collab ticket (protected by JWT, issues short-lived ticket for Hocuspocus)
		wikiGroup := v1.Group("/wiki")
		// Every route below authorizes against the operation named in the
		// request; the memo lets those checks share one fetch. Scoped to this
		// group rather than v1 because /graphql/ws lives on v1 and holds its
		// request context open for the life of the socket.
		wikiGroup.Use(middleware.OperationMemo())
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

		// Wiki transfer jobs. Role checks live in the handlers since they
		// depend on the operation named in the request. GETs bypass CSRF
		// so the download link works as a plain navigation.
		wikiGroup.POST("/transfer/exports", wikiTransferCtrl.StartExport)
		wikiGroup.POST("/transfer/imports", wikiTransferCtrl.StartImport)
		wikiGroup.GET("/transfer/jobs", wikiTransferCtrl.ListJobs)
		wikiGroup.GET("/transfer/jobs/:id", wikiTransferCtrl.GetJob)
		wikiGroup.GET("/transfer/jobs/:id/download", wikiTransferCtrl.Download)

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
			userRes, opRes, sessRes, wikiDocRes, wikiVisitRes, credRes, hashRes, hostRes, taskRes, timelineRes, apiKeyRes, agentKeyRes, focusRes, agentActionRes, moduleRes, skillRes,
			a.eventBus,
			a.repos.User, a.repos.Operation, a.repos.Session, a.repos.WikiDocument, a.repos.Credential, a.repos.Hash, a.repos.Host, a.repos.Task, a.repos.ModuleRegistry,
			a.presenceTracker,
			a.env.CORSAllowedOrigins,
		)
		v1.POST("/graphql", gqlHandler)
		v1.GET("/graphql/ws", gqlHandler)

	}

	return r
}

// oidcStatus is the /status view of the SSO option, evaluated per request
// because discovery can succeed later than boot.
func (a *App) oidcStatus() responses.OIDCStatus {
	if a.oidcProvider == nil {
		return responses.OIDCStatus{}
	}
	st := responses.OIDCStatus{
		Enabled:     true,
		DisplayName: a.env.OIDC.DisplayName,
		LoginURL:    controller.OIDCLoginPath,
	}
	if err := a.oidcProvider.Status(); err != nil {
		st.UnavailableReason = "identity provider unreachable"
	}
	return st
}

func healthcheck(c *gin.Context) {
	c.JSON(http.StatusOK, responses.SuccessResponse{Message: "ok"})
}
