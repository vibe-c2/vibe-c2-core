package app

import (
	"github.com/gin-gonic/gin"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/permissions"
	gql "github.com/vibe-c2/vibe-c2-core/core/pkg/graphql"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/middleware"
)

// Route tiers.
//
// The /api/v1 chain has three of them, and membership is decided purely by
// where a route is registered relative to two Use calls — gin.RouterGroup.Use
// applies only to routes added after it. That made the boundaries invisible in
// a single long function; they are function calls now, in order:
//
//	mountPublicRoutes   — no authentication at all
//	  v1.Use(AuthN, CSRF)
//	mountAgentRoutes    — the only surface a delegated agent key can reach
//	  v1.Use(RequireHuman)
//	mountHumanRoutes    — everything else
//
// Moving a route between these functions changes who can reach it. The route
// table and the tier each route lands in are asserted in router_smoke_test.go.

// mountPublicRoutes registers everything reachable without credentials. These
// either initiate the session (so there is nothing to authenticate yet) or
// carry their own proof — the Hocuspocus webhook is HMAC-validated.
func (a *App) mountPublicRoutes(v1 *gin.RouterGroup, c *controllers) {
	v1.GET("/", healthcheck)
	v1.GET("/status", c.status.Status)
	v1.POST("/enroll", c.enroll.Enroll)
	v1.POST("/login", c.auth.Login)

	// SSO start + provider callback. Both are top-level GET navigations with
	// no cookie-authenticated state to protect, so they sit outside AuthN and
	// CSRF; the sealed handshake cookie + state + PKCE bind the callback to
	// the browser that started the flow.
	if c.oidc != nil {
		v1.GET("/auth/oidc/login", c.oidc.Login)
		v1.GET("/auth/oidc/callback", c.oidc.Callback)
	}

	// /login/refresh requires the CSRF double-submit cookie (set on the
	// previous login/refresh) but no JWT — the access cookie may already be
	// expired by the time refresh is called.
	v1.POST("/login/refresh", middleware.CSRF(a.authCfg.csrfEnabled), c.auth.Refresh)

	// Internal webhook endpoint: not behind AuthN, behind HMAC validation.
	internal := v1.Group("/internal")
	internal.POST("/wiki/webhook", c.webhook.Handle)

	// GraphQL Playground — browser-based IDE for testing queries (dev only).
	// Served publicly so browsers can load the page without auth cookies; the
	// queries it then sends go through POST /graphql, which is protected.
	if a.env.StageStatus == "development" {
		v1.GET("/graphql", gql.NewPlaygroundHandler("/api/v1/graphql"))
	}
}

// mountAgentRoutes registers the MCP surface — the only thing a delegated
// agent key can reach. It is mounted above RequireHuman for that reason, and
// the handlers additionally refuse human and API-key callers, so the two
// principals never cross in either direction.
//
// Adding a route here widens the agent blast radius. That is the whole
// decision this function exists to make explicit.
func (a *App) mountAgentRoutes(v1 *gin.RouterGroup, c *controllers, res *resolvers) {
	mcpServer := mcp.New(mcp.Deps{
		Hosts:           res.host,
		Credentials:     res.credential,
		Hashes:          res.hash,
		Tasks:           res.task,
		WikiDocs:        res.wikiDoc,
		Timeline:        res.timeline,
		OperationRepo:   a.repos.Operation,
		WikiFileRepo:    a.repos.WikiFile,
		AgentActionRepo: a.repos.AgentAction,
		WikiDocRepo:     a.repos.WikiDocument,
		CredentialRepo:  a.repos.Credential,
		UserRepo:        a.repos.User,
		Files:           c.wikiFile,
		Images:          c.wikiImage,
		Skills:          a.skillService,
		Cache:           a.cache,
		Blobs:           a.fileStore,
		Hocuspocus:      a.hpClient,
		Bus:             a.eventBus,
		Logger:          a.logger,
		CallsPerMinute:  a.env.MCPCallsPerMinute,
		WritesPerMinute: a.env.MCPWritesPerMinute,
	})
	// Kept on the App so its audit queue can be drained at shutdown.
	a.mcpServer = mcpServer

	v1.POST("/mcp", mcpServer.Handler())
	// Raw-bytes form of attach_file_to_wiki_document. Agent-only like /mcp,
	// and audited as the same tool.
	v1.POST("/mcp/upload", mcpServer.UploadHandler())
	// The community skill registry, for agents. Publishing and downloading
	// move a zip, so both are plain HTTP rather than tool calls; they are
	// audited under the tool names publish_skill and download_skill.
	v1.POST("/mcp/skills/upload", mcpServer.PublishSkillHandler())
	v1.GET("/mcp/skills/download", mcpServer.DownloadSkillHandler())
	// The other two Streamable HTTP methods, answered rather than left to the
	// router's 404. A client that probes with GET and sees 404 reads it as
	// "no MCP server here"; 405 + Allow tells it to use POST. OPTIONS is for
	// browser clients' preflight.
	v1.GET("/mcp", mcpServer.MethodNotAllowedHandler())
	v1.DELETE("/mcp", mcpServer.MethodNotAllowedHandler())
	v1.OPTIONS("/mcp", mcpServer.PreflightHandler())
}

// mountHumanRoutes registers everything closed to agent keys. It runs after
// v1.Use(RequireHuman), which is what confines an agent to the MCP surface —
// a single line rather than a check inside every resolver.
func (a *App) mountHumanRoutes(v1 *gin.RouterGroup, c *controllers, res *resolvers) {
	// The agent skill: generated from the live tool registry so an operator's
	// installed copy always matches this server. Human-only because a skill is
	// installed by a person into their own client — it cannot be delivered
	// over MCP.
	v1.GET("/mcp/skill", middleware.RBAC(permissions.BasicPermission), a.mcpServer.SkillHandler())

	// The community skill registry, for operators. Publishing is open to
	// anyone who can sign in: a name is claimed by whoever takes it first and
	// only they can publish new versions of it, which is the whole of the
	// trust model. Listing and the small mutations are GraphQL.
	v1.POST("/skills", middleware.RBAC(permissions.BasicPermission), c.skill.Publish)
	v1.GET("/skills/:name/download", middleware.RBAC(permissions.BasicPermission), c.skill.Download)

	v1.GET("/login/me", middleware.RBAC(permissions.BasicPermission), c.auth.Me)
	v1.POST("/logout", middleware.RBAC(permissions.BasicPermission), c.auth.Logout)

	a.mountWikiRoutes(v1, c)
	a.mountGraphQLRoutes(v1, res)
}

// mountWikiRoutes registers the wiki REST surface. Every route here authorizes
// against the operation named in the request, so the group carries the
// operation memo — scoped to this group rather than v1 because /graphql/ws
// lives on v1 and holds its request context open for the life of the socket.
func (a *App) mountWikiRoutes(v1 *gin.RouterGroup, c *controllers) {
	wikiGroup := v1.Group("/wiki")
	wikiGroup.Use(middleware.OperationMemo())

	// Collab ticket: protected by JWT, issues a short-lived ticket for
	// Hocuspocus.
	wikiGroup.POST("/collab-ticket", c.wiki.CollabTicket)

	// Wiki image uploads & proxy reads. GET bypasses CSRF (safe method) and
	// authenticates via the httpOnly access_token cookie so `<img>` tags
	// resolve natively without custom headers.
	wikiGroup.POST("/images", c.wikiImage.Upload)
	wikiGroup.GET("/images/:id", c.wikiImage.Download)

	// Wiki file attachments (non-image files). Same auth/CSRF model as images;
	// GET authenticates via the cookie so download/preview links work without
	// custom headers.
	wikiGroup.POST("/files", c.wikiFile.Upload)
	wikiGroup.GET("/files/:id", c.wikiFile.Download)

	// Wiki transfer jobs. Role checks live in the handlers since they depend
	// on the operation named in the request. GETs bypass CSRF so the download
	// link works as a plain navigation.
	wikiGroup.POST("/transfer/exports", c.transfer.StartExport)
	wikiGroup.POST("/transfer/imports", c.transfer.StartImport)
	wikiGroup.GET("/transfer/jobs", c.transfer.ListJobs)
	wikiGroup.GET("/transfer/jobs/:id", c.transfer.GetJob)
	wikiGroup.GET("/transfer/jobs/:id/download", c.transfer.Download)
}

// mountGraphQLRoutes registers the GraphQL endpoint — all queries, mutations
// and subscriptions.
//
// Authentication comes from the AuthN middleware above, the same as REST.
// Authorization is the @hasPermission directive inside the schema, where each
// query and mutation declares what it needs.
//
//	/graphql (POST)   — queries, mutations, and legacy SSE subscriptions
//	/graphql/ws (GET) — graphql-transport-ws WebSocket transport. The Upgrade
//	                    header routes it to the WS transport inside gqlgen;
//	                    one socket multiplexes every active subscription on
//	                    the page.
func (a *App) mountGraphQLRoutes(v1 *gin.RouterGroup, res *resolvers) {
	gqlHandler := gql.NewHandler(
		res.user, res.operation, res.session, res.wikiDoc, res.wikiVisit,
		res.credential, res.hash, res.host, res.task, res.timeline,
		res.apiKey, res.agentKey, res.focus, res.agentAction, res.module, res.skill,
		a.eventBus,
		a.repos.User, a.repos.Operation, a.repos.Session, a.repos.WikiDocument,
		a.repos.Credential, a.repos.Hash, a.repos.Host, a.repos.Task, a.repos.ModuleRegistry,
		a.presenceTracker,
		a.env.CORSAllowedOrigins,
	)
	v1.POST("/graphql", gqlHandler)
	v1.GET("/graphql/ws", gqlHandler)
}
