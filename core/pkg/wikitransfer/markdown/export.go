package markdown

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer"
	"go.uber.org/zap"
)

// Renderer converts a document's Y.js content_state into markdown.
// Satisfied by *wiki.HocuspocusClient.
type Renderer interface {
	YjsToMarkdown(ctx context.Context, contentState []byte) (string, error)
}

// Config caps one export.
type Config struct {
	// MaxDocuments caps the pages in one export. Default 5000.
	MaxDocuments int
	// MaxBodyBytes caps total markdown bytes. Default 200 MiB.
	MaxBodyBytes int64
	// MaxAttachmentBytes caps total attachment bytes. Default 1 GiB.
	MaxAttachmentBytes int64
}

func (c Config) withDefaults() Config {
	if c.MaxDocuments <= 0 {
		c.MaxDocuments = 5000
	}
	if c.MaxBodyBytes <= 0 {
		c.MaxBodyBytes = 200 * 1024 * 1024
	}
	if c.MaxAttachmentBytes <= 0 {
		c.MaxAttachmentBytes = 1 << 30
	}
	return c
}

// Exporter renders a Scope to the Outline-flavoured markdown zip that
// ReadPlan reads back. Lossy by design: it is the foreign format.
type Exporter struct {
	imageRepo   repository.IWikiImageRepository
	fileRepo    repository.IWikiFileRepository
	imageStore  blob.ObjectStore
	fileStore   blob.ObjectStore
	renderer    Renderer
	credentials CredentialLookup
	logger      *zap.Logger
	cfg         Config
}

// NewExporter wires the exporter. credentials may be nil, leaving every
// credential fence id-only.
func NewExporter(
	imageRepo repository.IWikiImageRepository,
	fileRepo repository.IWikiFileRepository,
	imageStore, fileStore blob.ObjectStore,
	renderer Renderer,
	credentials CredentialLookup,
	logger *zap.Logger,
	cfg Config,
) *Exporter {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Exporter{
		imageRepo: imageRepo, fileRepo: fileRepo, imageStore: imageStore, fileStore: fileStore,
		renderer: renderer, credentials: credentials, logger: logger, cfg: cfg.withDefaults(),
	}
}

type exportRun struct {
	e                *Exporter
	zw               *zip.Writer
	scope            *wikitransfer.Scope
	rootSlug         string
	report           *wikitransfer.ExportReport
	totalBody        int64
	totalAttachments int64
	progress         wikitransfer.Progress
	done             int
}

// Run writes the scope into zw. The caller owns zw and closes it; Run
// writes REPORT.json as its last entry so a partial archive still explains
// itself.
func (e *Exporter) Run(ctx context.Context, zw *zip.Writer, scope *wikitransfer.Scope, progress wikitransfer.Progress) (*wikitransfer.ExportReport, error) {
	if len(scope.Docs) > e.cfg.MaxDocuments {
		return nil, fmt.Errorf("export exceeds %d documents (got %d)", e.cfg.MaxDocuments, len(scope.Docs))
	}
	r := &exportRun{
		e: e, zw: zw, scope: scope, rootSlug: slugify(scope.Title()), progress: progress,
		report: &wikitransfer.ExportReport{
			BundleID: uuid.New(), Format: "markdown", Scope: scope.Label(), RootTitle: scope.Title(), TotalDocs: len(scope.Docs),
		},
	}
	used := map[string]struct{}{"uploads": {}, "report.json": {}}
	for i, top := range scope.TopLevel {
		r.writeBranch(ctx, top, r.rootSlug, 0, used, i)
	}
	if len(scope.TopLevel) == 0 {
		_, _ = zw.Create(r.rootSlug + "/.gitkeep")
	}
	if err := writeJSON(zw, "REPORT.json", r.report); err != nil {
		return r.report, fmt.Errorf("write report: %w", err)
	}
	return r.report, nil
}

func (r *exportRun) advance() {
	r.done++
	if r.progress != nil {
		r.progress(r.done, r.report.TotalDocs)
	}
}

func (r *exportRun) writeBranch(ctx context.Context, doc models.WikiDocument, folder string, depth int, used map[string]struct{}, siblingIndex int) {
	slug := uniqueSlug(slugify(doc.Title), used)
	docPath := folder + "/" + buildDocFilename(siblingIndex, slug)

	body, err := r.e.renderer.YjsToMarkdown(ctx, doc.ContentState)
	if err != nil {
		r.report.Skip(docPath, "render_failed: "+err.Error())
		r.advance()
		return
	}
	if r.totalBody+int64(len(body)) > r.e.cfg.MaxBodyBytes {
		r.report.Skip(docPath, "export_body_budget_exhausted")
		r.advance()
		return
	}

	body, hydrated, tombstoned := hydrateCredentialFences(ctx, body, doc.OperationID, r.e.credentials)
	r.report.CredentialsExported += hydrated
	r.report.CredentialsTombstoned += tombstoned

	body = r.streamAttachments(ctx, doc, body, docPath)
	r.totalBody += int64(len(body))

	full := renderDocMarkdown(doc.Emoji, doc.Title, doc.Icon, doc.Color, body)
	if err := writeZipFile(r.zw, docPath, []byte(full)); err != nil {
		r.report.Skip(docPath, "zip_write_failed: "+err.Error())
		r.advance()
		return
	}
	r.report.ExportedDocs++
	r.advance()

	children := r.scope.ChildrenByParent[doc.DocumentID]
	if len(children) == 0 {
		return
	}
	childFolder := folder + "/" + buildChildrenFolder(siblingIndex, slug)
	childUsed := map[string]struct{}{}
	for i, child := range children {
		r.writeBranch(ctx, child, childFolder, depth+1, childUsed, i)
	}
}

// streamAttachments copies every attachment the body references into
// uploads/<docId>/<attId>/<filename> and rewrites the links. The security
// boundary is the operation, not the owning page: a page may legitimately
// reference an attachment another page uploaded.
func (r *exportRun) streamAttachments(ctx context.Context, doc models.WikiDocument, body, docPath string) string {
	imageIDs, fileIDs := collectAttachmentRefs(body)
	imageRel := map[uuid.UUID]string{}
	fileRel := map[uuid.UUID]string{}

	for _, id := range imageIDs {
		img, err := r.e.imageRepo.FindByID(ctx, id)
		switch {
		case err != nil:
			r.report.Warn(docPath, "image_not_found: "+id.String())
			continue
		case img.OperationID != doc.OperationID:
			r.report.Warn(docPath, "image_operation_mismatch: "+id.String())
			continue
		case img.DeletedAt != nil:
			r.report.Warn(docPath, "image_deleted: "+id.String())
			continue
		}
		filename := sanitizeFilename(ImageFilenameFor(id.String(), img.ContentType))
		zipPath := uploadsZipPath(r.rootSlug, doc.DocumentID, id, filename)
		if !r.streamBlob(ctx, r.e.imageStore, img.ObjectKey, zipPath, img.SizeBytes, docPath) {
			continue
		}
		imageRel[id] = markdownRelativePath(0, doc.DocumentID, id, filename)
		r.report.ImagesExported++
	}
	for _, id := range fileIDs {
		file, err := r.e.fileRepo.FindByID(ctx, id)
		switch {
		case err != nil:
			r.report.Warn(docPath, "file_not_found: "+id.String())
			continue
		case file.OperationID != doc.OperationID:
			r.report.Warn(docPath, "file_operation_mismatch: "+id.String())
			continue
		case file.DeletedAt != nil:
			r.report.Warn(docPath, "file_deleted: "+id.String())
			continue
		}
		filename := sanitizeFilename(file.Filename)
		zipPath := uploadsZipPath(r.rootSlug, doc.DocumentID, id, filename)
		if !r.streamBlob(ctx, r.e.fileStore, file.ObjectKey, zipPath, file.SizeBytes, docPath) {
			continue
		}
		fileRel[id] = markdownRelativePath(0, doc.DocumentID, id, filename)
		r.report.FilesExported++
	}

	return rewriteAttachmentRefs(body,
		func(id uuid.UUID) (string, bool) { rel, ok := imageRel[id]; return rel, ok },
		func(id uuid.UUID) (string, bool) { rel, ok := fileRel[id]; return rel, ok },
	)
}

func (r *exportRun) streamBlob(ctx context.Context, store blob.ObjectStore, objectKey, zipPath string, declaredSize int64, docPath string) bool {
	if r.totalAttachments+declaredSize > r.e.cfg.MaxAttachmentBytes {
		r.report.Warn(docPath, "attachment_budget_exhausted")
		return false
	}
	reader, _, err := store.Get(ctx, objectKey)
	if err != nil {
		r.report.Warn(docPath, "blob_get_failed: "+err.Error())
		return false
	}
	defer reader.Close()
	w, err := r.zw.Create(zipPath)
	if err != nil {
		r.report.Warn(docPath, "zip_create_failed: "+err.Error())
		return false
	}
	n, err := io.Copy(w, reader)
	if err != nil {
		r.report.Warn(docPath, "blob_copy_failed: "+err.Error())
		return false
	}
	r.totalAttachments += n
	return true
}

func writeZipFile(zw *zip.Writer, path string, body []byte) error {
	w, err := zw.Create(path)
	if err != nil {
		return err
	}
	_, err = io.Copy(w, bytes.NewReader(body))
	return err
}

func writeJSON(zw *zip.Writer, path string, v any) error {
	w, err := zw.Create(path)
	if err != nil {
		return err
	}
	return wikitransfer.EncodeJSON(w, v)
}

// ImageFilenameFor reconstructs a filename for an image whose original
// upload name is not stored: `<imageId>.<ext>`, `.bin` for unknown types.
func ImageFilenameFor(imageID, contentType string) string {
	ext := ".bin"
	switch contentType {
	case "image/png":
		ext = ".png"
	case "image/jpeg":
		ext = ".jpg"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	case "image/avif":
		ext = ".avif"
	case "image/svg+xml":
		ext = ".svg"
	}
	return imageID + ext
}
