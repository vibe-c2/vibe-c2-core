package controller

import (
	"archive/zip"
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/authorization"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikiexport"
	"go.uber.org/zap"
)

// WikiExportController handles GET /api/v1/wiki/export. It enforces auth,
// resolves the export scope, and streams the resulting zip directly to
// the response writer. The heavy lifting lives in wikiexport.Orchestrator.
type WikiExportController struct {
	orchestrator *wikiexport.Orchestrator
	docRepo      repository.IWikiDocumentRepository
	opRepo       repository.IOperationRepository
	logger       *zap.Logger
}

// NewWikiExportController wires the orchestrator and read-side repos into a
// gin handler.
func NewWikiExportController(
	orchestrator *wikiexport.Orchestrator,
	docRepo repository.IWikiDocumentRepository,
	opRepo repository.IOperationRepository,
	logger *zap.Logger,
) *WikiExportController {
	return &WikiExportController{
		orchestrator: orchestrator,
		docRepo:      docRepo,
		opRepo:       opRepo,
		logger:       logger,
	}
}

// Export handles GET /api/v1/wiki/export.
//
//	@Summary		Export a wiki tree or subtree as an Outline-flavored markdown zip
//	@Description	Streams a zip archive of markdown documents plus referenced attachments. The format matches the import flow so the result can be re-imported via POST /api/v1/wiki/import/outline. Pass `rootId` to limit the export to one document + descendants; omit it to export the whole operation's wiki.
//	@Tags			Wiki
//	@Produce		application/zip
//	@Security		BearerAuth
//	@Param			operationId	query		string	true	"Target operation ID (UUID)"
//	@Param			rootId		query		string	false	"Subtree root document ID (UUID). Omit for tree-wide export."
//	@Success		200			{file}		zip
//	@Failure		400			{object}	responses.ErrorResponse
//	@Failure		403			{object}	responses.ErrorResponse
//	@Failure		404			{object}	responses.ErrorResponse
//	@Router			/wiki/export [get]
func (wec *WikiExportController) Export(c *gin.Context) {
	opIDStr := c.Query("operationId")
	opID, err := uuid.Parse(opIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid operationId"))
		return
	}

	op, err := wec.opRepo.FindByID(c.Request.Context(), opID)
	if err != nil {
		c.JSON(http.StatusNotFound, responses.NewErrorResponse("operation not found"))
		return
	}

	if !wec.callerIsOperationMember(c, &op) {
		c.JSON(http.StatusForbidden, responses.ErrForbidden)
		return
	}

	req := wikiexport.Request{
		OperationID:   opID,
		OperationName: op.Name,
	}

	if rootIDStr := c.Query("rootId"); rootIDStr != "" {
		rootID, err := uuid.Parse(rootIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid rootId"))
			return
		}
		// Validate the subtree root belongs to the operation BEFORE we
		// start streaming — once headers go out we can't return JSON
		// error.
		root, err := wec.docRepo.FindByID(c.Request.Context(), rootID)
		if err != nil {
			c.JSON(http.StatusNotFound, responses.NewErrorResponse("subtree root not found"))
			return
		}
		if root.OperationID != opID {
			c.JSON(http.StatusForbidden, responses.ErrForbidden)
			return
		}
		if root.DeletedAt != nil {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("subtree root is in trash"))
			return
		}
		req.RootID = &rootID
	}

	// Stream the zip directly to the response. From this point on we own
	// the writer; any failure means a half-written zip but we surface the
	// reason via EXPORT_REPORT.json so the user can see what went wrong.
	filename := buildExportFilename(&op, req.RootID, c, wec.docRepo)
	c.Header("Content-Type", "application/zip")
	c.Header(
		"Content-Disposition",
		`attachment; filename="`+filename+`"; filename*=UTF-8''`+url.PathEscape(filename),
	)
	c.Header("Cache-Control", "no-store")
	c.Status(http.StatusOK)

	zw := zip.NewWriter(c.Writer)
	defer func() {
		if err := zw.Close(); err != nil {
			wec.logger.Warn("zip close failed", zap.Error(err))
		}
	}()

	report, err := wec.orchestrator.Run(c.Request.Context(), zw, req)
	if err != nil {
		// Best-effort: include the error in the report sidecar; the zip
		// has already started so we can't change the status code.
		wec.logger.Error("Wiki export failed",
			zap.String("operation_id", opID.String()),
			zap.Error(err),
		)
		_ = writeReport(zw, &wikiexport.Report{
			Scope: scopeLabel(req.RootID),
			Skipped: []wikiexport.SkipRecord{
				{Path: "(export)", Reason: "fatal: " + err.Error()},
			},
		})
		return
	}

	if err := writeReport(zw, report); err != nil {
		wec.logger.Warn("write export report failed", zap.Error(err))
	}
	wec.logger.Info("Wiki export complete",
		zap.String("operation_id", opID.String()),
		zap.Int("total", report.TotalDocs),
		zap.Int("exported", report.ExportedDocs),
		zap.Int("skipped", report.SkippedDocs),
		zap.Int("images", report.ImagesExported),
		zap.Int("files", report.FilesExported),
	)
}

// callerIsOperationMember authorises read-side export. Mirrors the read
// gate used by image/file Download — viewer+ or app-admin.
func (wec *WikiExportController) callerIsOperationMember(c *gin.Context, op *models.Operation) bool {
	if isAppAdminFromContext(c) {
		return true
	}
	rolesSlice, _ := c.Get("roles")
	ctx := gqlctx.WithAuthInfo(c.Request.Context(), gqlctx.AuthInfo{
		UserID:   c.GetString("userID"),
		Username: c.GetString("username"),
		Roles:    toStringSlice(rolesSlice),
	})
	return authorization.AuthorizeOperationRole(ctx, op, models.OperationRoleViewer) == nil
}

// writeReport bundles a JSON report inside the zip so the user can see
// what was skipped / warned about without watching server logs.
func writeReport(zw *zip.Writer, report *wikiexport.Report) error {
	w, err := zw.Create("EXPORT_REPORT.json")
	if err != nil {
		return err
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(report)
}

func scopeLabel(rootID *uuid.UUID) string {
	if rootID != nil {
		return "subtree"
	}
	return "tree"
}

// exportFilenameSafe characters for the suggested download filename. Keeps
// the file name human-friendly without inviting browser save-dialog
// surprises.
var exportFilenameSafe = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

// buildExportFilename produces a deterministic, browser-safe download
// filename. Tree exports use the operation name; subtree exports use the
// root doc's title (best-effort).
func buildExportFilename(
	op *models.Operation,
	rootID *uuid.UUID,
	c *gin.Context,
	docRepo repository.IWikiDocumentRepository,
) string {
	stem := strings.TrimSpace(op.Name)
	if rootID != nil {
		if d, err := docRepo.FindByID(c.Request.Context(), *rootID); err == nil {
			t := strings.TrimSpace(d.Title)
			if t != "" {
				stem = t
			}
		}
	}
	if stem == "" {
		stem = "wiki"
	}
	stem = exportFilenameSafe.ReplaceAllString(stem, "-")
	stem = strings.Trim(stem, "-")
	if len(stem) > 60 {
		stem = stem[:60]
	}
	if stem == "" {
		stem = "wiki"
	}
	ts := time.Now().UTC().Format("20060102T150405Z")
	return "wiki-export-" + stem + "-" + ts + ".zip"
}
