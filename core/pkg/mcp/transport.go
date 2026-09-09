package mcp

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/middleware"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
)

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
