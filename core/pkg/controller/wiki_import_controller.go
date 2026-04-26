package controller

import (
	"archive/zip"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/authorization"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikiimport"
	"go.uber.org/zap"
)

// WikiImportControllerConfig groups the import-flow limits the controller
// enforces before handing the zip off to the parser.
type WikiImportControllerConfig struct {
	// MaxZipSize caps the total uncompressed zip size, in bytes. Anything
	// larger gets a 413. Recommend ~200 MiB for v1.
	MaxZipSize int64
}

// WikiImportController handles POST /api/v1/wiki/import/outline. It owns
// auth, body limits, and zip extraction; the heavy lifting (parsing the
// tree, ingesting attachments, calling the Hocuspocus sidecar to convert
// markdown to Y.js bytes, and persisting documents) is delegated to
// wikiimport.Orchestrator.
type WikiImportController struct {
	orchestrator *wikiimport.Orchestrator
	opRepo       repository.IOperationRepository
	logger       *zap.Logger
	cfg          WikiImportControllerConfig
}

// NewWikiImportController wires the orchestrator and operation repository
// into a gin handler.
func NewWikiImportController(
	orchestrator *wikiimport.Orchestrator,
	opRepo repository.IOperationRepository,
	logger *zap.Logger,
	cfg WikiImportControllerConfig,
) *WikiImportController {
	return &WikiImportController{
		orchestrator: orchestrator,
		opRepo:       opRepo,
		logger:       logger,
		cfg:          cfg,
	}
}

// UploadOutlineExport handles POST /api/v1/wiki/import/outline.
//
//	@Summary		Import an Outline workspace export
//	@Description	Imports an Outline (getoutline.com) markdown-format export zip into the target operation. All imported documents land under import/<ISO timestamp>/<collection>/. Requires operator+ role.
//	@Tags			Wiki
//	@Accept			multipart/form-data
//	@Produce		json
//	@Security		BearerAuth
//	@Param			operationId	query		string	true	"Target operation ID (UUID)"
//	@Param			file		formData	file	true	"Outline markdown export zip"
//	@Success		200			{object}	wikiimport.Report
//	@Failure		400			{object}	responses.ErrorResponse
//	@Failure		403			{object}	responses.ErrorResponse
//	@Failure		413			{object}	responses.ErrorResponse
//	@Failure		502			{object}	responses.ErrorResponse
//	@Router			/wiki/import/outline [post]
func (wic *WikiImportController) UploadOutlineExport(c *gin.Context) {
	opIDStr := c.Query("operationId")
	opID, err := uuid.Parse(opIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid operationId"))
		return
	}

	// Operator+ check, mirroring the gate on every doc-creating GraphQL
	// mutation. Viewers can't trigger an import.
	op, err := wic.opRepo.FindByID(c.Request.Context(), opID)
	if err != nil {
		c.JSON(http.StatusNotFound, responses.NewErrorResponse("operation not found"))
		return
	}
	if !wic.callerCanImport(c, &op) {
		c.JSON(http.StatusForbidden, responses.ErrForbidden)
		return
	}

	callerID, err := uuid.Parse(c.GetString("userID"))
	if err != nil {
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("file is required"))
		return
	}
	if wic.cfg.MaxZipSize > 0 && fileHeader.Size > wic.cfg.MaxZipSize {
		c.JSON(http.StatusRequestEntityTooLarge, responses.NewErrorResponse(
			"zip exceeds maximum size of %d bytes", wic.cfg.MaxZipSize))
		return
	}

	src, err := fileHeader.Open()
	if err != nil {
		wic.logger.Error("Failed to open uploaded zip", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}
	defer src.Close()

	// Copy to a temp file on disk before opening with archive/zip — the
	// stdlib zip reader needs a ReaderAt, which a multipart stream isn't.
	tmp, err := os.CreateTemp("", "outline-import-*.zip")
	if err != nil {
		wic.logger.Error("Temp file create failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}
	tmpPath := tmp.Name()
	defer func() {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
	}()

	limit := wic.cfg.MaxZipSize
	if limit <= 0 {
		limit = 1 << 30 // 1 GiB hard ceiling when not configured
	}
	written, err := io.Copy(tmp, io.LimitReader(src, limit+1))
	if err != nil {
		wic.logger.Error("Spool to temp failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}
	if written > limit {
		c.JSON(http.StatusRequestEntityTooLarge, responses.NewErrorResponse(
			"zip exceeds maximum size of %d bytes", limit))
		return
	}

	zr, err := zip.OpenReader(tmpPath)
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid zip: %v", err))
		return
	}
	defer zr.Close()

	parsed, err := wikiimport.Parse(&zr.Reader)
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("parse export: %v", err))
		return
	}

	report, err := wic.orchestrator.Run(c.Request.Context(), opID, callerID, parsed)
	if err != nil {
		// A sidecar-unavailable failure surfaces here as a converter
		// error wrapped by the orchestrator. Map to 502 so operators
		// know to check the sidecar; the partial-import contract still
		// applies (the timestamp folder may have stub docs).
		if isSidecarUnavailable(err) {
			c.JSON(http.StatusBadGateway, responses.NewErrorResponse(
				"hocuspocus sidecar unavailable: %v", err))
			return
		}
		wic.logger.Error("Outline import failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.NewErrorResponse(
			"import failed: %v", err))
		return
	}

	wic.logger.Info("Outline import complete",
		zap.String("operation_id", opID.String()),
		zap.String("caller_id", callerID.String()),
		zap.Int("created", report.CreatedDocs),
		zap.Int("skipped", report.SkippedDocs),
		zap.Int("images", report.ImagesIngested),
		zap.Int("files", report.FilesIngested),
	)
	c.JSON(http.StatusOK, report)
}

// callerCanImport returns true when the caller can run an import for the
// operation. Mirrors the operator+ gate used by createWikiDocument and the
// upload controllers.
func (wic *WikiImportController) callerCanImport(c *gin.Context, op *models.Operation) bool {
	if isAppAdminFromContext(c) {
		return true
	}
	rolesSlice, _ := c.Get("roles")
	ctx := gqlctx.WithAuthInfo(c.Request.Context(), gqlctx.AuthInfo{
		UserID:   c.GetString("userID"),
		Username: c.GetString("username"),
		Roles:    toStringSlice(rolesSlice),
	})
	return authorization.AuthorizeOperationRole(ctx, op, models.OperationRoleOperator) == nil
}

// isSidecarUnavailable detects orchestrator errors caused by the Hocuspocus
// sidecar being unreachable. Used to surface a 502 rather than a generic
// 500 so operators know which dependency to investigate.
func isSidecarUnavailable(err error) bool {
	if err == nil {
		return false
	}
	// HocuspocusClient.MarkdownToYjs wraps transport failures with the
	// "call hocuspocus markdown-to-yjs:" prefix. Cheap substring check
	// here avoids exposing the client error type to the import package.
	var netErr interface{ Timeout() bool }
	if errors.As(err, &netErr) {
		return true
	}
	msg := err.Error()
	return strings.Contains(msg, "call hocuspocus markdown-to-yjs") ||
		strings.Contains(msg, "connection refused") ||
		strings.Contains(msg, "no such host")
}
