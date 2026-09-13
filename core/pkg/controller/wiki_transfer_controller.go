package controller

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/authorization"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/job"
	"go.uber.org/zap"
)

// WikiTransferControllerConfig groups the request-time limits.
type WikiTransferControllerConfig struct {
	// MaxUploadSize caps an import archive, in bytes.
	MaxUploadSize int64
}

// WikiTransferController exposes wiki export/import as background jobs:
//
//	POST /api/v1/wiki/transfer/exports          start an export
//	POST /api/v1/wiki/transfer/imports          upload an archive, start an import
//	GET  /api/v1/wiki/transfer/jobs?operationId list an operation's jobs
//	GET  /api/v1/wiki/transfer/jobs/:id         one job with its report
//	GET  /api/v1/wiki/transfer/jobs/:id/download stream a finished export
type WikiTransferController struct {
	runner    *job.Runner
	jobs      repository.IWikiTransferJobRepository
	opRepo    repository.IOperationRepository
	docRepo   repository.IWikiDocumentRepository
	artifacts blob.ObjectStore
	logger    *zap.Logger
	cfg       WikiTransferControllerConfig
}

// NewWikiTransferController wires the controller.
func NewWikiTransferController(
	runner *job.Runner,
	jobs repository.IWikiTransferJobRepository,
	opRepo repository.IOperationRepository,
	docRepo repository.IWikiDocumentRepository,
	artifacts blob.ObjectStore,
	logger *zap.Logger,
	cfg WikiTransferControllerConfig,
) *WikiTransferController {
	return &WikiTransferController{
		runner: runner, jobs: jobs, opRepo: opRepo, docRepo: docRepo,
		artifacts: artifacts, logger: logger, cfg: cfg,
	}
}

// ExportRequest is the JSON body of POST /wiki/transfer/exports.
type ExportRequest struct {
	OperationID string `json:"operationId" binding:"required"`
	// RootId scopes the export to one page and its descendants.
	RootID *string `json:"rootId"`
	// Format is "bundle" (default) or "markdown".
	Format string `json:"format"`
}

// JobResponse is the wire shape of a transfer job. Report is the format's
// report object when the job has finished.
type JobResponse struct {
	models.WikiTransferJob
	Report json.RawMessage `json:"report,omitempty"`
}

func toJobResponse(j models.WikiTransferJob) JobResponse {
	out := JobResponse{WikiTransferJob: j}
	if len(j.Report) > 0 && json.Valid(j.Report) {
		out.Report = json.RawMessage(j.Report)
	}
	return out
}

// StartExport handles POST /api/v1/wiki/transfer/exports.
//
//	@Summary		Start a wiki export job
//	@Description	Queues an export of the operation's wiki (or one subtree) as a native bundle or a markdown zip. Poll the returned job and download the archive when it is done. Viewer+ on the operation; credentials are embedded only when the caller is operator+.
//	@Tags			Wiki
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			body	body		ExportRequest	true	"Export request"
//	@Success		202		{object}	JobResponse
//	@Failure		400		{object}	responses.ErrorResponse
//	@Failure		403		{object}	responses.ErrorResponse
//	@Failure		409		{object}	responses.ErrorResponse
//	@Router			/wiki/transfer/exports [post]
func (wtc *WikiTransferController) StartExport(c *gin.Context) {
	var req ExportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid request: %v", err))
		return
	}
	opID, err := uuid.Parse(req.OperationID)
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid operationId"))
		return
	}
	op, err := wtc.opRepo.FindByID(c.Request.Context(), opID)
	if err != nil {
		c.JSON(http.StatusNotFound, responses.NewErrorResponse("operation not found"))
		return
	}
	if !wtc.callerHasRole(c, &op, models.OperationRoleViewer) {
		c.JSON(http.StatusForbidden, responses.ErrForbidden)
		return
	}
	callerID, err := uuid.Parse(c.GetString("userID"))
	if err != nil {
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	format := models.WikiTransferFormat(strings.ToLower(strings.TrimSpace(req.Format)))
	switch format {
	case "":
		format = models.WikiTransferBundle
	case models.WikiTransferBundle, models.WikiTransferMarkdown:
	default:
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("unknown format %q", req.Format))
		return
	}

	request := models.WikiTransferRequest{
		IncludeCredentials: wtc.callerHasRole(c, &op, models.OperationRoleOperator),
	}
	if req.RootID != nil && *req.RootID != "" {
		rootID, err := uuid.Parse(*req.RootID)
		if err != nil {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid rootId"))
			return
		}
		root, err := wtc.docRepo.FindByID(c.Request.Context(), rootID)
		if err != nil || root.OperationID != opID {
			c.JSON(http.StatusNotFound, responses.NewErrorResponse("subtree root not found"))
			return
		}
		if root.DeletedAt != nil {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("subtree root is in trash"))
			return
		}
		request.RootDocumentID = &rootID
	}

	if !wtc.reserveSlot(c, opID) {
		return
	}
	j := &models.WikiTransferJob{
		JobID:         uuid.New(),
		OperationID:   opID,
		Kind:          models.WikiTransferExport,
		Format:        format,
		RequestedByID: callerID,
		Request:       request,
	}
	if err := wtc.runner.Submit(c.Request.Context(), j); err != nil {
		wtc.logger.Error("wiki transfer: submit export failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}
	c.JSON(http.StatusAccepted, toJobResponse(*j))
}

// StartImport handles POST /api/v1/wiki/transfer/imports.
//
//	@Summary		Upload an archive and start a wiki import job
//	@Description	Accepts a native bundle (.vibewiki.zip) or a markdown zip. The format is detected from the archive. Pages land under `targetParentId`, at the root when it is absent, or in import/<timestamp>/ when `holdingPen=true`. Operator+ on the operation.
//	@Tags			Wiki
//	@Accept			multipart/form-data
//	@Produce		json
//	@Security		BearerAuth
//	@Param			operationId		query		string	true	"Target operation ID (UUID)"
//	@Param			targetParentId	query		string	false	"Page to import under (UUID). Omit for the root."
//	@Param			holdingPen		query		boolean	false	"Land in import/<timestamp>/ instead of targetParentId"
//	@Param			file			formData	file	true	"Archive"
//	@Success		202				{object}	JobResponse
//	@Failure		400				{object}	responses.ErrorResponse
//	@Failure		403				{object}	responses.ErrorResponse
//	@Failure		409				{object}	responses.ErrorResponse
//	@Failure		413				{object}	responses.ErrorResponse
//	@Router			/wiki/transfer/imports [post]
func (wtc *WikiTransferController) StartImport(c *gin.Context) {
	opID, err := uuid.Parse(c.Query("operationId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid operationId"))
		return
	}
	op, err := wtc.opRepo.FindByID(c.Request.Context(), opID)
	if err != nil {
		c.JSON(http.StatusNotFound, responses.NewErrorResponse("operation not found"))
		return
	}
	if !wtc.callerHasRole(c, &op, models.OperationRoleOperator) {
		c.JSON(http.StatusForbidden, responses.ErrForbidden)
		return
	}
	callerID, err := uuid.Parse(c.GetString("userID"))
	if err != nil {
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	request := models.WikiTransferRequest{HoldingPen: c.Query("holdingPen") == "true"}
	if tp := c.Query("targetParentId"); tp != "" && !request.HoldingPen {
		parentID, err := uuid.Parse(tp)
		if err != nil {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid targetParentId"))
			return
		}
		parent, err := wtc.docRepo.FindByID(c.Request.Context(), parentID)
		if err != nil || parent.OperationID != opID {
			c.JSON(http.StatusNotFound, responses.NewErrorResponse("target parent not found"))
			return
		}
		if parent.DeletedAt != nil {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("target parent is in trash"))
			return
		}
		request.TargetParentID = &parentID
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("file is required"))
		return
	}
	limit := wtc.cfg.MaxUploadSize
	if limit <= 0 {
		limit = 1 << 30
	}
	if fileHeader.Size > limit {
		c.JSON(http.StatusRequestEntityTooLarge, responses.NewErrorResponse("archive exceeds maximum size of %d bytes", limit))
		return
	}
	src, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}
	defer src.Close()
	request.UploadFilename = fileHeader.Filename

	if !wtc.reserveSlot(c, opID) {
		return
	}
	jobID := uuid.New()
	key := wtc.runner.UploadKey(jobID)
	if err := wtc.artifacts.Put(c.Request.Context(), key, io.LimitReader(src, limit), fileHeader.Size, "application/zip"); err != nil {
		wtc.logger.Error("wiki transfer: stage upload failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.NewErrorResponse("could not store the uploaded archive"))
		return
	}

	j := &models.WikiTransferJob{
		JobID:         jobID,
		OperationID:   opID,
		Kind:          models.WikiTransferImport,
		Format:        models.WikiTransferBundle, // corrected by the worker once the archive is read
		RequestedByID: callerID,
		Request:       request,
		ArtifactKey:   key,
		ArtifactName:  fileHeader.Filename,
		ArtifactSize:  fileHeader.Size,
	}
	if err := wtc.runner.Submit(c.Request.Context(), j); err != nil {
		_ = wtc.artifacts.Delete(c.Request.Context(), key)
		wtc.logger.Error("wiki transfer: submit import failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}
	c.JSON(http.StatusAccepted, toJobResponse(*j))
}

// ListJobs handles GET /api/v1/wiki/transfer/jobs?operationId=…
//
//	@Summary		List an operation's wiki transfer jobs
//	@Tags			Wiki
//	@Produce		json
//	@Security		BearerAuth
//	@Param			operationId	query		string	true	"Operation ID (UUID)"
//	@Success		200			{array}		JobResponse
//	@Failure		403			{object}	responses.ErrorResponse
//	@Router			/wiki/transfer/jobs [get]
func (wtc *WikiTransferController) ListJobs(c *gin.Context) {
	opID, err := uuid.Parse(c.Query("operationId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid operationId"))
		return
	}
	op, err := wtc.opRepo.FindByID(c.Request.Context(), opID)
	if err != nil {
		c.JSON(http.StatusNotFound, responses.NewErrorResponse("operation not found"))
		return
	}
	if !wtc.callerHasRole(c, &op, models.OperationRoleViewer) {
		c.JSON(http.StatusForbidden, responses.ErrForbidden)
		return
	}
	jobs, err := wtc.jobs.FindByOperationID(c.Request.Context(), opID, 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}
	out := make([]JobResponse, 0, len(jobs))
	for _, j := range jobs {
		out = append(out, toJobResponse(j))
	}
	c.JSON(http.StatusOK, out)
}

// GetJob handles GET /api/v1/wiki/transfer/jobs/:id.
//
//	@Summary		Fetch one wiki transfer job
//	@Tags			Wiki
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id	path		string	true	"Job ID (UUID)"
//	@Success		200	{object}	JobResponse
//	@Failure		403	{object}	responses.ErrorResponse
//	@Failure		404	{object}	responses.ErrorResponse
//	@Router			/wiki/transfer/jobs/{id} [get]
func (wtc *WikiTransferController) GetJob(c *gin.Context) {
	j, ok := wtc.loadAuthorisedJob(c)
	if !ok {
		return
	}
	c.JSON(http.StatusOK, toJobResponse(j))
}

// Download handles GET /api/v1/wiki/transfer/jobs/:id/download.
//
//	@Summary		Download a finished export
//	@Tags			Wiki
//	@Produce		application/zip
//	@Security		BearerAuth
//	@Param			id	path		string	true	"Job ID (UUID)"
//	@Success		200	{file}		zip
//	@Failure		404	{object}	responses.ErrorResponse
//	@Failure		409	{object}	responses.ErrorResponse
//	@Router			/wiki/transfer/jobs/{id}/download [get]
func (wtc *WikiTransferController) Download(c *gin.Context) {
	j, ok := wtc.loadAuthorisedJob(c)
	if !ok {
		return
	}
	if j.Kind != models.WikiTransferExport || j.Status != models.WikiTransferDone || j.ArtifactKey == "" {
		c.JSON(http.StatusConflict, responses.NewErrorResponse("job has no downloadable archive"))
		return
	}
	reader, info, err := wtc.artifacts.Get(c.Request.Context(), j.ArtifactKey)
	if err != nil {
		c.JSON(http.StatusNotFound, responses.NewErrorResponse("archive has expired"))
		return
	}
	defer reader.Close()

	name := j.ArtifactName
	if name == "" {
		name = "wiki-export.zip"
	}
	c.Header("Content-Type", "application/zip")
	// RFC 6266: the plain filename= must stay ASCII (older clients read only
	// that one); filename*= carries the real UTF-8 name for the rest.
	c.Header("Content-Disposition", `attachment; filename="`+asciiFallback(name)+`"; filename*=UTF-8''`+url.PathEscape(name))
	c.Header("Cache-Control", "no-store")
	if info.ContentLength > 0 {
		c.Header("Content-Length", strconv.FormatInt(info.ContentLength, 10))
	}
	c.Status(http.StatusOK)
	if _, err := io.Copy(c.Writer, reader); err != nil {
		wtc.logger.Warn("wiki transfer: download stream failed", zap.Error(err))
	}
}

func (wtc *WikiTransferController) loadAuthorisedJob(c *gin.Context) (models.WikiTransferJob, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid job id"))
		return models.WikiTransferJob{}, false
	}
	j, err := wtc.jobs.FindByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, responses.NewErrorResponse("job not found"))
		return models.WikiTransferJob{}, false
	}
	op, err := wtc.opRepo.FindByID(c.Request.Context(), j.OperationID)
	if err != nil {
		c.JSON(http.StatusNotFound, responses.NewErrorResponse("operation not found"))
		return models.WikiTransferJob{}, false
	}
	if !wtc.callerHasRole(c, &op, models.OperationRoleViewer) {
		c.JSON(http.StatusForbidden, responses.ErrForbidden)
		return models.WikiTransferJob{}, false
	}
	return j, true
}

// reserveSlot refuses a second concurrent job for the same operation.
// Best-effort: two requests racing past the count both run, which is
// harmless — the guard exists to keep one operator from queueing dozens.
func (wtc *WikiTransferController) reserveSlot(c *gin.Context, opID uuid.UUID) bool {
	n, err := wtc.jobs.CountRunningForOperation(c.Request.Context(), opID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return false
	}
	if n > 0 {
		c.JSON(http.StatusConflict, responses.NewErrorResponse("a wiki transfer is already running for this operation"))
		return false
	}
	return true
}

func (wtc *WikiTransferController) callerHasRole(c *gin.Context, op *models.Operation, role models.OperationRole) bool {
	if isAppAdminFromContext(c) {
		return true
	}
	rolesSlice, _ := c.Get("roles")
	ctx := gqlctx.WithAuthInfo(c.Request.Context(), gqlctx.AuthInfo{
		UserID:   c.GetString("userID"),
		Username: c.GetString("username"),
		Roles:    toStringSlice(rolesSlice),
	})
	return authorization.AuthorizeOperationRole(ctx, op, role) == nil
}

// asciiFallback replaces every non-ASCII or quote character with "_" so the
// result is safe inside a quoted Content-Disposition parameter.
func asciiFallback(name string) string {
	var b strings.Builder
	for _, r := range name {
		if r < 0x20 || r > 0x7e || r == '"' || r == '\\' {
			b.WriteByte('_')
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}
