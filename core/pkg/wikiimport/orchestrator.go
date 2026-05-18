package wikiimport

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
	"go.uber.org/zap"
)

// ImageIngestor is satisfied by *controller.WikiImageController.IngestImage.
// Defined locally so the orchestrator doesn't import the controller package.
type ImageIngestor interface {
	IngestImage(
		ctx context.Context,
		doc *models.WikiDocument,
		uploaderID uuid.UUID,
		body io.Reader,
	) (*models.WikiImage, *wiki.IngestError)
}

// FileIngestor is satisfied by *controller.WikiFileController.IngestFile.
type FileIngestor interface {
	IngestFile(
		ctx context.Context,
		doc *models.WikiDocument,
		uploaderID uuid.UUID,
		body io.Reader,
		filename string,
		declaredContentType string,
	) (*models.WikiFile, *wiki.IngestError)
}

// MarkdownConverter is satisfied by *wiki.HocuspocusClient.MarkdownToYjs.
// Lets tests substitute a fake without spinning up the sidecar.
type MarkdownConverter interface {
	MarkdownToYjs(ctx context.Context, markdown string) ([]byte, error)
}

// Orchestrator runs an Outline-export ingest end-to-end. Holds the long-
// lived dependencies; the per-import state lives entirely on the stack of
// Run.
type Orchestrator struct {
	docRepo   repository.IWikiDocumentRepository
	imageIn   ImageIngestor
	fileIn    FileIngestor
	converter MarkdownConverter
	eventBus  eventbus.IEventBus
	logger    *zap.Logger

	// importParentMu serialises the lookup-or-create of the singleton
	// "import" parent per operation. Without this, two concurrent imports
	// for the same operation could each create their own "import" root.
	// Keyed by operation ID. Process-local for v1; a Mongo unique index
	// is the durable follow-up.
	importParentMu sync.Mutex
}

// NewOrchestrator constructs an orchestrator wired up to the live
// repository and ingest helpers. eventBus may be nil in tests — when nil,
// the orchestrator skips post-import event publication.
func NewOrchestrator(
	docRepo repository.IWikiDocumentRepository,
	imageIn ImageIngestor,
	fileIn FileIngestor,
	converter MarkdownConverter,
	eventBus eventbus.IEventBus,
	logger *zap.Logger,
) *Orchestrator {
	return &Orchestrator{
		docRepo:   docRepo,
		imageIn:   imageIn,
		fileIn:    fileIn,
		converter: converter,
		eventBus:  eventBus,
		logger:    logger,
	}
}

// Report summarises the result of an import. Returned to the caller and
// surfaced in the HTTP response body.
type Report struct {
	ImportParentID    uuid.UUID    `json:"importParentId"`
	TimestampParentID uuid.UUID    `json:"timestampParentId"`
	TotalDocs         int          `json:"totalDocs"`
	CreatedDocs       int          `json:"createdDocs"`
	SkippedDocs       int          `json:"skippedDocs"`
	ImagesIngested    int          `json:"imagesIngested"`
	FilesIngested     int          `json:"filesIngested"`
	Skipped           []SkipRecord `json:"skipped,omitempty"`
	Warnings          []SkipRecord `json:"warnings,omitempty"`
}

// SkipRecord captures one document that was skipped or warned about. Path
// is a slash-joined human-readable trail (e.g. "test/long-deep/foo").
type SkipRecord struct {
	Path   string `json:"path"`
	Reason string `json:"reason"`
}

// Run executes the import. operationID is the target operation; callerID
// is the user who will own every created doc/attachment as CreatedByID /
// UploadedByID. The export must already be parsed; the orchestrator does
// not stream the zip itself.
//
// Errors returned by Run are request-level — bad input or unrecoverable
// infra failures. Per-document failures are recorded in the report's
// Skipped list rather than aborting the whole import.
func (o *Orchestrator) Run(
	ctx context.Context,
	operationID, callerID uuid.UUID,
	export *ParsedExport,
) (*Report, error) {
	if export == nil {
		return nil, fmt.Errorf("nil export")
	}

	report := &Report{}

	// Holding-pen folders: import/<ISO timestamp>/<collection>/...
	importParent, err := o.findOrCreateImportParent(ctx, operationID, callerID)
	if err != nil {
		return nil, fmt.Errorf("find-or-create import parent: %w", err)
	}
	report.ImportParentID = importParent.DocumentID

	timestampLabel := time.Now().UTC().Format(time.RFC3339)
	timestampParent, err := o.createDoc(ctx, docCreateInput{
		operationID: operationID,
		callerID:    callerID,
		parent:      &importParent.DocumentID,
		title:       timestampLabel,
		sortOrder:   timestampLabel, // lexicographic ordering is naturally chronological
	})
	if err != nil {
		return nil, fmt.Errorf("create timestamp parent: %w", err)
	}
	report.TimestampParentID = timestampParent.DocumentID

	for _, coll := range export.Collections {
		collectionParent, err := o.createDoc(ctx, docCreateInput{
			operationID: operationID,
			callerID:    callerID,
			parent:      &timestampParent.DocumentID,
			title:       coll.Name,
			sortOrder:   coll.Name,
		})
		if err != nil {
			report.Skipped = append(report.Skipped, SkipRecord{
				Path:   coll.Name,
				Reason: "create collection parent failed: " + err.Error(),
			})
			continue
		}

		o.processDocs(ctx, processCtx{
			export:         export,
			operationID:    operationID,
			callerID:       callerID,
			report:         report,
			collectionName: coll.Name,
		}, coll.Documents, collectionParent.DocumentID, coll.Name+"/")
	}

	// Single wikiDocumentChanged event for the freshly-created timestamp
	// parent. The frontend's SSE handler invalidates the op's whole tree
	// and per-parent children caches on any wiki event, so one notification
	// covers every newly-created descendant. Actor = the importing user so
	// the subscription filter passes the event back to their own stream
	// (see core/pkg/graphql/resolver/subscription_helpers.go).
	if o.eventBus != nil {
		o.eventBus.Publish(eventbus.NewWikiDocumentCreatedEvent(
			eventbus.UserActor(callerID.String()),
			eventbus.WikiDocumentEventPayload{
				DocumentID:       timestampParent.DocumentID.String(),
				OperationID:      operationID.String(),
				ParentDocumentID: importParent.DocumentID.String(),
				Title:            timestampParent.Title,
			},
		))
	}

	return report, nil
}

// processCtx bundles the per-import context that recursive document
// processing needs. Avoids passing seven scalars through every recursion.
type processCtx struct {
	export         *ParsedExport
	operationID    uuid.UUID
	callerID       uuid.UUID
	report         *Report
	collectionName string // prepended when resolving an attachment ref to a zip path
}

func (o *Orchestrator) processDocs(
	ctx context.Context,
	pctx processCtx,
	docs []*Doc,
	parentID uuid.UUID,
	pathPrefix string,
) {
	for i, parsed := range docs {
		pctx.report.TotalDocs++

		humanPath := pathPrefix + parsed.SortKey

		// Title cap: truncate with warning rather than skip — losing a few
		// characters is a much smaller fidelity loss than dropping the doc.
		title := parsed.Title
		if len(title) > maxTitleLength {
			title = title[:maxTitleLength-1] + "…"
			pctx.report.Warnings = append(pctx.report.Warnings, SkipRecord{
				Path:   humanPath,
				Reason: "title_truncated",
			})
		}

		// Body cap: skip outright if it doesn't fit; the editor would
		// reject it on save anyway.
		if len(parsed.BodyMarkdown) > maxContentSize {
			pctx.report.SkippedDocs++
			pctx.report.Skipped = append(pctx.report.Skipped, SkipRecord{
				Path:   humanPath,
				Reason: "content_too_large",
			})
			continue
		}

		created, err := o.createDoc(ctx, docCreateInput{
			operationID: pctx.operationID,
			callerID:    pctx.callerID,
			parent:      &parentID,
			title:       title,
			emoji:       parsed.Emoji,
			sortOrder:   fractionalIndex(i),
		})
		if err != nil {
			if errors.Is(err, errDepthExceeded) {
				pctx.report.SkippedDocs++
				pctx.report.Skipped = append(pctx.report.Skipped, SkipRecord{
					Path:   humanPath,
					Reason: "depth_exceeded",
				})
				continue
			}
			pctx.report.SkippedDocs++
			pctx.report.Skipped = append(pctx.report.Skipped, SkipRecord{
				Path:   humanPath,
				Reason: "create_failed: " + err.Error(),
			})
			continue
		}

		// Ingest attachments and rewrite the body's URL references in one
		// pass. If any one attachment fails, we leave the original
		// markdown reference in place — readers will see a broken link
		// but the doc still imports.
		rewrittenBody := o.ingestAttachmentsAndRewrite(ctx, pctx, parsed, created)

		// Markdown → Y.js binary via the Hocuspocus sidecar.
		contentState, err := o.converter.MarkdownToYjs(ctx, rewrittenBody)
		if err != nil {
			o.logger.Warn("markdown-to-yjs conversion failed",
				zap.String("document_id", created.DocumentID.String()),
				zap.Error(err),
			)
			pctx.report.SkippedDocs++
			pctx.report.Skipped = append(pctx.report.Skipped, SkipRecord{
				Path:   humanPath,
				Reason: "convert_failed: " + err.Error(),
			})
			continue
		}

		// Persist Content + ContentState atomically. The seeded ContentState
		// is what defends against the empty-Y.Doc-on-first-edit destruction
		// path described in docs/wiki-outline-import.md §3.
		now := time.Now().UTC()
		if err := o.docRepo.Update(ctx, created, map[string]interface{}{
			"content":          rewrittenBody,
			"content_state":    contentState,
			"content_state_at": now,
			"last_updated_at":  now,
		}); err != nil {
			o.logger.Warn("seed content_state failed",
				zap.String("document_id", created.DocumentID.String()),
				zap.Error(err),
			)
			pctx.report.SkippedDocs++
			pctx.report.Skipped = append(pctx.report.Skipped, SkipRecord{
				Path:   humanPath,
				Reason: "seed_failed: " + err.Error(),
			})
			continue
		}

		pctx.report.CreatedDocs++

		// Recurse into children with the new doc as their parent.
		if len(parsed.Children) > 0 {
			o.processDocs(ctx, pctx, parsed.Children, created.DocumentID, humanPath+"/")
		}
	}
}

// ingestAttachmentsAndRewrite uploads each attachment referenced in parsed
// and returns the body markdown with the new URLs substituted for the
// original uploads/... paths.
func (o *Orchestrator) ingestAttachmentsAndRewrite(
	ctx context.Context,
	pctx processCtx,
	parsed *Doc,
	owner *models.WikiDocument,
) string {
	body := parsed.BodyMarkdown
	for _, ref := range parsed.AttachmentRefs {
		// `ref` is the URL-encoded zip path *relative to the collection
		// root* as it appears in the markdown. The AttachmentBlobs map
		// keys are full zip paths, so we prefix the collection name and
		// decode the URL-escapes before lookup.
		decoded := pctx.collectionName + "/" + decodeURLPath(ref)
		blob, ok := pctx.export.AttachmentBlobs[decoded]
		if !ok {
			// Older Outline exports may not URL-encode every character;
			// retry with the as-written form.
			blob, ok = pctx.export.AttachmentBlobs[pctx.collectionName+"/"+ref]
		}
		if !ok {
			o.logger.Warn("attachment blob not found in zip",
				zap.String("ref", ref),
				zap.String("document_id", owner.DocumentID.String()),
			)
			continue
		}

		newURL, ingested, err := o.ingestOneAttachment(ctx, pctx, owner, blob)
		if err != nil {
			o.logger.Warn("attachment ingest failed",
				zap.String("ref", ref),
				zap.String("document_id", owner.DocumentID.String()),
				zap.Error(err),
			)
			continue
		}

		// Replace every occurrence of the markdown reference (the form
		// inside the parentheses) with the new URL.
		body = strings.ReplaceAll(body, ref, newURL)

		switch ingested {
		case ingestedImage:
			pctx.report.ImagesIngested++
		case ingestedFile:
			pctx.report.FilesIngested++
		}
	}
	return body
}

type ingestedKind int

const (
	ingestedNone ingestedKind = iota
	ingestedImage
	ingestedFile
)

// ingestOneAttachment opens a zip entry and routes it to the image or file
// ingestor based on its filename. Returns the new URL to substitute into
// the markdown body, the kind for accounting, and any error.
//
// Note: the markdown reference may include a title hint (e.g.
// `path/img.png " =763x367"`); we preserve it by appending it to the new
// URL inside the rewritten link so the size hint still drives the
// frontend's wikiNotice / image attribute extraction. Images: the size
// hint goes between the URL and the closing paren in our markdown form.
func (o *Orchestrator) ingestOneAttachment(
	ctx context.Context,
	pctx processCtx,
	owner *models.WikiDocument,
	blob *zip.File,
) (string, ingestedKind, error) {
	rc, err := blob.Open()
	if err != nil {
		return "", ingestedNone, err
	}
	defer rc.Close()

	filename := sanitizeImportFilename(path.Base(blob.Name))
	ct := guessContentType(filename)

	if isImageMime(ct) {
		img, ierr := o.imageIn.IngestImage(ctx, owner, pctx.callerID, rc)
		if ierr != nil {
			return "", ingestedNone, fmt.Errorf("ingest image: %s", ierr.Message)
		}
		return "/api/v1/wiki/images/" + img.ImageID.String(), ingestedImage, nil
	}

	file, ierr := o.fileIn.IngestFile(ctx, owner, pctx.callerID, rc, filename, ct)
	if ierr != nil {
		return "", ingestedNone, fmt.Errorf("ingest file: %s", ierr.Message)
	}
	return "/api/v1/wiki/files/" + file.FileID.String(), ingestedFile, nil
}

// findOrCreateImportParent looks up the singleton "import" root document
// for an operation, or creates it if missing. Concurrent imports for the
// same operation are serialised on a process-local mutex so the lookup-
// or-create is atomic.
//
// v1 operates without a Mongo unique index; the follow-up note in the
// implementation plan calls for adding `(operation_id, parent_document_id,
// title_lower)` for cross-process safety.
func (o *Orchestrator) findOrCreateImportParent(
	ctx context.Context,
	operationID, callerID uuid.UUID,
) (*models.WikiDocument, error) {
	o.importParentMu.Lock()
	defer o.importParentMu.Unlock()

	all, err := o.docRepo.FindAllByOperationID(ctx, operationID)
	if err != nil {
		return nil, err
	}
	for i := range all {
		d := &all[i]
		if d.ParentDocumentID == nil &&
			d.DeletedAt == nil &&
			strings.EqualFold(d.Title, importParentTitle) {
			return d, nil
		}
	}

	return o.createDoc(ctx, docCreateInput{
		operationID: operationID,
		callerID:    callerID,
		title:       importParentTitle,
		emoji:       importParentEmoji,
		sortOrder:   "0", // sort early relative to imported timestamps
	})
}

type docCreateInput struct {
	operationID uuid.UUID
	callerID    uuid.UUID
	parent      *uuid.UUID // nil = root level
	title       string
	emoji       string
	icon        string
	sortOrder   string
}

// errDepthExceeded is returned by createDoc when the parent has already
// nested 10 levels deep. Other create errors are returned as-is.
var errDepthExceeded = fmt.Errorf("nesting depth exceeded")

// createDoc inserts a new WikiDocument with empty content. The orchestrator
// fills in Content + ContentState in a follow-up Update once the markdown
// has been rewritten and converted to Y.js binary.
func (o *Orchestrator) createDoc(
	ctx context.Context,
	in docCreateInput,
) (*models.WikiDocument, error) {
	if in.parent != nil {
		depth, err := o.docRepo.NestingDepth(ctx, *in.parent)
		if err != nil {
			return nil, fmt.Errorf("check nesting depth: %w", err)
		}
		if depth >= maxNestingDepth {
			return nil, errDepthExceeded
		}
	}

	// Default to the open-folder emoji when neither emoji nor icon was
	// supplied — matches the Create Document dialog's DEFAULT_EMOJI on
	// the frontend so imported docs visually line up with hand-created
	// ones instead of falling through to the generic 📄 placeholder the
	// tree node renders for empty-emoji docs.
	emoji := in.emoji
	if emoji == "" && in.icon == "" {
		emoji = defaultDocumentEmoji
	}

	now := time.Now().UTC()
	doc := &models.WikiDocument{
		DocumentID:       uuid.New(),
		OperationID:      in.operationID,
		ParentDocumentID: in.parent,
		Title:            in.title,
		TitleLower:       strings.ToLower(in.title),
		Emoji:            emoji,
		Icon:             in.icon,
		SortOrder:        in.sortOrder,
		CreatedByID:      in.callerID,
		LastUpdatedByID:  &in.callerID,
		LastUpdatedAt:    &now,
	}
	if err := o.docRepo.Create(ctx, doc); err != nil {
		return nil, err
	}
	return doc, nil
}

// fractionalIndex builds a stable, lexicographically-ordered string for
// sibling sort. v1 uses fixed-width zero-padded base36 — sufficient for
// up to 1296 siblings, which is well above any realistic Outline export.
func fractionalIndex(i int) string {
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
	if i < 0 {
		i = 0
	}
	a := i / 36
	b := i % 36
	if a >= len(alphabet) {
		a = len(alphabet) - 1
	}
	return string(alphabet[a]) + string(alphabet[b])
}

// decodeURLPath best-effort URL-decodes a markdown link target so the
// orchestrator can match it against the zip's exact path. Returns the
// input unchanged if decoding fails — the caller falls back to the
// original encoded form anyway.
func decodeURLPath(p string) string {
	// Strip any trailing title attribute (`uploads/x.png "title"`) before
	// decoding — markdown link targets carry the title in the same group.
	if i := strings.IndexByte(p, ' '); i >= 0 {
		p = p[:i]
	}
	out, err := url.PathUnescape(p)
	if err != nil {
		return p
	}
	return out
}

// guessContentType is a small, dependency-free fallback for non-image
// attachments where we don't have an authoritative Content-Type. The
// IngestFile helper sniffs the bytes, so this is mostly used as the
// "declared" hint and image-vs-file routing.
func guessContentType(filename string) string {
	ext := strings.ToLower(path.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".avif":
		return "image/avif"
	case ".svg":
		return "image/svg+xml"
	case ".pdf":
		return "application/pdf"
	case ".txt":
		return "text/plain"
	case ".md":
		return "text/markdown"
	case ".csv":
		return "text/csv"
	case ".json":
		return "application/json"
	case ".zip":
		return "application/zip"
	default:
		return "application/octet-stream"
	}
}

func isImageMime(ct string) bool {
	return strings.HasPrefix(ct, "image/")
}

// sanitizeImportFilename normalises a filename pulled from a zip entry
// name into something safe to persist and echo in download headers. The
// rules mirror controller.sanitizeUploadFilename's intent (strip path
// segments, control chars, dangerous Windows trailing characters) but
// are inlined here to keep the import package free of controller imports.
func sanitizeImportFilename(raw string) string {
	base := path.Base(strings.ReplaceAll(raw, `\`, "/"))
	if base == "." || base == "/" || base == "" {
		return ""
	}
	var sb strings.Builder
	sb.Grow(len(base))
	for _, r := range base {
		if r < 0x20 || r == 0x7f {
			continue
		}
		sb.WriteRune(r)
	}
	cleaned := strings.Join(strings.Fields(sb.String()), " ")
	cleaned = strings.TrimLeft(cleaned, " ")
	cleaned = strings.TrimRight(cleaned, ". ")
	const maxLen = 255
	if len(cleaned) > maxLen {
		cleaned = cleaned[:maxLen]
	}
	return cleaned
}

const (
	importParentTitle = "import"
	// importParentEmoji visually distinguishes the singleton import holding
	// pen from the per-import timestamp/collection folders that share the
	// generic folder emoji below.
	importParentEmoji = "⬇️"
	// defaultDocumentEmoji mirrors DEFAULT_EMOJI in
	// frontend/src/components/wiki/create-wiki-document-dialog.tsx so docs
	// minted by the importer match docs created via the dialog.
	defaultDocumentEmoji = "📂"
	maxTitleLength       = 200
	maxContentSize       = 1 << 20 // 1 MiB
	maxNestingDepth      = 10
)
