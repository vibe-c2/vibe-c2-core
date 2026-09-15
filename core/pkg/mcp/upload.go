package mcp

import (
	"context"
	"io"
	"mime/multipart"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/middleware"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
)

// uploadToolName is how the endpoint appears in the audit trail and the
// activity rail: the same action as the base64 tool, because it is.
const uploadToolName = "attach_file_to_wiki_document"

// uploadMultipartMemory is how much of a multipart body gin keeps in memory
// before spilling to disk. The ingest paths cap the file size themselves.
const uploadMultipartMemory = 8 << 20

// UploadHandler is POST /api/v1/mcp/upload: the multipart form of
// attach_file_to_wiki_document, for agents that can send raw bytes.
//
// Base64 inside a JSON tool argument inflates a screenshot by a third and is
// decoded into a second copy before the ingest path sees it; multipart streams
// the bytes once. Everything else is the tool: the same agent-only gate as
// the MCP endpoint, the same rate limit, write gate and audit row via invoke
// and record, and the same JSON result with the markdown line to paste.
//
// Fields: documentId, file (with its filename), and optionally as (image or
// attachment). Errors come back as JSON with the same wording a tool refusal
// carries, so an agent reads them the same way.
func (s *Server) UploadHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !middleware.HasAgentAuth(c) {
			c.AbortWithStatusJSON(http.StatusForbidden, responses.ErrForbidden)
			return
		}
		auth, err := authInfoFromGin(c)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, responses.ErrForbidden)
			return
		}
		ctx := gqlctx.WithOperationMemo(gqlctx.WithAuthInfo(c.Request.Context(), auth))

		if err := c.Request.ParseMultipartForm(uploadMultipartMemory); err != nil {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("expected a multipart/form-data body: %s", err.Error()))
			return
		}
		docID := c.PostForm("documentId")
		if docID == "" {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("documentId is required"))
			return
		}
		header, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("file is required"))
			return
		}
		raw, err := readFormFile(header)
		if err != nil {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("could not read file: %s", err.Error()))
			return
		}

		args := attachBytesArgs{
			DocumentID: docID,
			Filename:   header.Filename,
			As:         c.PostForm("as"),
			Raw:        raw,
		}

		started := time.Now()
		result, err := invoke(ctx, s, uploadToolName, writeTool, args, func(ctx context.Context, s *Server, a attachBytesArgs) (toolResult, error) {
			return attachBytes(ctx, s, a)
		})
		s.record(ctx, auditEntry{
			tool:     uploadToolName,
			kind:     writeTool,
			args:     uploadAuditArgs{DocumentID: docID, Filename: header.Filename, As: args.As, SizeBytes: int64(len(raw))},
			result:   result,
			err:      err,
			duration: time.Since(started),
		})

		if err != nil {
			status := http.StatusInternalServerError
			if isRefusal(err) {
				status = http.StatusUnprocessableEntity
			}
			c.JSON(status, responses.NewErrorResponse("%s", err.Error()))
			return
		}
		c.JSON(http.StatusCreated, result.Payload)
	}
}

// uploadAuditArgs is what the audit row records for an upload: the shape of
// the request, never the bytes.
type uploadAuditArgs struct {
	DocumentID string `json:"document_id"`
	Filename   string `json:"filename"`
	As         string `json:"as,omitempty"`
	SizeBytes  int64  `json:"size_bytes"`
}

func readFormFile(header *multipart.FileHeader) ([]byte, error) {
	f, err := header.Open()
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(f)
}
