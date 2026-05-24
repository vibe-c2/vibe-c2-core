package wikiimport

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"path"
	"sort"
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
	docRepo     repository.IWikiDocumentRepository
	eventRepo   repository.IOperationEventRepository
	imageIn     ImageIngestor
	fileIn      FileIngestor
	converter   MarkdownConverter
	eventBus    eventbus.IEventBus
	logger      *zap.Logger

	// importParentMu serialises the lookup-or-create of the singleton
	// "import" parent per operation. Without this, two concurrent imports
	// for the same operation could each create their own "import" root.
	// Keyed by operation ID. Process-local for v1; a Mongo unique index
	// is the durable follow-up.
	importParentMu sync.Mutex
}

// NewOrchestrator constructs an orchestrator wired up to the live
// repository and ingest helpers. eventBus may be nil in tests — when nil,
// the orchestrator skips post-import event publication. eventRepo may
// likewise be nil in tests; when set, the orchestrator writes per-doc
// rows directly into operation_events so the timeline reflects every
// imported document (firing N WikiDocumentCreated bus events would
// thrash the wiki sidebar cache subscription — see Run's design comment).
func NewOrchestrator(
	docRepo repository.IWikiDocumentRepository,
	eventRepo repository.IOperationEventRepository,
	imageIn ImageIngestor,
	fileIn FileIngestor,
	converter MarkdownConverter,
	eventBus eventbus.IEventBus,
	logger *zap.Logger,
) *Orchestrator {
	return &Orchestrator{
		docRepo:   docRepo,
		eventRepo: eventRepo,
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

	// Diagnostic baseline: how many attachment blobs the parser indexed and
	// a sorted sample of their keys. When refs fail to match, comparing the
	// ref against this list is the fastest way to spot a path-prefix drift.
	o.logger.Info("wiki import: orchestrator run starting",
		zap.String("operation_id", operationID.String()),
		zap.String("caller_id", callerID.String()),
		zap.Int("collection_count", len(export.Collections)),
		zap.Int("attachment_blob_count", len(export.AttachmentBlobs)),
		zap.Strings("attachment_blob_keys_sample", sampleAttachmentKeys(export.AttachmentBlobs, 20)),
	)
	for _, coll := range export.Collections {
		o.logger.Info("wiki import: collection summary",
			zap.String("collection", coll.Name),
			zap.Int("root_doc_count", len(coll.Documents)),
			zap.Int("total_doc_count", countDocsRecursive(coll.Documents)),
			zap.Int("total_attachment_refs", countRefsRecursive(coll.Documents)),
		)
	}

	report := &Report{}

	// timelineRows accumulates operation_event rows for every document
	// created during this import (wrapper folders + collection parents +
	// nested docs). We write them in one InsertMany at the end rather than
	// firing N bus events because each WikiDocumentCreated event
	// invalidates several frontend caches; flooding the sidebar
	// subscription with hundreds of invalidations during a large import
	// would be visible jank for no real gain.
	var timelineRows []*models.OperationEvent

	// Holding-pen folders: import/<ISO timestamp>/<collection>/...
	// Both the import parent (when freshly created) and the timestamp parent
	// fire WikiDocumentCreated bus events below; events.Logger writes their
	// timeline rows, so we deliberately skip appending them to timelineRows.
	importParent, importParentCreated, err := o.findOrCreateImportParent(ctx, operationID, callerID)
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
		// Collection-parent docs are real, user-meaningful wiki nodes
		// (named after the source collection). They never fire bus events,
		// so log them straight to the timeline.
		timelineRows = append(timelineRows, newImportTimelineRow(collectionParent, &timestampParent.DocumentID))

		o.processDocs(ctx, processCtx{
			export:       export,
			operationID:  operationID,
			callerID:     callerID,
			report:       report,
			timelineRows: &timelineRows,
		}, coll.Documents, collectionParent.DocumentID, coll.Name+"/")
	}

	// Notify subscribers. Two events:
	//
	//   1. If the singleton "import" parent was freshly created during this
	//      run, fire a CREATED for it with no ParentDocumentID so the
	//      frontend's root-children cache invalidates and the new top-level
	//      "import" folder appears in the sidebar tree. Skipped on repeat
	//      imports — the folder is already there.
	//
	//   2. Always fire a CREATED for this run's <timestamp> parent (under
	//      "import") so the children-of-import cache invalidates and the
	//      new dated folder appears whenever "import" is expanded.
	//
	// The frontend's wikiDocumentChanged handler is idempotent, so the two
	// events compose safely; together they cover both the first-import and
	// repeat-import cases without forcing a global refetch.
	if o.eventBus != nil {
		if importParentCreated {
			o.eventBus.Publish(eventbus.NewWikiDocumentCreatedEvent(
				eventbus.UserActor(callerID.String()),
				eventbus.WikiDocumentEventPayload{
					DocumentID:  importParent.DocumentID.String(),
					OperationID: operationID.String(),
					Title:       importParent.Title,
				},
			))
		}
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

	// Flush per-doc timeline rows. Failure here is logged but never
	// propagated — the documents are already on disk and the user got a
	// successful import; a missing audit trail row is the right thing to
	// degrade away from. Skipped entirely when no event repo is wired
	// (tests with the simple constructor or when no docs were created).
	if o.eventRepo != nil && len(timelineRows) > 0 {
		if err := o.eventRepo.InsertMany(ctx, timelineRows); err != nil {
			o.logger.Warn("wiki import: timeline row insert failed",
				zap.Int("row_count", len(timelineRows)),
				zap.Error(err))
		} else if o.eventBus != nil {
			// Wake up live timeline subscribers with a single
			// TopicOperationEventLogged. The frontend handler invalidates
			// the entire timeline namespace, so one event is enough to
			// pull all the just-inserted rows on the next refetch — N
			// events would just trigger N redundant invalidations.
			last := timelineRows[len(timelineRows)-1]
			o.eventBus.Publish(eventbus.NewOperationEventLoggedEvent(
				eventbus.UserActor(callerID.String()),
				eventbus.OperationEventLoggedPayload{
					EventID:     last.EventID.String(),
					OperationID: last.OperationID.String(),
				},
			))
		}
	}

	return report, nil
}

// processCtx bundles the per-import context that recursive document
// processing needs. Avoids passing seven scalars through every recursion.
//
// timelineRows accumulates operation_event rows for the documents created
// during this import. Bus-side WikiDocumentCreated events are fired only
// for the two wrapper folders to keep the wiki sidebar cache subscription
// happy (see Run), so per-doc timeline coverage has to be filled in here.
// The slice is bulk-flushed at the end of Run.
type processCtx struct {
	export       *ParsedExport
	operationID  uuid.UUID
	callerID     uuid.UUID
	report       *Report
	timelineRows *[]*models.OperationEvent
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

		// Per-doc trace: refs the parser captured + a count of literal
		// "uploads/" substrings in the raw body. A mismatch points at a
		// regex miss (e.g. ref contains an unescaped paren or space).
		bodyUploadOccurrences := strings.Count(parsed.BodyMarkdown, "uploads/")
		o.logger.Info("wiki import: processing doc",
			zap.String("path", humanPath),
			zap.String("title", parsed.Title),
			zap.Int("body_bytes", len(parsed.BodyMarkdown)),
			zap.Int("attachment_ref_count", len(parsed.AttachmentRefs)),
			zap.Strings("attachment_refs", parsed.AttachmentRefs),
			zap.Int("body_uploads_substring_count", bodyUploadOccurrences),
		)
		if bodyUploadOccurrences > len(parsed.AttachmentRefs) {
			// More "uploads/" mentions in the body than refs the regex
			// captured. Surface a sample of the raw body so we can inspect
			// the exact markdown the parser failed to recognise.
			o.logger.Warn("wiki import: body has more uploads/ mentions than parser captured refs — likely regex miss",
				zap.String("path", humanPath),
				zap.Int("uploads_substring_count", bodyUploadOccurrences),
				zap.Int("captured_ref_count", len(parsed.AttachmentRefs)),
				zap.Strings("uploads_context_snippets", uploadsContextSnippets(parsed.BodyMarkdown, 5, 120)),
			)
		}

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
			icon:        parsed.Icon,
			color:       parsed.Color,
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

		// Stamp a timeline row for this doc. We avoid the eventbus
		// publish-per-doc path on purpose; see the comment on
		// processCtx.timelineRows.
		if pctx.timelineRows != nil {
			parentID := &parentID
			*pctx.timelineRows = append(*pctx.timelineRows, newImportTimelineRow(created, parentID))
		}

		// Recurse into children with the new doc as their parent.
		if len(parsed.Children) > 0 {
			o.processDocs(ctx, pctx, parsed.Children, created.DocumentID, humanPath+"/")
		}
	}
}

// newImportTimelineRow builds an operation_event row mirroring what
// pkg/events.Logger would have written if a WikiDocumentCreated bus event
// had been published for this doc. parentID may be nil for root-level
// docs (though the importer never produces those — every imported doc
// lives under at least the collection parent).
func newImportTimelineRow(doc *models.WikiDocument, parentID *uuid.UUID) *models.OperationEvent {
	var meta map[string]any
	if parentID != nil {
		meta = map[string]any{"parent_document_id": parentID.String()}
	}
	actor := doc.CreatedByID
	return &models.OperationEvent{
		EventID:     uuid.New(),
		OperationID: doc.OperationID,
		Topic:       string(eventbus.TopicWikiDocumentCreated),
		SubjectKind: models.SubjectKindWikiDocument,
		SubjectID:   doc.DocumentID,
		SubjectName: doc.Title,
		ActorType:   models.EventActorUser,
		ActorID:     &actor,
		Metadata:    meta,
		OccurredAt:  time.Now().UTC(),
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
		// `ref` is the URL-encoded `uploads/<userId>/<attId>/<filename>`
		// suffix as it appears in the markdown. The AttachmentBlobs map
		// is keyed by the same suffix regardless of where the `uploads/`
		// directory actually sits in the zip (collection root, or deep
		// inside a workspace export). Decode URL-escapes before lookup.
		decoded := decodeURLPath(ref)
		blob, ok := pctx.export.AttachmentBlobs[decoded]
		lookupKey := decoded
		if !ok {
			// Older Outline exports may not URL-encode every character;
			// retry with the as-written form.
			blob, ok = pctx.export.AttachmentBlobs[ref]
			if ok {
				lookupKey = ref
			}
		}
		if !ok {
			// Surface the candidate keys whose basename matches — that's
			// what tells us whether the file is in the zip under a
			// different prefix vs. genuinely missing.
			refBase := path.Base(decoded)
			o.logger.Warn("wiki import: attachment blob not found in zip",
				zap.String("ref", ref),
				zap.String("ref_decoded", decoded),
				zap.String("ref_basename", refBase),
				zap.String("document_id", owner.DocumentID.String()),
				zap.String("document_path", parsed.SortKey),
				zap.Strings("blob_keys_with_matching_basename", candidatesByBasename(refBase, pctx.export.AttachmentBlobs)),
				zap.Strings("blob_keys_sample", sampleAttachmentKeys(pctx.export.AttachmentBlobs, 20)),
			)
			continue
		}

		newURL, ingested, err := o.ingestOneAttachment(ctx, pctx, owner, blob)
		if err != nil {
			o.logger.Warn("wiki import: attachment ingest failed",
				zap.String("ref", ref),
				zap.String("lookup_key", lookupKey),
				zap.String("blob_name", blob.Name),
				zap.Uint64("blob_uncompressed_size", blob.UncompressedSize64),
				zap.String("document_id", owner.DocumentID.String()),
				zap.Error(err),
			)
			continue
		}

		// Replace every occurrence of the markdown reference (the form
		// inside the parentheses) with the new URL.
		body = strings.ReplaceAll(body, ref, newURL)

		// Did the substitution actually land? If body still contains the
		// ref verbatim, the ReplaceAll silently did nothing (unlikely, but
		// worth catching — a subtle whitespace mismatch between
		// AttachmentRefs and the body would cause this).
		substituted := !strings.Contains(body, ref)
		o.logger.Info("wiki import: attachment ingested",
			zap.String("ref", ref),
			zap.String("lookup_key", lookupKey),
			zap.String("blob_name", blob.Name),
			zap.Uint64("blob_uncompressed_size", blob.UncompressedSize64),
			zap.String("new_url", newURL),
			zap.Bool("body_substituted", substituted),
			zap.String("document_id", owner.DocumentID.String()),
		)
		if !substituted {
			o.logger.Warn("wiki import: ingest succeeded but body still contains original ref — substitution missed",
				zap.String("ref", ref),
				zap.String("new_url", newURL),
				zap.String("document_id", owner.DocumentID.String()),
			)
		}

		switch ingested {
		case ingestedImage:
			pctx.report.ImagesIngested++
		case ingestedFile:
			pctx.report.FilesIngested++
		}
	}

	// Orphan check: any `](uploads/...)` left in the body now points at a
	// non-existent path. Either the parser's regex missed it, or the blob
	// lookup / ingest above failed. Either way the rendered doc will show
	// a broken link, so flag it here for the operator to see.
	if leftovers := orphanUploadRefs(body); len(leftovers) > 0 {
		o.logger.Warn("wiki import: doc body still references uploads/ paths after rewrite — these will render as broken links",
			zap.String("document_id", owner.DocumentID.String()),
			zap.String("document_path", parsed.SortKey),
			zap.Int("orphan_count", len(leftovers)),
			zap.Strings("orphan_refs", leftovers),
		)
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
// or-create is atomic. Returns the document, a flag indicating whether
// it was created in this call (so the caller can emit a one-time CREATED
// event for it), and any error.
//
// v1 operates without a Mongo unique index; the follow-up note in the
// implementation plan calls for adding `(operation_id, parent_document_id,
// title_lower)` for cross-process safety.
func (o *Orchestrator) findOrCreateImportParent(
	ctx context.Context,
	operationID, callerID uuid.UUID,
) (*models.WikiDocument, bool, error) {
	o.importParentMu.Lock()
	defer o.importParentMu.Unlock()

	all, err := o.docRepo.FindAllByOperationID(ctx, operationID)
	if err != nil {
		return nil, false, err
	}
	for i := range all {
		d := &all[i]
		if d.ParentDocumentID == nil &&
			d.DeletedAt == nil &&
			strings.EqualFold(d.Title, importParentTitle) {
			return d, false, nil
		}
	}

	doc, err := o.createDoc(ctx, docCreateInput{
		operationID: operationID,
		callerID:    callerID,
		title:       importParentTitle,
		emoji:       importParentEmoji,
		sortOrder:   "0", // sort early relative to imported timestamps
	})
	if err != nil {
		return nil, false, err
	}
	return doc, true, nil
}

type docCreateInput struct {
	operationID uuid.UUID
	callerID    uuid.UUID
	parent      *uuid.UUID // nil = root level
	title       string
	emoji       string
	icon        string
	color       string
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

	// Default to the adaptive lucide icon when nothing was supplied —
	// mirrors DEFAULT_ICON_VALUE in create-wiki-document-dialog.tsx so an
	// imported doc reads as a page-or-folder glyph rather than the legacy
	// 📂 emoji (which surprised users who'd never picked an emoji on the
	// source side). Emojis already attached to the doc on import flow
	// through unchanged, including the optional vibe-meta icon override.
	emoji := in.emoji
	icon := in.icon
	if emoji == "" && icon == "" {
		icon = defaultDocumentIcon
	}

	now := time.Now().UTC()
	doc := &models.WikiDocument{
		DocumentID:       uuid.New(),
		OperationID:      in.operationID,
		ParentDocumentID: in.parent,
		Title:            in.title,
		TitleLower:       strings.ToLower(in.title),
		Emoji:            emoji,
		Icon:             icon,
		Color:            in.color,
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
	// pen from the per-import timestamp/collection folders that pick up the
	// adaptive default icon. Kept as an emoji (not a lucide icon) so the
	// "import" root reads as a system folder rather than a regular doc.
	importParentEmoji = "⬇️"
	// defaultDocumentIcon mirrors DEFAULT_ICON_VALUE in
	// create-wiki-document-dialog.tsx: the reserved "Adaptive" lucide icon
	// that renders as FileText / Folder / FolderOpen depending on the
	// row's state. Used for every imported doc the user didn't pick a
	// glyph for (the H1 emoji and the vibe-meta override both still
	// win when present).
	defaultDocumentIcon = "Adaptive"
	maxTitleLength      = 200
	maxContentSize      = 1 << 20 // 1 MiB
	maxNestingDepth     = 10
)

// sampleAttachmentKeys returns up to limit attachment blob keys, sorted,
// for diagnostic logging. The full map can be large for workspace exports,
// so we cap output to keep log lines bounded.
func sampleAttachmentKeys(attachments map[string]*zip.File, limit int) []string {
	keys := make([]string, 0, len(attachments))
	for k := range attachments {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	if len(keys) > limit {
		keys = keys[:limit]
	}
	return keys
}

// candidatesByBasename returns the attachment blob keys whose final path
// segment equals refBase. Used when a ref lookup misses — if the file is in
// the zip but under a different prefix, this surfaces it immediately.
func candidatesByBasename(refBase string, attachments map[string]*zip.File) []string {
	if refBase == "" {
		return nil
	}
	var out []string
	for k := range attachments {
		if path.Base(k) == refBase {
			out = append(out, k)
		}
	}
	sort.Strings(out)
	return out
}

// countDocsRecursive returns the total number of documents in a tree,
// including all descendants. Used in the per-collection start log.
func countDocsRecursive(docs []*Doc) int {
	n := 0
	for _, d := range docs {
		n++
		n += countDocsRecursive(d.Children)
	}
	return n
}

// countRefsRecursive sums AttachmentRefs across every doc in a tree.
func countRefsRecursive(docs []*Doc) int {
	n := 0
	for _, d := range docs {
		n += len(d.AttachmentRefs)
		n += countRefsRecursive(d.Children)
	}
	return n
}

// orphanUploadRefs runs the parser's own scanner over the rewritten body
// and returns any `uploads/...` link targets still present. After a
// successful orchestrator pass these should be empty — every ref the
// parser saw was either substituted or logged as a miss. Anything that
// surfaces here is a broken link in the resulting wiki page.
func orphanUploadRefs(body string) []string {
	return scanAttachmentRefs(body)
}

// uploadsContextSnippets pulls short slices of the body around each
// "uploads/" substring. Used when the parser captured fewer refs than the
// body's substring count suggests — the snippets show the exact characters
// surrounding each occurrence so we can see why the regex missed.
func uploadsContextSnippets(body string, maxSnippets, window int) []string {
	if body == "" {
		return nil
	}
	out := make([]string, 0, maxSnippets)
	idx := 0
	for len(out) < maxSnippets {
		pos := strings.Index(body[idx:], "uploads/")
		if pos < 0 {
			break
		}
		abs := idx + pos
		start := abs - window/2
		if start < 0 {
			start = 0
		}
		end := abs + window/2
		if end > len(body) {
			end = len(body)
		}
		out = append(out, body[start:end])
		idx = abs + len("uploads/")
	}
	return out
}
