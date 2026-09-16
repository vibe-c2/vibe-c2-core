package mcp

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/middleware"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/skills"
	"go.uber.org/zap"
)

// The two registry actions an agent performs over plain HTTP rather than as
// tool calls, because both move a zip and a zip has no business inside a JSON
// tool argument. They are named as tools anyway: that is how they appear in
// the audit trail and the activity rail, so an operator reviewing what their
// agent did sees one vocabulary rather than two.
const (
	publishSkillToolName  = "publish_skill"
	downloadSkillToolName = "download_skill"
)

// PublishSkillHandler is POST /api/v1/mcp/skills/upload: an agent publishing
// a skill on behalf of the operator whose key it holds.
//
// The identity that matters is the owner's, not the key's. A skill an agent
// publishes is published by that person, is subject to the same name
// ownership as anything they upload themselves, and says so in its history.
// The agent key only decides whether the call is allowed at all: the write
// gate and the rate limiter both apply, through the same invoke the MCP tools
// go through.
func (s *Server) PublishSkillHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, auth, ok := s.agentContext(c)
		if !ok {
			return
		}
		if s.deps.Skills == nil {
			c.JSON(http.StatusNotImplemented, responses.NewErrorResponse("this server has no skill registry configured."))
			return
		}

		if err := c.Request.ParseMultipartForm(uploadMultipartMemory); err != nil {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("expected a multipart/form-data body: %s", err.Error()))
			return
		}
		header, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("file is required: the skill bundle, as a zip"))
			return
		}
		if header.Size > s.deps.Skills.MaxSize() {
			c.JSON(http.StatusRequestEntityTooLarge, responses.NewErrorResponse(
				"the bundle is %d bytes; the limit is %d", header.Size, s.deps.Skills.MaxSize()))
			return
		}
		raw, err := readFormFile(header)
		if err != nil {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("could not read the uploaded file: %s", err.Error()))
			return
		}

		ownerID, err := uuid.Parse(auth.UserID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, responses.ErrForbidden)
			return
		}
		var viaKey *uuid.UUID
		if agent := auth.Agent; agent != nil {
			if id, parseErr := uuid.Parse(agent.AgentKeyID); parseErr == nil {
				viaKey = &id
			}
		}

		args := publishSkillArgs{
			Name:        c.PostForm("name"),
			Description: c.PostForm("description"),
			Notes:       c.PostForm("notes"),
			SizeBytes:   int64(len(raw)),
		}
		in := skills.PublishInput{
			Name:          args.Name,
			Description:   args.Description,
			Notes:         args.Notes,
			Bytes:         raw,
			PublisherID:   ownerID,
			PublisherName: auth.Username,
			ViaAgentKeyID: viaKey,
		}

		started := time.Now()
		result, err := invoke(ctx, s, publishSkillToolName, writeTool, args,
			func(ctx context.Context, s *Server, _ publishSkillArgs) (toolResult, error) {
				published, pubErr := s.deps.Skills.Publish(ctx, in)
				if pubErr != nil {
					return toolResult{}, asRefusal(pubErr)
				}
				verb := "published version " + strconv.Itoa(published.Version.Version) + " of"
				if published.Claimed {
					verb = "claimed and published"
				}
				return toolResult{
					Payload: publishSkillView{
						Name:        published.Skill.Name,
						Version:     published.Version.Version,
						Claimed:     published.Claimed,
						SizeBytes:   published.Version.SizeBytes,
						Checksum:    published.Version.Checksum,
						DownloadURL: skillDownloadPath + "?name=" + published.Skill.Name,
						Note: "Everyone on this server can download it, and it is attributed to you. " +
							"Publishing never overwrites an earlier version; its owner can remove the whole skill.",
					},
					Summary: verb + " the skill " + published.Skill.Name,
				}, nil
			})
		s.record(ctx, auditEntry{
			tool:     publishSkillToolName,
			kind:     writeTool,
			args:     args,
			result:   result,
			err:      err,
			duration: time.Since(started),
		})
		if err != nil {
			s.writeToolError(c, err)
			return
		}
		c.JSON(http.StatusCreated, result.Payload)
	}
}

// DownloadSkillHandler is GET /api/v1/mcp/skills/download: the bundle itself,
// for an agent that found it with get_skill.
//
// A GET rather than a tool because the response is a zip. Recorded as a read
// so the operator can see which skills their agent pulled, and which version.
func (s *Server) DownloadSkillHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, auth, ok := s.agentContext(c)
		if !ok {
			return
		}
		if s.deps.Skills == nil {
			c.JSON(http.StatusNotImplemented, responses.NewErrorResponse("this server has no skill registry configured."))
			return
		}

		name := c.Query("name")
		if name == "" {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("name is required"))
			return
		}
		version := 0
		if rawVersion := c.Query("version"); rawVersion != "" {
			parsed, convErr := strconv.Atoi(rawVersion)
			if convErr != nil || parsed < 1 {
				c.JSON(http.StatusBadRequest, responses.NewErrorResponse("version must be a positive whole number"))
				return
			}
			version = parsed
		}

		args := downloadSkillArgs{Name: name, Version: version}

		// The lookup runs inside invoke so it is rate limited and audited like
		// any other read; the bytes are streamed afterwards, outside it,
		// because a tool result is not where a zip belongs.
		var (
			body io.ReadCloser
			file string
			size int64
		)
		started := time.Now()
		result, err := invoke(ctx, s, downloadSkillToolName, readTool, args,
			func(ctx context.Context, s *Server, a downloadSkillArgs) (toolResult, error) {
				stream, skill, row, dlErr := s.deps.Skills.Download(ctx, a.Name, a.Version)
				if dlErr != nil {
					return toolResult{}, asRefusal(dlErr)
				}
				body, file, size = stream, skills.Filename(skill.Name, row.Version), row.SizeBytes
				if ownerID, parseErr := uuid.Parse(auth.UserID); parseErr == nil {
					s.deps.Skills.RecordDownload(ctx, ownerID, skill.SkillID, row.Version)
				}
				return toolResult{Summary: "downloaded the skill " + skill.Name}, nil
			})
		s.record(ctx, auditEntry{
			tool:     downloadSkillToolName,
			kind:     readTool,
			args:     args,
			result:   result,
			err:      err,
			duration: time.Since(started),
		})
		if err != nil {
			s.writeToolError(c, err)
			return
		}
		defer body.Close()

		c.Header("Content-Type", "application/zip")
		c.Header("Content-Disposition", `attachment; filename="`+file+`"`)
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Cache-Control", "private, no-store")
		if size > 0 {
			c.Header("Content-Length", strconv.FormatInt(size, 10))
		}
		c.Status(http.StatusOK)
		if _, copyErr := io.Copy(c.Writer, body); copyErr != nil {
			c.Error(copyErr) //nolint:errcheck // gin records it for the request log
		}
	}
}

// agentContext runs the gate every agent-authenticated endpoint shares: agent
// key present, identity resolvable, context carrying both.
func (s *Server) agentContext(c *gin.Context) (context.Context, gqlctx.AuthInfo, bool) {
	if !middleware.HasAgentAuth(c) {
		c.AbortWithStatusJSON(http.StatusForbidden, responses.ErrForbidden)
		return nil, gqlctx.AuthInfo{}, false
	}
	auth, err := authInfoFromGin(c)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusForbidden, responses.ErrForbidden)
		return nil, gqlctx.AuthInfo{}, false
	}
	return gqlctx.WithOperationMemo(gqlctx.WithAuthInfo(c.Request.Context(), auth)), auth, true
}

// writeToolError gives an agent the same distinction over HTTP that it gets
// over MCP: a refusal is something to act on, anything else is a fault.
func (s *Server) writeToolError(c *gin.Context, err error) {
	status := http.StatusInternalServerError
	// The registry's own status wins where it has one: a missing skill should
	// read as a 404 over HTTP even though the audit trail files it as a
	// refusal. Everything else a tool refuses is a 422, as it is on /mcp.
	var svcErr *skills.Error
	switch {
	case errors.As(err, &svcErr) && svcErr.IsPolicy():
		status = svcErr.Status
	case isRefusal(err):
		status = http.StatusUnprocessableEntity
	}
	if status >= 500 && s.deps.Logger != nil {
		// A fault an agent hit is a fault nobody is watching for. Without
		// this the only record of a failed publish is the audit row's
		// outcome, which says that it broke and not why.
		s.deps.Logger.Error("mcp: skill registry request failed",
			zap.String("path", c.FullPath()), zap.Error(err))
	}
	c.JSON(status, responses.NewErrorResponse("%s", err.Error()))
}

// publishSkillArgs is what the audit row records: the shape of the request,
// never the bytes.
type publishSkillArgs struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Notes       string `json:"notes,omitempty"`
	SizeBytes   int64  `json:"size_bytes"`
}

type downloadSkillArgs struct {
	Name    string `json:"name"`
	Version int    `json:"version,omitempty"`
}

type publishSkillView struct {
	Name        string `json:"name"`
	Version     int    `json:"version"`
	Claimed     bool   `json:"claimed"`
	SizeBytes   int64  `json:"sizeBytes"`
	Checksum    string `json:"checksum"`
	DownloadURL string `json:"downloadUrl"`
	Note        string `json:"note"`
}
