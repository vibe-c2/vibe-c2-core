package controller

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"path"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/authorization"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
	"go.uber.org/zap"
)

// WikiImageControllerConfig groups the limits the image controller needs to
// enforce. Mirrors the relevant subset of environment.EnvironmentSettings.
type WikiImageControllerConfig struct {
	MaxSize int64 // upload max in bytes
}

// WikiImageController handles image uploads and proxied downloads for wiki
// documents. Uploads go through ImageProcessor (sanitize + downscale + strip
// EXIF); downloads are authenticated via the existing access_token cookie so
// `<img src>` tags work natively.
type WikiImageController struct {
	docRepo   repository.IWikiDocumentRepository
	imageRepo repository.IWikiImageRepository
	opRepo    repository.IOperationRepository
	store     blob.ObjectStore
	processor *wiki.ImageProcessor
	logger    *zap.Logger
	cfg       WikiImageControllerConfig
}

func NewWikiImageController(
	docRepo repository.IWikiDocumentRepository,
	imageRepo repository.IWikiImageRepository,
	opRepo repository.IOperationRepository,
	store blob.ObjectStore,
	processor *wiki.ImageProcessor,
	logger *zap.Logger,
	cfg WikiImageControllerConfig,
) *WikiImageController {
	return &WikiImageController{
		docRepo:   docRepo,
		imageRepo: imageRepo,
		opRepo:    opRepo,
		store:     store,
		processor: processor,
		logger:    logger,
		cfg:       cfg,
	}
}

// WikiImageUploadResponse is the JSON body returned from POST /wiki/images.
type WikiImageUploadResponse struct {
	ID     string `json:"id"`
	URL    string `json:"url"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

// Upload handles POST /api/v1/wiki/images (multipart/form-data).
//
//	@Summary		Upload a wiki image
//	@Description	Upload an image to be embedded in a wiki document. Images are validated, sanitized (SVG) or re-encoded (raster, strips EXIF), and optionally downscaled.
//	@Tags			Wiki
//	@Accept			multipart/form-data
//	@Produce		json
//	@Security		BearerAuth
//	@Param			documentId	formData	string	true	"Owning document ID (UUID)"
//	@Param			file		formData	file	true	"Image bytes (png/jpeg/webp/gif/avif/svg, max 10MB)"
//	@Success		201			{object}	WikiImageUploadResponse
//	@Failure		400			{object}	responses.ErrorResponse
//	@Failure		403			{object}	responses.ErrorResponse
//	@Failure		404			{object}	responses.ErrorResponse
//	@Failure		413			{object}	responses.ErrorResponse
//	@Failure		415			{object}	responses.ErrorResponse
//	@Router			/wiki/images [post]
func (wic *WikiImageController) Upload(c *gin.Context) {
	docIDStr := c.PostForm("documentId")
	docID, err := uuid.Parse(docIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid documentId"))
		return
	}

	// Enforce size cap early — Gin already applies MaxMultipartMemory to
	// memory, but we also cap the on-disk spill via LimitReader below.
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("file is required"))
		return
	}
	if fileHeader.Size > wic.cfg.MaxSize {
		c.JSON(http.StatusRequestEntityTooLarge, responses.NewErrorResponse(
			"file exceeds maximum size of %d bytes", wic.cfg.MaxSize))
		return
	}

	doc, err := wic.docRepo.FindByID(c.Request.Context(), docID)
	if err != nil {
		c.JSON(http.StatusNotFound, responses.NewErrorResponse("document not found"))
		return
	}
	if doc.DeletedAt != nil {
		c.JSON(http.StatusForbidden, responses.NewErrorResponse("cannot upload to a deleted document"))
		return
	}

	if !wic.callerCanEdit(c, &doc) {
		c.JSON(http.StatusForbidden, responses.ErrForbidden)
		return
	}

	src, err := fileHeader.Open()
	if err != nil {
		wic.logger.Error("Failed to open upload", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}
	defer src.Close()

	raw, err := wiki.ReadAllLimited(src, wic.cfg.MaxSize)
	if err != nil {
		c.JSON(http.StatusRequestEntityTooLarge, responses.NewErrorResponse("%v", err))
		return
	}

	processed, err := wic.processor.ProcessImage(raw)
	if err != nil {
		if errors.Is(err, wiki.ErrUnsupportedImageType) {
			c.JSON(http.StatusUnsupportedMediaType, responses.NewErrorResponse("%v", err))
			return
		}
		if errors.Is(err, wiki.ErrInvalidImage) {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("%v", err))
			return
		}
		wic.logger.Error("Image processing failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	imageID := uuid.New()
	key := objectKeyFor(doc.OperationID, doc.DocumentID, imageID, processed.ContentType)

	// Use a detached timeout so a client disconnect doesn't abort the write
	// mid-object.
	putCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := wic.store.Put(putCtx, key, bytes.NewReader(processed.Bytes), int64(len(processed.Bytes)), processed.ContentType); err != nil {
		wic.logger.Error("Object store put failed", zap.Error(err), zap.String("key", key))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	uploaderID, err := uuid.Parse(c.GetString("userID"))
	if err != nil {
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	img := &models.WikiImage{
		ImageID:      imageID,
		OperationID:  doc.OperationID,
		DocumentID:   doc.DocumentID,
		UploadedByID: uploaderID,
		ObjectKey:    key,
		ContentType:  processed.ContentType,
		SizeBytes:    int64(len(processed.Bytes)),
		Width:        processed.Width,
		Height:       processed.Height,
		Checksum:     processed.Checksum,
	}
	if err := wic.imageRepo.Create(c.Request.Context(), img); err != nil {
		// Try to clean up the orphaned object; if that fails the sweeper
		// will get it eventually.
		_ = wic.store.Delete(context.Background(), key)
		wic.logger.Error("Failed to persist image metadata", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	wic.logger.Info("Wiki image uploaded",
		zap.String("image_id", imageID.String()),
		zap.String("document_id", doc.DocumentID.String()),
		zap.String("operation_id", doc.OperationID.String()),
		zap.String("uploader_id", uploaderID.String()),
		zap.String("content_type", processed.ContentType),
		zap.Int64("size_bytes", img.SizeBytes),
	)

	c.JSON(http.StatusCreated, WikiImageUploadResponse{
		ID:     imageID.String(),
		URL:    "/api/v1/wiki/images/" + imageID.String(),
		Width:  processed.Width,
		Height: processed.Height,
	})
}

// Download handles GET /api/v1/wiki/images/:id. The response is streamed from
// the object store. SVGs get additional CSP + nosniff headers.
//
//	@Summary		Fetch a wiki image
//	@Description	Streams the image bytes for an uploaded wiki image. Caller must be a member of the image's operation.
//	@Tags			Wiki
//	@Produce		image/*
//	@Security		BearerAuth
//	@Param			id	path	string	true	"Image ID (UUID)"
//	@Router			/wiki/images/{id} [get]
func (wic *WikiImageController) Download(c *gin.Context) {
	imageID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid image ID"))
		return
	}

	img, err := wic.imageRepo.FindByID(c.Request.Context(), imageID)
	if err != nil {
		c.JSON(http.StatusNotFound, responses.NewErrorResponse("image not found"))
		return
	}

	if !wic.callerIsOperationMember(c, img.OperationID) {
		c.JSON(http.StatusForbidden, responses.ErrForbidden)
		return
	}

	// If-None-Match short-circuit: browsers will cache aggressively because
	// image content is immutable for a given ID, but respect the standard
	// revalidation header anyway.
	if match := c.GetHeader("If-None-Match"); match != "" && match == etagFor(img.Checksum) {
		c.Status(http.StatusNotModified)
		return
	}

	reader, info, err := wic.store.Get(c.Request.Context(), img.ObjectKey)
	if err != nil {
		wic.logger.Error("Object store get failed", zap.Error(err), zap.String("key", img.ObjectKey))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}
	defer reader.Close()

	contentType := img.ContentType
	if contentType == "" {
		contentType = info.ContentType
	}

	c.Header("Content-Type", contentType)
	if info.ContentLength > 0 {
		c.Header("Content-Length", strconv.FormatInt(info.ContentLength, 10))
	}
	c.Header("ETag", etagFor(img.Checksum))
	c.Header("Cache-Control", "private, max-age=31536000, immutable")
	c.Header("X-Content-Type-Options", "nosniff")

	// SVG is served same-origin as image/svg+xml, so the browser may
	// evaluate embedded scripts. Sanitization is the first line of defense;
	// CSP is defense-in-depth — see wiki/svg.go.
	if contentType == wiki.MimeSVG {
		c.Header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
	}

	c.Status(http.StatusOK)
	if _, err := io.Copy(c.Writer, reader); err != nil {
		// Client disconnect; not worth logging as error.
		wic.logger.Debug("Stream aborted", zap.Error(err))
	}
}

// callerCanEdit returns true when the caller is app-admin or operator+ in
// the operation owning the document. Matches the write-permission rule used
// by the collab ticket endpoint.
func (wic *WikiImageController) callerCanEdit(c *gin.Context, doc *models.WikiDocument) bool {
	if isAppAdminFromContext(c) {
		return true
	}
	op, err := wic.opRepo.FindByID(c.Request.Context(), doc.OperationID)
	if err != nil {
		return false
	}
	rolesSlice, _ := c.Get("roles")
	ctx := gqlctx.WithAuthInfo(c.Request.Context(), gqlctx.AuthInfo{
		UserID:   c.GetString("userID"),
		Username: c.GetString("username"),
		Roles:    toStringSlice(rolesSlice),
	})
	return authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleOperator) == nil
}

// callerIsOperationMember is the read-side permission — viewer or higher in
// the operation, or app-admin. Mirrors the @hasPermission("operation:member")
// directive used on GraphQL queries.
func (wic *WikiImageController) callerIsOperationMember(c *gin.Context, opID uuid.UUID) bool {
	if isAppAdminFromContext(c) {
		return true
	}
	op, err := wic.opRepo.FindByID(c.Request.Context(), opID)
	if err != nil {
		return false
	}
	rolesSlice, _ := c.Get("roles")
	ctx := gqlctx.WithAuthInfo(c.Request.Context(), gqlctx.AuthInfo{
		UserID:   c.GetString("userID"),
		Username: c.GetString("username"),
		Roles:    toStringSlice(rolesSlice),
	})
	return authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleViewer) == nil
}

func isAppAdminFromContext(c *gin.Context) bool {
	raw, _ := c.Get("roles")
	for _, r := range toStringSlice(raw) {
		if r == "admin" {
			return true
		}
	}
	return false
}

func toStringSlice(v any) []string {
	s, _ := v.([]string)
	return s
}

func etagFor(checksum string) string {
	return `"` + checksum + `"`
}

func objectKeyFor(opID, docID, imgID uuid.UUID, contentType string) string {
	ext := extFor(contentType)
	return path.Join(opID.String(), docID.String(), imgID.String()+ext)
}

func extFor(contentType string) string {
	switch contentType {
	case wiki.MimeJPEG:
		return ".jpg"
	case wiki.MimePNG:
		return ".png"
	case wiki.MimeWebP:
		return ".webp"
	case wiki.MimeGIF:
		return ".gif"
	case wiki.MimeAVIF:
		return ".avif"
	case wiki.MimeSVG:
		return ".svg"
	default:
		return ""
	}
}

