package controller

import (
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/permissions"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/skills"
)

// skillMultipartMemory is how much of an upload gin keeps in memory before
// spilling to disk. The service caps the bundle size itself.
const skillMultipartMemory = 8 << 20

// SkillController is the operator-facing half of the community skill
// registry: publish a zip, download one.
//
// Uploads are multipart rather than GraphQL for the same reason wiki images
// and file attachments are: a mutation would have to carry the bytes as a
// string, and a skill bundle has no business passing through a JSON document.
// Listing and the small mutations (snooze, remove, reassign) live in GraphQL
// where the rest of the SPA's data does.
type SkillController struct {
	svc    *skills.Service
	logger *zap.Logger
}

func NewSkillController(svc *skills.Service, logger *zap.Logger) *SkillController {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &SkillController{svc: svc, logger: logger}
}

// Publish godoc
//
//	@Summary		Publish a skill
//	@Description	Uploads a zip as a new version of a named skill, claiming the name if it is free. Only the operator who claimed a name may publish new versions of it; an administrator may publish to any name.
//	@Tags			skills
//	@Accept			multipart/form-data
//	@Produce		json
//	@Param			name		formData	string	true	"Skill name; normalized to a slug"
//	@Param			description	formData	string	false	"One-line description shown in the listing"
//	@Param			notes		formData	string	false	"What changed in this version"
//	@Param			file		formData	file	true	"The skill bundle, as a zip"
//	@Success		201			{object}	skillPublishResponse
//	@Failure		400			{object}	responses.ErrorResponse
//	@Failure		403			{object}	responses.ErrorResponse
//	@Failure		413			{object}	responses.ErrorResponse
//	@Router			/skills [post]
func (sc *SkillController) Publish(c *gin.Context) {
	publisherID, err := uuid.Parse(c.GetString("userID"))
	if err != nil {
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	if err := c.Request.ParseMultipartForm(skillMultipartMemory); err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("expected a multipart/form-data body: %s", err.Error()))
		return
	}
	header, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("file is required"))
		return
	}
	// Check the declared size before reading, so an oversized upload is
	// refused without buffering all of it.
	if header.Size > sc.svc.MaxSize() {
		c.JSON(http.StatusRequestEntityTooLarge, responses.NewErrorResponse("the bundle is %d bytes; the limit is %d", header.Size, sc.svc.MaxSize()))
		return
	}
	raw, err := readFormFile(header)
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("could not read the uploaded file: %s", err.Error()))
		return
	}

	result, err := sc.svc.Publish(c.Request.Context(), skills.PublishInput{
		Name:          c.PostForm("name"),
		Description:   c.PostForm("description"),
		Notes:         c.PostForm("notes"),
		Bytes:         raw,
		PublisherID:   publisherID,
		PublisherName: c.GetString("username"),
		IsAdmin:       hasAdminRole(c),
	})
	if err != nil {
		sc.writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusCreated, skillPublishResponse{
		Name:        result.Skill.Name,
		Version:     result.Version.Version,
		Claimed:     result.Claimed,
		SizeBytes:   result.Version.SizeBytes,
		Checksum:    result.Version.Checksum,
		DownloadURL: "/api/v1/skills/" + result.Skill.Name + "/download",
	})
}

// skillPublishResponse is what a successful publish tells the caller.
type skillPublishResponse struct {
	Name        string `json:"name"`
	Version     int    `json:"version"`
	Claimed     bool   `json:"claimed"`
	SizeBytes   int64  `json:"sizeBytes"`
	Checksum    string `json:"checksum"`
	DownloadURL string `json:"downloadUrl"`
}

// Download godoc
//
//	@Summary		Download a skill
//	@Description	Streams a skill bundle as a zip. Without a version the current one is served. The download is recorded so the operator can be told when a newer version is published.
//	@Tags			skills
//	@Produce		application/zip
//	@Param			name	path		string	true	"Skill name"
//	@Param			version	query		int		false	"Version; defaults to the current one"
//	@Success		200		{file}		binary
//	@Failure		404		{object}	responses.ErrorResponse
//	@Router			/skills/{name}/download [get]
func (sc *SkillController) Download(c *gin.Context) {
	version := 0
	if raw := c.Query("version"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 {
			c.JSON(http.StatusBadRequest, responses.NewErrorResponse("version must be a positive whole number"))
			return
		}
		version = parsed
	}

	body, skill, row, err := sc.svc.Download(c.Request.Context(), c.Param("name"), version)
	if err != nil {
		sc.writeServiceError(c, err)
		return
	}
	defer body.Close()

	if userID, parseErr := uuid.Parse(c.GetString("userID")); parseErr == nil {
		sc.svc.RecordDownload(c.Request.Context(), userID, skill.SkillID, row.Version)
	}

	writeSkillBundle(c, skills.Filename(skill.Name, row.Version), row.SizeBytes, body)
}

// writeSkillBundle sends the bytes with headers that make it a download and
// nothing else. A skill bundle is content one operator wrote for another to
// run, so it is never served in a way a browser might render or sniff.
func writeSkillBundle(c *gin.Context, filename string, size int64, body io.Reader) {
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Security-Policy", "default-src 'none'; sandbox")
	c.Header("Cache-Control", "private, no-store")
	if size > 0 {
		c.Header("Content-Length", strconv.FormatInt(size, 10))
	}
	c.Status(http.StatusOK)
	if _, err := io.Copy(c.Writer, body); err != nil {
		// The status line is already out; there is nothing to say but this.
		c.Error(err) //nolint:errcheck // gin records it for the request log
	}
}

// writeServiceError maps a service failure onto a status, keeping the
// operator-facing wording and hiding the cause of a fault.
func (sc *SkillController) writeServiceError(c *gin.Context, err error) {
	var svcErr *skills.Error
	if errors.As(err, &svcErr) {
		if !svcErr.IsPolicy() {
			sc.logger.Error("skills: request failed", zap.Error(svcErr.Cause), zap.String("message", svcErr.Message))
		}
		c.JSON(svcErr.Status, responses.NewErrorResponse("%s", svcErr.Message))
		return
	}
	sc.logger.Error("skills: unexpected failure", zap.Error(err))
	c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
}

// readFormFile reads one multipart part fully into memory. The size cap is
// checked against the declared size before this runs.
func readFormFile(header *multipart.FileHeader) ([]byte, error) {
	f, err := header.Open()
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(f)
}

// hasAdminRole reports whether the caller holds the wildcard permission.
func hasAdminRole(c *gin.Context) bool {
	raw, ok := c.Get("roles")
	if !ok {
		return false
	}
	roles, ok := raw.([]string)
	if !ok {
		return false
	}
	return permissions.HasPermissionForRoles(roles, permissions.AdminPermission)
}
