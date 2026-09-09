package mcp

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/middleware"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"go.uber.org/zap"
)

// SkillHandler serves the generated skill bundle as a zip.
//
// Mounted for humans, not agents: a skill is installed by the operator into
// their own client, and cannot be pushed over MCP. What the server can do is
// make that one download and keep it matching the running version.
func (s *Server) SkillHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		filename := SkillName + "-skill.zip"
		c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
		c.Header("Content-Type", "application/zip")
		// The bundle is generated per request from the live tool registry, so
		// it must not be cached anywhere between here and the operator.
		c.Header("Cache-Control", "no-store")

		if err := s.SkillZip(c.Writer); err != nil {
			s.deps.Logger.Error("mcp: failed to write skill bundle", zap.Error(err))
			// The status is already committed by the time a zip fails
			// mid-write, so there is nothing useful to send; log and stop.
			return
		}
	}
}

// Handler serves the MCP endpoint at POST /api/v1/mcp.
//
// Stateless mode is deliberate. An agent key is a bearer credential presented
// on every request, there is nothing for the server to push back, and a
// session would only add state to lose. It also means the SDK connects each
// request with that request's context, which is how per-caller identity
// reaches the tool handlers.
func (s *Server) Handler() gin.HandlerFunc {
	streamable := mcp.NewStreamableHTTPHandler(
		func(*http.Request) *mcp.Server { return s.server },
		&mcp.StreamableHTTPOptions{
			Stateless:    true,
			JSONResponse: true,
		},
	)

	return func(c *gin.Context) {
		// This endpoint is for agents only. A human session or an API key
		// reaching it would run the tools with no ceiling at all, since
		// AuthInfo.Agent would be nil and every cap keys off that. Refuse
		// rather than fall back to an uncapped identity.
		if !middleware.HasAgentAuth(c) {
			c.AbortWithStatusJSON(http.StatusForbidden, responses.ErrForbidden)
			return
		}

		auth, err := authInfoFromGin(c)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, responses.ErrForbidden)
			return
		}

		req := c.Request.WithContext(gqlctx.WithAuthInfo(c.Request.Context(), auth))
		streamable.ServeHTTP(c.Writer, req)
	}
}
