package wikiexport

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// MarkdownRenderer converts a document's Y.js content_state bytes into
// Outline-flavored markdown. Satisfied in production by
// *wiki.HocuspocusClient.YjsToMarkdown; tests substitute a fake.
type MarkdownRenderer interface {
	YjsToMarkdown(ctx context.Context, contentState []byte) (string, error)
}

// Orchestrator runs a wiki export end-to-end and streams the resulting zip
// to the caller's io.Writer. Holds long-lived dependencies; per-export
// state lives on the stack of Run.
type Orchestrator struct {
	docRepo    repository.IWikiDocumentRepository
	imageRepo  repository.IWikiImageRepository
	fileRepo   repository.IWikiFileRepository
	imageStore blob.ObjectStore
	fileStore  blob.ObjectStore
	renderer   MarkdownRenderer
	logger     *zap.Logger
	cfg        Config
}

// Config groups the runtime caps. Zero values fall back to documented
// defaults.
type Config struct {
	// MaxDocuments caps the number of documents in a single export.
	// Defaults to 5000 (matches the import cap).
	MaxDocuments int

	// MaxBodyBytes caps the total markdown body bytes across all docs in
	// the export. Defaults to 200 MiB.
	MaxBodyBytes int64

	// MaxAttachmentBytes caps the total attachment payload streamed into
	// the zip. Defaults to 1 GiB; exceeding it aborts the export.
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

// NewOrchestrator wires the export orchestrator with the dependencies it
// needs to read documents, look up attachment metadata, stream binaries
// from the object store, and convert Y.js bytes back to markdown.
func NewOrchestrator(
	docRepo repository.IWikiDocumentRepository,
	imageRepo repository.IWikiImageRepository,
	fileRepo repository.IWikiFileRepository,
	imageStore blob.ObjectStore,
	fileStore blob.ObjectStore,
	renderer MarkdownRenderer,
	logger *zap.Logger,
	cfg Config,
) *Orchestrator {
	return &Orchestrator{
		docRepo:    docRepo,
		imageRepo:  imageRepo,
		fileRepo:   fileRepo,
		imageStore: imageStore,
		fileStore:  fileStore,
		renderer:   renderer,
		logger:     logger,
		cfg:        cfg.withDefaults(),
	}
}

// SkipRecord describes one document that couldn't be exported and the
// reason. Surfaced in the EXPORT_REPORT.json sidecar bundled with the zip
// so the user can see what failed without watching server logs.
type SkipRecord struct {
	Path   string `json:"path"`
	Reason string `json:"reason"`
}

// Report summarises one export run. Always written as EXPORT_REPORT.json
// inside the zip; never returned to the HTTP caller because the response
// body is the zip stream itself.
type Report struct {
	RootTitle      string       `json:"rootTitle"`
	Scope          string       `json:"scope"`        // "tree" or "subtree"
	TotalDocs      int          `json:"totalDocs"`    // attempted
	ExportedDocs   int          `json:"exportedDocs"` // produced an .md
	SkippedDocs    int          `json:"skippedDocs"`  // counted in Skipped
	ImagesExported int          `json:"imagesExported"`
	FilesExported  int          `json:"filesExported"`
	Skipped        []SkipRecord `json:"skipped,omitempty"`
	Warnings       []SkipRecord `json:"warnings,omitempty"`
}

// Request describes one export run. RootID == nil means tree-wide export.
type Request struct {
	OperationID   uuid.UUID
	OperationName string // used as the root folder slug for tree exports
	RootID        *uuid.UUID
}

// Run reads the requested documents, renders each one to markdown, streams
// attachments, and writes everything into the supplied zip.Writer. The
// caller owns the lifecycle of the zip writer — Run does NOT call Close
// so the caller can append additional entries if needed.
func (o *Orchestrator) Run(ctx context.Context, zw *zip.Writer, req Request) (*Report, error) {
	docs, rootDoc, err := o.collectScope(ctx, req)
	if err != nil {
		return nil, err
	}
	if len(docs) > o.cfg.MaxDocuments {
		return nil, fmt.Errorf("export exceeds %d documents (got %d)",
			o.cfg.MaxDocuments, len(docs))
	}

	rootSlug := slugify(rootRootTitle(req, rootDoc))
	report := &Report{
		Scope:     scopeLabel(req),
		RootTitle: rootRootTitle(req, rootDoc),
		TotalDocs: len(docs),
	}

	// Build parent → children index, sorted by sort_order so the export
	// preserves the user's manual sibling order via filename prefixes.
	childrenByParent := map[uuid.UUID][]models.WikiDocument{}
	for _, d := range docs {
		var key uuid.UUID
		if d.ParentDocumentID != nil {
			key = *d.ParentDocumentID
		}
		childrenByParent[key] = append(childrenByParent[key], d)
	}
	for k := range childrenByParent {
		group := childrenByParent[k]
		sort.SliceStable(group, func(i, j int) bool {
			return group[i].SortOrder < group[j].SortOrder
		})
		childrenByParent[k] = group
	}

	// Determine the starting set of "root" documents inside the export
	// folder. For a subtree export, the explicit root is the single
	// top-level doc. For a tree export, the top level is whatever has a
	// nil parent inside the collected set (zero UUID key in the index).
	var topLevel []models.WikiDocument
	if rootDoc != nil {
		topLevel = []models.WikiDocument{*rootDoc}
	} else {
		topLevel = childrenByParent[uuid.UUID{}]
	}

	usedAtRoot := map[string]struct{}{
		"uploads":            {}, // reserved
		"export_report.json": {}, // reserved (lowercased to compare safely)
	}

	var totalBody int64
	var totalAttachments int64

	for i, top := range topLevel {
		o.writeBranch(ctx, branchCtx{
			zw:               zw,
			rootSlug:         rootSlug,
			parentFolderPath: rootSlug,
			depthFromRoot:    0,
			usedSlugs:        usedAtRoot,
			childrenByParent: childrenByParent,
			report:           report,
			totalBody:        &totalBody,
			totalAttachments: &totalAttachments,
		}, top, i)
	}

	// If this was a tree export and the user-visible operation had zero
	// docs, still emit the placeholder root folder so the zip isn't empty.
	if len(topLevel) == 0 {
		_, _ = zw.Create(rootSlug + "/.gitkeep")
	}

	return report, nil
}

// rootRootTitle picks the on-disk root folder's display title. Subtree
// exports use the root document's title; tree exports use the operation
// name. Falls back to "wiki" when both are blank.
func rootRootTitle(req Request, rootDoc *models.WikiDocument) string {
	if rootDoc != nil {
		t := strings.TrimSpace(rootDoc.Title)
		if t != "" {
			return t
		}
	}
	t := strings.TrimSpace(req.OperationName)
	if t != "" {
		return t
	}
	return "wiki"
}

func scopeLabel(req Request) string {
	if req.RootID != nil {
		return "subtree"
	}
	return "tree"
}

// collectScope returns the set of documents the export will render plus
// the explicit subtree root (nil for tree-wide exports). All trashed docs
// (deleted_at != nil) are filtered out.
func (o *Orchestrator) collectScope(
	ctx context.Context,
	req Request,
) ([]models.WikiDocument, *models.WikiDocument, error) {
	if req.RootID != nil {
		root, err := o.docRepo.FindByID(ctx, *req.RootID)
		if err != nil {
			return nil, nil, fmt.Errorf("find subtree root: %w", err)
		}
		if root.OperationID != req.OperationID {
			return nil, nil, fmt.Errorf("subtree root does not belong to operation")
		}
		if root.DeletedAt != nil {
			return nil, nil, fmt.Errorf("subtree root is in trash")
		}
		descendants, err := o.docRepo.FindDescendants(ctx, root.DocumentID)
		if err != nil {
			return nil, nil, fmt.Errorf("find descendants: %w", err)
		}
		// FindDescendants already filters trashed=false in the active
		// branch, but defensively re-check.
		out := make([]models.WikiDocument, 0, len(descendants)+1)
		out = append(out, root)
		for _, d := range descendants {
			if d.DeletedAt == nil {
				out = append(out, d)
			}
		}
		return out, &root, nil
	}

	all, err := o.docRepo.FindAllByOperationID(ctx, req.OperationID)
	if err != nil {
		return nil, nil, fmt.Errorf("find by operation: %w", err)
	}
	out := make([]models.WikiDocument, 0, len(all))
	for _, d := range all {
		if d.DeletedAt == nil {
			out = append(out, d)
		}
	}
	return out, nil, nil
}

// branchCtx carries the per-branch state for the recursive walk. Avoids
// passing eight scalars through every recursion frame.
type branchCtx struct {
	zw               *zip.Writer
	rootSlug         string
	parentFolderPath string
	depthFromRoot    int
	usedSlugs        map[string]struct{}
	childrenByParent map[uuid.UUID][]models.WikiDocument
	report           *Report
	totalBody        *int64
	totalAttachments *int64
}

func (o *Orchestrator) writeBranch(
	ctx context.Context,
	bctx branchCtx,
	doc models.WikiDocument,
	siblingIndex int,
) {
	slug := uniqueSlug(slugify(doc.Title), bctx.usedSlugs)
	docFilename := buildDocFilename(siblingIndex, slug)
	docZipPath := bctx.parentFolderPath + "/" + docFilename
	humanPath := docZipPath

	// Render the body. Empty content_state → empty body (the editor was
	// never opened for this doc, or it's a placeholder).
	body, err := o.renderer.YjsToMarkdown(ctx, doc.ContentState)
	if err != nil {
		o.logger.Warn("wiki export: yjs-to-markdown failed for doc",
			zap.String("document_id", doc.DocumentID.String()),
			zap.String("title", doc.Title),
			zap.Int("content_state_bytes", len(doc.ContentState)),
			zap.Error(err),
		)
		bctx.report.SkippedDocs++
		bctx.report.Skipped = append(bctx.report.Skipped, SkipRecord{
			Path:   humanPath,
			Reason: "render_failed: " + err.Error(),
		})
		return
	}
	// Diagnostic: empty body means the doc had no content_state (was never
	// opened in the editor) or the sidecar returned an empty render. Log
	// both cases so operators can see why a doc exported without content
	// or attachments. The doc still ships — its H1 alone is useful.
	if body == "" {
		o.logger.Info("wiki export: doc rendered to empty body",
			zap.String("document_id", doc.DocumentID.String()),
			zap.String("title", doc.Title),
			zap.Int("content_state_bytes", len(doc.ContentState)),
		)
	}

	// Body cap. The per-doc body is already small (≤ 1 MB at write time),
	// but the export-wide cap protects against a malicious operation with
	// thousands of full-1MB docs.
	if *bctx.totalBody+int64(len(body)) > o.cfg.MaxBodyBytes {
		bctx.report.SkippedDocs++
		bctx.report.Skipped = append(bctx.report.Skipped, SkipRecord{
			Path:   humanPath,
			Reason: "export_body_budget_exhausted",
		})
		return
	}

	// Stream attachments referenced by this doc and rewrite the body's
	// refs to the in-zip relative paths.
	rewritten := o.streamAttachmentsAndRewrite(ctx, bctx, doc, body, humanPath)

	*bctx.totalBody += int64(len(rewritten))

	full := renderDocMarkdown(doc.Emoji, doc.Title, doc.Icon, doc.Color, rewritten)
	if err := writeZipFile(bctx.zw, docZipPath, []byte(full)); err != nil {
		o.logger.Warn("write doc to zip failed",
			zap.String("path", docZipPath),
			zap.Error(err),
		)
		bctx.report.SkippedDocs++
		bctx.report.Skipped = append(bctx.report.Skipped, SkipRecord{
			Path:   humanPath,
			Reason: "zip_write_failed: " + err.Error(),
		})
		return
	}
	bctx.report.ExportedDocs++

	// Recurse into children using the matching folder name (same stem,
	// no .md extension).
	children := bctx.childrenByParent[doc.DocumentID]
	if len(children) == 0 {
		return
	}
	childrenFolder := buildChildrenFolder(siblingIndex, slug)
	childrenParentPath := bctx.parentFolderPath + "/" + childrenFolder
	childUsed := map[string]struct{}{}
	for i, child := range children {
		o.writeBranch(ctx, branchCtx{
			zw:               bctx.zw,
			rootSlug:         bctx.rootSlug,
			parentFolderPath: childrenParentPath,
			depthFromRoot:    bctx.depthFromRoot + 1,
			usedSlugs:        childUsed,
			childrenByParent: bctx.childrenByParent,
			report:           bctx.report,
			totalBody:        bctx.totalBody,
			totalAttachments: bctx.totalAttachments,
		}, child, i)
	}
}

// streamAttachmentsAndRewrite walks every wiki image/file ref in the body,
// streams the binary into `uploads/<documentId>/<attId>/<filename>` inside
// the zip, and rewrites the markdown ref to the relative path. Missing or
// failing attachments are logged + recorded as warnings; the original ref
// is left in place so the export still produces a usable .md file.
func (o *Orchestrator) streamAttachmentsAndRewrite(
	ctx context.Context,
	bctx branchCtx,
	doc models.WikiDocument,
	body string,
	humanPath string,
) string {
	imageIDs, fileIDs := collectAttachmentRefs(body)

	// Diagnostic: per-doc attachment fan-out. When a user reports "no
	// attachments in my export" this is the line that tells us whether
	// (a) the rendered body has no refs (sidecar / serializer issue), or
	// (b) refs were found but failed lookup / store fetch.
	o.logger.Info("wiki export: scanning doc for attachments",
		zap.String("document_id", doc.DocumentID.String()),
		zap.String("title", doc.Title),
		zap.Int("body_bytes", len(body)),
		zap.Int("image_refs", len(imageIDs)),
		zap.Int("file_refs", len(fileIDs)),
	)

	// Resolver closures share the per-doc state. The body rewrite happens
	// in a single pass after both maps are populated.
	imageRel := map[uuid.UUID]string{}
	fileRel := map[uuid.UUID]string{}

	// The export's security boundary is the operation, NOT the owning
	// document. A doc may legitimately reference an attachment owned by
	// another doc in the same operation — duplicated docs and cross-doc
	// paste both produce this state — and refusing those refs would leave
	// broken links in the exported markdown.
	for _, id := range imageIDs {
		img, err := o.imageRepo.FindByID(ctx, id)
		if err != nil {
			o.logger.Warn("wiki export: image lookup failed",
				zap.String("document_id", doc.DocumentID.String()),
				zap.String("image_id", id.String()),
				zap.Error(err),
			)
			bctx.report.Warnings = append(bctx.report.Warnings, SkipRecord{
				Path:   humanPath,
				Reason: "image_not_found: " + id.String(),
			})
			continue
		}
		if img.OperationID != doc.OperationID {
			o.logger.Warn("wiki export: image belongs to a different operation",
				zap.String("document_id", doc.DocumentID.String()),
				zap.String("image_id", id.String()),
				zap.String("image_operation", img.OperationID.String()),
				zap.String("doc_operation", doc.OperationID.String()),
			)
			bctx.report.Warnings = append(bctx.report.Warnings, SkipRecord{
				Path:   humanPath,
				Reason: "image_operation_mismatch: " + id.String(),
			})
			continue
		}
		if img.DeletedAt != nil {
			bctx.report.Warnings = append(bctx.report.Warnings, SkipRecord{
				Path:   humanPath,
				Reason: "image_deleted: " + id.String(),
			})
			continue
		}
		filename := sanitizeFilename(imageFilenameFor(id.String(), img.ContentType))
		zipPath := uploadsZipPath(bctx.rootSlug, doc.DocumentID, id, filename)
		if !o.streamBlob(ctx, bctx, o.imageStore, img.ObjectKey, zipPath, img.SizeBytes, humanPath) {
			continue
		}
		imageRel[id] = markdownRelativePath(bctx.depthFromRoot, doc.DocumentID, id, filename)
		bctx.report.ImagesExported++
	}

	for _, id := range fileIDs {
		file, err := o.fileRepo.FindByID(ctx, id)
		if err != nil {
			o.logger.Warn("wiki export: file lookup failed",
				zap.String("document_id", doc.DocumentID.String()),
				zap.String("file_id", id.String()),
				zap.Error(err),
			)
			bctx.report.Warnings = append(bctx.report.Warnings, SkipRecord{
				Path:   humanPath,
				Reason: "file_not_found: " + id.String(),
			})
			continue
		}
		if file.OperationID != doc.OperationID {
			o.logger.Warn("wiki export: file belongs to a different operation",
				zap.String("document_id", doc.DocumentID.String()),
				zap.String("file_id", id.String()),
				zap.String("file_operation", file.OperationID.String()),
				zap.String("doc_operation", doc.OperationID.String()),
			)
			bctx.report.Warnings = append(bctx.report.Warnings, SkipRecord{
				Path:   humanPath,
				Reason: "file_operation_mismatch: " + id.String(),
			})
			continue
		}
		if file.DeletedAt != nil {
			bctx.report.Warnings = append(bctx.report.Warnings, SkipRecord{
				Path:   humanPath,
				Reason: "file_deleted: " + id.String(),
			})
			continue
		}
		filename := sanitizeFilename(file.Filename)
		zipPath := uploadsZipPath(bctx.rootSlug, doc.DocumentID, id, filename)
		if !o.streamBlob(ctx, bctx, o.fileStore, file.ObjectKey, zipPath, file.SizeBytes, humanPath) {
			continue
		}
		fileRel[id] = markdownRelativePath(bctx.depthFromRoot, doc.DocumentID, id, filename)
		bctx.report.FilesExported++
	}

	return rewriteAttachmentRefs(body,
		func(id uuid.UUID) (string, bool) {
			rel, ok := imageRel[id]
			return rel, ok
		},
		func(id uuid.UUID) (string, bool) {
			rel, ok := fileRel[id]
			return rel, ok
		},
	)
}

// streamBlob copies an object store blob into a zip entry. Returns true on
// success; false (plus a warnings entry) on any failure path.
func (o *Orchestrator) streamBlob(
	ctx context.Context,
	bctx branchCtx,
	store blob.ObjectStore,
	objectKey, zipPath string,
	declaredSize int64,
	humanPath string,
) bool {
	if *bctx.totalAttachments+declaredSize > o.cfg.MaxAttachmentBytes {
		bctx.report.Warnings = append(bctx.report.Warnings, SkipRecord{
			Path:   humanPath,
			Reason: "attachment_budget_exhausted",
		})
		return false
	}

	reader, info, err := store.Get(ctx, objectKey)
	if err != nil {
		bctx.report.Warnings = append(bctx.report.Warnings, SkipRecord{
			Path:   humanPath,
			Reason: "blob_get_failed: " + err.Error(),
		})
		return false
	}
	defer reader.Close()

	w, err := bctx.zw.Create(zipPath)
	if err != nil {
		bctx.report.Warnings = append(bctx.report.Warnings, SkipRecord{
			Path:   humanPath,
			Reason: "zip_create_failed: " + err.Error(),
		})
		return false
	}
	n, err := io.Copy(w, reader)
	if err != nil {
		bctx.report.Warnings = append(bctx.report.Warnings, SkipRecord{
			Path:   humanPath,
			Reason: "blob_copy_failed: " + err.Error(),
		})
		return false
	}
	if info.ContentLength > 0 && n != info.ContentLength {
		o.logger.Warn("blob copy size mismatch",
			zap.String("object_key", objectKey),
			zap.Int64("copied", n),
			zap.Int64("expected", info.ContentLength),
		)
	}
	*bctx.totalAttachments += n
	return true
}

// writeZipFile creates one zip entry and writes the given bytes to it.
// Helper exists so the call sites stay short.
func writeZipFile(zw *zip.Writer, path string, body []byte) error {
	w, err := zw.Create(path)
	if err != nil {
		return err
	}
	_, err = io.Copy(w, bytes.NewReader(body))
	return err
}

// imageFilenameFor reconstructs a filename for an image whose original
// upload name we don't store. WikiImage keeps only the MIME type, so the
// export emits `<imageId>.<ext>`. Falls back to `.bin` for unknown types.
func imageFilenameFor(imageID, contentType string) string {
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
