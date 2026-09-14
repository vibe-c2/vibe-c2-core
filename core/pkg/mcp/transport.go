package mcp

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/mcp/skillchangelog"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/middleware"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
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
		s.recordSkillDownload(c)
	}
}

// recordSkillDownload notes which release the caller just received.
//
// This is what the update prompt in the app is built on: it compares this
// record with the current release, and stays silent for anyone who has never
// downloaded. Recorded after the bytes are written so a failed download does
// not count, and only logged on failure because the operator already has
// what they asked for.
func (s *Server) recordSkillDownload(c *gin.Context) {
	if s.deps.UserRepo == nil {
		return
	}
	uid, err := uuid.Parse(c.GetString("userID"))
	if err != nil {
		s.deps.Logger.Warn("mcp: skill download without a user id; not recorded", zap.Error(err))
		return
	}
	download := models.SkillDownload{
		Version:      skillchangelog.Current(),
		DownloadedAt: time.Now().UTC(),
	}
	// The repository filters on UserID alone, so a shell user is enough to
	// address the row without a read first.
	err = s.deps.UserRepo.Update(c.Request.Context(), &models.User{UserID: uid}, map[string]interface{}{
		"skill_download": download,
	})
	if err != nil {
		s.deps.Logger.Error("mcp: failed to record skill download",
			zap.String("user_id", uid.String()), zap.Error(err))
	}
}

// allowedMCPMethods is what /api/v1/mcp answers to. POST carries every
// message; OPTIONS exists for preflight. Declared once so the Allow header
// and the routing cannot disagree.
const allowedMCPMethods = "POST, OPTIONS"

// MethodNotAllowedHandler answers GET and DELETE on the MCP endpoint.
//
// Streamable HTTP defines three methods: POST for messages, GET to open a
// server-to-client SSE stream, and DELETE to end a session. In stateless mode
// with JSON responses there is no stream to open and no session to end, so
// only POST is implemented — which is allowed, provided the other two are
// refused correctly.
//
// Correctly means 405 with an Allow header, not 404. Gin returns 404 for a
// path registered under a different method, and a client that probes with GET
// reads that as "there is no MCP server here" and stops, rather than "that
// method is not offered, use POST". The endpoint worked the whole time; it
// just said the wrong thing to anyone who knocked on the wrong door.
func (s *Server) MethodNotAllowedHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Allow", allowedMCPMethods)
		c.JSON(http.StatusMethodNotAllowed, gin.H{
			"error": "this MCP endpoint carries every message over POST; " +
				"it runs stateless, so there is no SSE stream to GET and no session to DELETE",
		})
	}
}

// PreflightHandler answers a CORS preflight for the MCP endpoint.
//
// Only a browser-based client sends one — Cursor and other desktop clients
// run in Node and never preflight. It is here so that such a client gets an
// answer instead of a 404 from the router.
func (s *Server) PreflightHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Allow", allowedMCPMethods)
		c.Status(http.StatusNoContent)
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

		ctx := gqlctx.WithAuthInfo(c.Request.Context(), auth)
		// One operation fetch per request, shared by the tool's own check and
		// the resolver's.
		ctx = gqlctx.WithOperationMemo(ctx)
		req := c.Request.WithContext(ctx)
		streamable.ServeHTTP(c.Writer, req)
	}
}
