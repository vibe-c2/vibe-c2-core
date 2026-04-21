package controller

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/url"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/gabriel-vasile/mimetype"
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

// WikiFileControllerConfig groups the limits and policies the file controller
// needs to enforce. Mirrors the relevant subset of environment.EnvironmentSettings.
type WikiFileControllerConfig struct {
	MaxSize             int64    // upload max in bytes
	DeniedContentTypes  []string // exact-match MIME denylist; empty = allow all
}

// WikiFileController handles non-image file attachment uploads and proxied
// downloads for wiki documents. Uploads are stored as-is (no processing);
// downloads default to attachment disposition and can opt into inline rendering
// for known-safe types via ?preview=1.
type WikiFileController struct {
	docRepo  repository.IWikiDocumentRepository
	fileRepo repository.IWikiFileRepository
	opRepo   repository.IOperationRepository
	store    blob.ObjectStore
	logger   *zap.Logger
	cfg      WikiFileControllerConfig
}

func NewWikiFileController(
	docRepo repository.IWikiDocumentRepository,
	fileRepo repository.IWikiFileRepository,
	opRepo repository.IOperationRepository,
	store blob.ObjectStore,
	logger *zap.Logger,
	cfg WikiFileControllerConfig,
) *WikiFileController {
	return &WikiFileController{
		docRepo:  docRepo,
		fileRepo: fileRepo,
		opRepo:   opRepo,
		store:    store,
		logger:   logger,
		cfg:      cfg,
	}
}

// WikiFileUploadResponse is the JSON body returned from POST /wiki/files.
type WikiFileUploadResponse struct {
	ID          string `json:"id"`
	URL         string `json:"url"`
	Filename    string `json:"filename"`
	Size        int64  `json:"size"`
	ContentType string `json:"contentType"`
}

// previewAllowedContentTypes is the set of MIME types browsers can safely
// render inline without executing scripts. All other types are forced to
// attachment disposition even when ?preview=1 is set.
var previewAllowedContentTypes = map[string]bool{
	"application/pdf": true,
	"text/plain":      true,
	"text/markdown":   true,
}

// dangerousContentTypes are formats the browser may execute if served inline.
// These are always returned as attachment, regardless of ?preview=1.
var dangerousContentTypes = map[string]bool{
	"text/html":                true,
	"image/svg+xml":            true,
	"application/xhtml+xml":    true,
	"application/javascript":   true,
	"application/x-javascript": true,
	"text/javascript":          true,
}

// Upload handles POST /api/v1/wiki/files (multipart/form-data).
//
//	@Summary		Upload a wiki file attachment
//	@Description	Upload a non-image file to be attached to a wiki document. The original filename is preserved for downloads; bytes are stored as-is.
//	@Tags			Wiki
//	@Accept			multipart/form-data
//	@Produce		json
//	@Security		BearerAuth
//	@Param			documentId	formData	string	true	"Owning document ID (UUID)"
//	@Param			file		formData	file	true	"File bytes (max 50MB by default)"
//	@Success		201			{object}	WikiFileUploadResponse
//	@Failure		400			{object}	responses.ErrorResponse
//	@Failure		403			{object}	responses.ErrorResponse
//	@Failure		404			{object}	responses.ErrorResponse
//	@Failure		413			{object}	responses.ErrorResponse
//	@Failure		415			{object}	responses.ErrorResponse
//	@Router			/wiki/files [post]
func (wfc *WikiFileController) Upload(c *gin.Context) {
	docIDStr := c.PostForm("documentId")
	docID, err := uuid.Parse(docIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid documentId"))
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("file is required"))
		return
	}
	if fileHeader.Size > wfc.cfg.MaxSize {
		c.JSON(http.StatusRequestEntityTooLarge, responses.NewErrorResponse(
			"file exceeds maximum size of %d bytes", wfc.cfg.MaxSize))
		return
	}

	filename := sanitizeUploadFilename(fileHeader.Filename)
	if filename == "" {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("filename is required"))
		return
	}

	doc, err := wfc.docRepo.FindByID(c.Request.Context(), docID)
	if err != nil {
		c.JSON(http.StatusNotFound, responses.NewErrorResponse("document not found"))
		return
	}
	if doc.DeletedAt != nil {
		c.JSON(http.StatusForbidden, responses.NewErrorResponse("cannot upload to a deleted document"))
		return
	}

	if !wfc.callerCanEdit(c, &doc) {
		c.JSON(http.StatusForbidden, responses.ErrForbidden)
		return
	}

	src, err := fileHeader.Open()
	if err != nil {
		wfc.logger.Error("Failed to open upload", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}
	defer src.Close()

	raw, err := wiki.ReadAllLimited(src, wfc.cfg.MaxSize)
	if err != nil {
		c.JSON(http.StatusRequestEntityTooLarge, responses.NewErrorResponse("%v", err))
		return
	}

	// Content-type detection: trust the browser's declared type by default,
	// but sniff the bytes when none is given. Sniffing also hardens the
	// denylist against clients that just lie.
	contentType := strings.TrimSpace(fileHeader.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = mimetype.Detect(raw).String()
	}
	contentType = canonicalContentType(contentType)

	if isDeniedContentType(contentType, wfc.cfg.DeniedContentTypes) {
		c.JSON(http.StatusUnsupportedMediaType, responses.NewErrorResponse(
			"content type %q is not allowed", contentType))
		return
	}

	fileID := uuid.New()
	key := fileObjectKeyFor(doc.OperationID, doc.DocumentID, fileID, filename)

	// Detached timeout so a client disconnect doesn't abort the write.
	putCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	if err := wfc.store.Put(putCtx, key, bytes.NewReader(raw), int64(len(raw)), contentType); err != nil {
		wfc.logger.Error("Object store put failed", zap.Error(err), zap.String("key", key))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	uploaderID, err := uuid.Parse(c.GetString("userID"))
	if err != nil {
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	sum := sha256.Sum256(raw)
	file := &models.WikiFile{
		FileID:       fileID,
		OperationID:  doc.OperationID,
		DocumentID:   doc.DocumentID,
		UploadedByID: uploaderID,
		ObjectKey:    key,
		Filename:     filename,
		ContentType:  contentType,
		SizeBytes:    int64(len(raw)),
		Checksum:     hex.EncodeToString(sum[:]),
	}
	if err := wfc.fileRepo.Create(c.Request.Context(), file); err != nil {
		// Best-effort cleanup; sweeper will get it if this fails.
		_ = wfc.store.Delete(context.Background(), key)
		wfc.logger.Error("Failed to persist file metadata", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	wfc.logger.Info("Wiki file uploaded",
		zap.String("file_id", fileID.String()),
		zap.String("document_id", doc.DocumentID.String()),
		zap.String("operation_id", doc.OperationID.String()),
		zap.String("uploader_id", uploaderID.String()),
		zap.String("content_type", contentType),
		zap.String("filename", filename),
		zap.Int64("size_bytes", file.SizeBytes),
	)

	c.JSON(http.StatusCreated, WikiFileUploadResponse{
		ID:          fileID.String(),
		URL:         "/api/v1/wiki/files/" + fileID.String(),
		Filename:    filename,
		Size:        file.SizeBytes,
		ContentType: contentType,
	})
}

// Download handles GET /api/v1/wiki/files/:id. Default disposition is
// attachment; ?preview=1 switches to inline for known-safe types.
//
//	@Summary		Fetch a wiki file attachment
//	@Description	Streams the file bytes. Caller must be a member of the file's operation. Pass ?preview=1 for inline rendering of safe formats (PDF, text).
//	@Tags			Wiki
//	@Produce		application/octet-stream
//	@Security		BearerAuth
//	@Param			id		path	string	true	"File ID (UUID)"
//	@Param			preview	query	boolean	false	"If true, serve inline for safe MIME types"
//	@Router			/wiki/files/{id} [get]
func (wfc *WikiFileController) Download(c *gin.Context) {
	fileID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid file ID"))
		return
	}

	file, err := wfc.fileRepo.FindByID(c.Request.Context(), fileID)
	if err != nil {
		c.JSON(http.StatusNotFound, responses.NewErrorResponse("file not found"))
		return
	}

	if !wfc.callerIsOperationMember(c, file.OperationID) {
		c.JSON(http.StatusForbidden, responses.ErrForbidden)
		return
	}

	if match := c.GetHeader("If-None-Match"); match != "" && match == fileETagFor(file.Checksum) {
		c.Status(http.StatusNotModified)
		return
	}

	reader, info, err := wfc.store.Get(c.Request.Context(), file.ObjectKey)
	if err != nil {
		wfc.logger.Error("Object store get failed", zap.Error(err), zap.String("key", file.ObjectKey))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}
	defer reader.Close()

	contentType := file.ContentType
	if contentType == "" {
		contentType = info.ContentType
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	preview := c.Query("preview") == "1" || c.Query("preview") == "true"
	disposition := contentDispositionFor(file.Filename, contentType, preview)

	c.Header("Content-Type", contentType)
	if info.ContentLength > 0 {
		c.Header("Content-Length", strconv.FormatInt(info.ContentLength, 10))
	}
	c.Header("Content-Disposition", disposition)
	c.Header("ETag", fileETagFor(file.Checksum))
	c.Header("Cache-Control", "private, max-age=31536000, immutable")
	c.Header("X-Content-Type-Options", "nosniff")
	// Defense-in-depth CSP: file downloads should never execute anything.
	c.Header("Content-Security-Policy", "default-src 'none'; sandbox")

	c.Status(http.StatusOK)
	if _, err := io.Copy(c.Writer, reader); err != nil {
		// Client disconnect; not worth logging as error.
		wfc.logger.Debug("Stream aborted", zap.Error(err))
	}
}

// callerCanEdit returns true when the caller is app-admin or operator+ in
// the operation owning the document. Matches the write-permission rule used
// by the image controller and collab ticket endpoint.
func (wfc *WikiFileController) callerCanEdit(c *gin.Context, doc *models.WikiDocument) bool {
	if isAppAdminFromContext(c) {
		return true
	}
	op, err := wfc.opRepo.FindByID(c.Request.Context(), doc.OperationID)
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
// the operation, or app-admin.
func (wfc *WikiFileController) callerIsOperationMember(c *gin.Context, opID uuid.UUID) bool {
	if isAppAdminFromContext(c) {
		return true
	}
	op, err := wfc.opRepo.FindByID(c.Request.Context(), opID)
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

// sanitizeUploadFilename normalizes the client-supplied filename into something
// safe to persist, echo in headers, and display in a download card.
//
// Steps: strip any directory components the browser might have leaked, drop
// control characters, collapse internal whitespace, trim surrounding dots and
// spaces (which defeat Windows filename quirks), and cap the byte length.
func sanitizeUploadFilename(raw string) string {
	base := filepath.Base(strings.ReplaceAll(raw, `\`, "/"))
	if base == "." || base == "/" || base == "\\" {
		base = ""
	}

	var sb strings.Builder
	sb.Grow(len(base))
	for _, r := range base {
		if unicode.IsControl(r) {
			continue
		}
		sb.WriteRune(r)
	}
	cleaned := strings.Join(strings.Fields(sb.String()), " ")
	// Trim leading spaces (dot-files like ".gitignore" stay intact) and
	// trailing dots+spaces (Windows truncates those on save, which confuses
	// downloaders).
	cleaned = strings.TrimLeft(cleaned, " ")
	cleaned = strings.TrimRight(cleaned, ". ")

	const maxLen = 255
	if len(cleaned) > maxLen {
		// Preserve the extension when possible so the browser still picks a
		// sensible default app to open it with.
		ext := filepath.Ext(cleaned)
		if len(ext) > 0 && len(ext) < 20 {
			head := cleaned[:maxLen-len(ext)]
			cleaned = head + ext
		} else {
			cleaned = cleaned[:maxLen]
		}
	}
	return cleaned
}

// isDeniedContentType returns true when ct is present (case-insensitive) in
// the exact-match denylist. An empty denylist allows all.
func isDeniedContentType(ct string, denied []string) bool {
	if len(denied) == 0 {
		return false
	}
	ctLower := strings.ToLower(canonicalContentType(ct))
	for _, d := range denied {
		if strings.ToLower(strings.TrimSpace(d)) == ctLower {
			return true
		}
	}
	return false
}

// canonicalContentType strips any parameters (e.g. "; charset=utf-8") and
// lowercases the MIME identifier so comparisons are stable.
func canonicalContentType(ct string) string {
	ct = strings.TrimSpace(ct)
	if i := strings.IndexByte(ct, ';'); i >= 0 {
		ct = ct[:i]
	}
	return strings.ToLower(strings.TrimSpace(ct))
}

// contentDispositionFor returns an RFC 6266 Content-Disposition header value.
// Preview mode only applies to types in the allowlist; dangerous types
// (HTML, SVG, JS) are always attachment regardless.
func contentDispositionFor(filename, contentType string, preview bool) string {
	disposition := "attachment"
	if preview && previewAllowedContentTypes[canonicalContentType(contentType)] &&
		!dangerousContentTypes[canonicalContentType(contentType)] {
		disposition = "inline"
	}

	// Always emit both ASCII fallback (quoted, non-ASCII stripped) and the
	// RFC 5987 UTF-8 variant so every browser picks a sensible name.
	ascii := filenameASCIIFallback(filename)
	return disposition + `; filename="` + ascii + `"; filename*=UTF-8''` + url.PathEscape(filename)
}

func filenameASCIIFallback(name string) string {
	var sb strings.Builder
	sb.Grow(len(name))
	for _, r := range name {
		if r < 0x20 || r == 0x7f || r == '"' || r == '\\' {
			sb.WriteRune('_')
			continue
		}
		if r > 0x7f {
			sb.WriteRune('_')
			continue
		}
		sb.WriteRune(r)
	}
	out := sb.String()
	if out == "" {
		return "download"
	}
	return out
}

func fileETagFor(checksum string) string {
	return `"` + checksum + `"`
}

// fileObjectKeyFor places file bytes under a "files/" top-level prefix so the
// shared bucket (or a dedicated one) cleanly separates them from images.
func fileObjectKeyFor(opID, docID, fileID uuid.UUID, filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	// Refuse any extension that isn't obviously safe to tack onto a key.
	if len(ext) > 16 || strings.ContainsAny(ext, `/\`) {
		ext = ""
	}
	return path.Join("files", opID.String(), docID.String(), fileID.String()+ext)
}
