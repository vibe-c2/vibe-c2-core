package app

import (
	"net/http"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/controller"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/middleware"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"

	_ "github.com/vibe-c2/vibe-c2-core/core/docs"
)

// NewRouter builds the HTTP surface.
//
// Read top to bottom, this is the route table and its three security tiers.
// The two v1.Use calls between the mount functions are the tier boundaries:
// gin.RouterGroup.Use applies only to routes registered after it, so which
// function a route lives in is what decides who can reach it. See routes.go.
func (a *App) NewRouter() *gin.Engine {
	if a.env.StageStatus != "development" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(middleware.Recovery(a.logger))
	r.Use(middleware.Cors(a.env.CORSAllowedOrigins))
	r.Use(middleware.Logger(a.logger))

	c := a.buildControllers()
	res := a.buildResolvers()

	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	// Channel data-plane (machine-to-machine). Mounted at the literal contract
	// path POST /api/channel/sync — external channel modules hardcode it — and
	// kept outside the /api/v1 AuthN/CSRF chain. The handler gates each message
	// on module registration (source.module_instance must be a registered
	// instance); this is a registration check, not authentication —
	// cryptographic channel auth (shared secret / mTLS) is still a follow-up.
	channel := r.Group("/api/channel")
	channel.POST("/sync", c.channel.Sync)

	v1 := r.Group("/api/v1")

	a.mountPublicRoutes(v1, c)

	// Authentication runs first: Authorization: Bearer vc2_... resolves to an
	// API key, vca_... to a delegated agent key, or the access_token cookie is
	// validated as a JWT. CSRF then runs against the resolved identity —
	// programmatic callers skip it because they have no cookie surface.
	v1.Use(middleware.AuthN(a.authProvider, a.repos.APIKey, a.repos.AgentKey, a.repos.User, a.cache))
	v1.Use(middleware.CSRF(a.authCfg.csrfEnabled))

	a.mountAgentRoutes(v1, c, res)

	// Everything below is closed to agent keys. This single line — rather than
	// a check inside every resolver — is what confines an agent to the MCP
	// surface registered above.
	v1.Use(middleware.RequireHuman())

	a.mountHumanRoutes(v1, c, res)

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
