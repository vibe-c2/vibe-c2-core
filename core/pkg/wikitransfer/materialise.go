package wikitransfer

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
	"go.uber.org/zap"
)

const (
	maxTitleLength  = 200
	maxNestingDepth = 10
)

// Ingestor stores attachment bytes under a caller-chosen id. Satisfied by
// the wiki image and file controllers; the id is chosen up front so the
// page body can be rebased before the blob exists.
type Ingestor interface {
	IngestImageWithID(ctx context.Context, doc *models.WikiDocument, uploaderID uuid.UUID, body io.Reader, imageID uuid.UUID) (*models.WikiImage, *wiki.IngestError)
	IngestFileWithID(ctx context.Context, doc *models.WikiDocument, uploaderID uuid.UUID, body io.Reader, filename, declaredContentType string, fileID uuid.UUID) (*models.WikiFile, *wiki.IngestError)
	// DiscardImage / DiscardFile remove an attachment whose page failed to
	// be created, so it is not left for the sweeper to find.
	DiscardImage(ctx context.Context, imageID uuid.UUID) error
	DiscardFile(ctx context.Context, fileID uuid.UUID) error
}

// Rebaser is the one sidecar call the materialiser makes. Satisfied by
// *wiki.HocuspocusClient.
type Rebaser interface {
	RebaseDocument(ctx context.Context, req wiki.RebaseRequest) (wiki.RebaseResult, error)
}

// Target says where a plan lands.
type Target struct {
	OperationID uuid.UUID
	CallerID    uuid.UUID
	// ParentID is the document to place the plan's top-level pages under;
	// nil means the operation root.
	ParentID *uuid.UUID
}

// Progress is called after each page is handled (created or skipped).
type Progress func(done, total int)

// Materialiser turns a Plan into documents. Holds long-lived dependencies;
// per-run state lives in a run.
type Materialiser struct {
	docRepo  repository.IWikiDocumentRepository
	credRepo repository.ICredentialRepository
	hostRepo repository.IHostRepository
	hashRepo repository.IHashRepository
	ingestor Ingestor
	rebaser  Rebaser
	bus      eventbus.IEventBus
	logger   *zap.Logger
}

// NewMaterialiser wires the materialiser. credRepo, hostRepo, hashRepo and
// bus may be nil: without them credentials are dropped, cross-operation
// host and hash chips are dropped, and no events are published.
func NewMaterialiser(
	docRepo repository.IWikiDocumentRepository,
	credRepo repository.ICredentialRepository,
	hostRepo repository.IHostRepository,
	hashRepo repository.IHashRepository,
	ingestor Ingestor,
	rebaser Rebaser,
	bus eventbus.IEventBus,
	logger *zap.Logger,
) *Materialiser {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Materialiser{
		docRepo: docRepo, credRepo: credRepo, hostRepo: hostRepo, hashRepo: hashRepo,
		ingestor: ingestor, rebaser: rebaser, bus: bus, logger: logger,
	}
}

type run struct {
	m        *Materialiser
	plan     *Plan
	target   Target
	report   *ImportReport
	progress Progress
	now      time.Time

	// idMap is the union of every source → target mapping the sidecar
	// needs: pages, attachments, credentials, and hosts/hashes that exist
	// on the target under their source id.
	idMap map[string]string
	drop  []string
	kinds []wiki.ChipKind

	// pageID is the pre-allocated target id per source page.
	pageID map[uuid.UUID]uuid.UUID
	// attID is the pre-allocated target id per source attachment.
	attID map[uuid.UUID]uuid.UUID

	total int
	done  int
}

// Run materialises the plan under the target. Errors returned are
// request-level (bad target, unreachable dependency before the first page);
// per-page failures land in the report.
func (m *Materialiser) Run(ctx context.Context, plan *Plan, target Target, progress Progress) (*ImportReport, error) {
	if plan == nil {
		return nil, errors.New("nil plan")
	}
	if m.rebaser == nil || m.ingestor == nil || m.docRepo == nil {
		return nil, errors.New("materialiser is missing a dependency")
	}
	r := &run{
		m: m, plan: plan, target: target, progress: progress,
		now:    time.Now().UTC(),
		report: &ImportReport{BundleID: plan.BundleID, TargetParentID: target.ParentID},
		idMap:  map[string]string{},
		pageID: map[uuid.UUID]uuid.UUID{},
		attID:  map[uuid.UUID]uuid.UUID{},
		total:  plan.CountPages(),
	}
	r.report.TotalDocs = r.total

	parentPath, parentDepth, siblingPrefix, err := r.resolveParent(ctx)
	if err != nil {
		return nil, err
	}

	r.allocateIDs()
	r.reconcileCredentials(ctx)
	r.resolveCrossOperationChips(ctx)

	for i, page := range plan.Pages {
		sort := siblingPrefix + page.SortOrder
		if page.SortOrder == "" {
			sort = siblingPrefix + fractionalIndex(i)
		}
		created := r.materialise(ctx, page, target.ParentID, parentPath, parentDepth, page.Title, sort)
		if created != nil {
			r.report.RootIDs = append(r.report.RootIDs, created.DocumentID)
			r.publishCreated(created)
		}
	}
	return r.report, nil
}

// resolveParent validates the target parent and returns its path, depth and
// a sort-order prefix that places the imported roots after every existing
// child.
func (r *run) resolveParent(ctx context.Context) (path []uuid.UUID, depth int, siblingPrefix string, err error) {
	t := r.target
	if t.ParentID != nil {
		parent, ferr := r.m.docRepo.FindByID(ctx, *t.ParentID)
		if ferr != nil {
			return nil, 0, "", fmt.Errorf("target parent not found: %w", ferr)
		}
		if parent.OperationID != t.OperationID {
			return nil, 0, "", errors.New("target parent belongs to another operation")
		}
		if parent.DeletedAt != nil {
			return nil, 0, "", errors.New("target parent is in trash")
		}
		path = repository.ComposePathIDs(parent.PathIDs, parent.DocumentID)
		depth = len(path)
	} else {
		path = []uuid.UUID{}
	}

	siblings, _, serr := r.m.docRepo.FindChildDocumentsWithCounts(ctx, t.OperationID, t.ParentID)
	if serr != nil {
		return nil, 0, "", fmt.Errorf("list target siblings: %w", serr)
	}
	// Sort orders are compared as strings. Prefixing with the largest
	// existing value and one more character guarantees every imported root
	// sorts after the existing children while keeping its own order.
	maxSort := ""
	for _, s := range siblings {
		if s.SortOrder > maxSort {
			maxSort = s.SortOrder
		}
	}
	return path, depth, maxSort + "z", nil
}

func (r *run) allocateIDs() {
	r.plan.Walk(func(p *Page, _ int) {
		id := uuid.New()
		r.pageID[p.SourceID] = id
		if p.SourceID != uuid.Nil {
			r.idMap[p.SourceID.String()] = id.String()
		}
	})
	for src := range r.plan.Attachments {
		id := uuid.New()
		r.attID[src] = id
		r.idMap[src.String()] = id.String()
	}
}

// reconcileCredentials maps every carried credential onto the target
// operation. The Public operation forbids credential chips outright; every
// credential chip there is lowered to text and nothing is created.
func (r *run) reconcileCredentials(ctx context.Context) {
	if models.IsPublicOperation(r.target.OperationID) {
		r.kinds = append(r.kinds, wiki.ChipCredential)
		r.report.CredentialsSkipped += len(r.plan.Credentials)
		return
	}
	for _, id := range r.plan.CredentialTombstones {
		r.drop = append(r.drop, id.String())
		r.report.CredentialsTombstoned++
	}
	if len(r.plan.Credentials) == 0 {
		return
	}
	rec := NewCredentialReconciler(r.m.credRepo, r.target.OperationID)
	out := rec.Reconcile(ctx, r.plan.Credentials, r.target.CallerID)
	for src, dst := range out.IDMap {
		r.idMap[src.String()] = dst.String()
	}
	for _, id := range out.Skipped {
		r.drop = append(r.drop, id.String())
	}
	r.report.CredentialsReused += out.Reused
	r.report.CredentialsCreated += out.Created
	r.report.CredentialsSkipped += len(out.Skipped)
}

// resolveCrossOperationChips decides what happens to page, host and hash
// ids the plan did not remap. Inside the source operation they are still
// valid and kept. Anywhere else a page id not in the plan points nowhere;
// a host or hash id is kept only if that entity exists in the target
// operation, otherwise the chip is lowered to text.
func (r *run) resolveCrossOperationChips(ctx context.Context) {
	if r.plan.SourceOperationID != uuid.Nil && r.plan.SourceOperationID == r.target.OperationID {
		return
	}
	r.kinds = append(r.kinds, wiki.ChipDoc, wiki.ChipHost, wiki.ChipHash)

	hosts := map[uuid.UUID]struct{}{}
	hashes := map[uuid.UUID]struct{}{}
	r.plan.Walk(func(p *Page, _ int) {
		for _, id := range p.HostRefs {
			hosts[id] = struct{}{}
		}
		for _, id := range p.HashRefs {
			hashes[id] = struct{}{}
		}
	})
	for id := range hosts {
		if r.m.hostRepo == nil {
			break
		}
		if h, err := r.m.hostRepo.FindByID(ctx, id); err == nil && h.OperationID == r.target.OperationID {
			r.idMap[id.String()] = id.String()
		}
	}
	for id := range hashes {
		if r.m.hashRepo == nil {
			break
		}
		if h, err := r.m.hashRepo.FindByID(ctx, id); err == nil && h.OperationID == r.target.OperationID {
			r.idMap[id.String()] = id.String()
		}
	}
}

// materialise creates one page and recurses into its children. Returns the
// created document, or nil when the page (and therefore its subtree) was
// skipped.
func (r *run) materialise(
	ctx context.Context,
	page *Page,
	parentID *uuid.UUID,
	parentPath []uuid.UUID,
	parentDepth int,
	humanPath string,
	sortOrder string,
) *models.WikiDocument {
	if parentDepth >= maxNestingDepth {
		r.skipSubtree(page, humanPath, "depth_exceeded")
		return nil
	}
	if err := ctx.Err(); err != nil {
		r.skipSubtree(page, humanPath, "cancelled")
		return nil
	}

	doc := r.newDocument(page, parentID, parentPath, sortOrder, humanPath)
	ingested := r.ingestAttachments(ctx, page, doc, humanPath)

	if page.HasBody() {
		res, err := r.m.rebaser.RebaseDocument(ctx, wiki.RebaseRequest{
			ContentState:      page.ContentState,
			Markdown:          page.Markdown,
			IDMap:             r.idMap,
			Drop:              r.drop,
			DropUnmappedKinds: r.kinds,
		})
		if err != nil {
			r.discard(ctx, ingested)
			r.skipSubtree(page, humanPath, "rebase_failed: "+err.Error())
			return nil
		}
		applyProjection(doc, res, r.target.OperationID)
		r.report.ChipsRemapped += res.Remapped
		r.report.ChipsDropped += res.Dropped
		for _, id := range res.Unmapped {
			r.report.warn(humanPath, "unresolved_reference: "+id)
		}
	}

	if err := r.m.docRepo.Create(ctx, doc); err != nil {
		r.discard(ctx, ingested)
		r.skipSubtree(page, humanPath, "create_failed: "+err.Error())
		return nil
	}
	r.report.CreatedDocs++
	r.advance()

	childPath := repository.ComposePathIDs(parentPath, doc.DocumentID)
	for i, child := range page.Children {
		sort := child.SortOrder
		if sort == "" {
			sort = fractionalIndex(i)
		}
		r.materialise(ctx, child, &doc.DocumentID, childPath, parentDepth+1, humanPath+"/"+child.Title, sort)
	}
	return doc
}

func (r *run) newDocument(page *Page, parentID *uuid.UUID, parentPath []uuid.UUID, sortOrder, humanPath string) *models.WikiDocument {
	title := strings.TrimSpace(page.Title)
	if title == "" {
		title = "Untitled"
	}
	if len(title) > maxTitleLength {
		title = title[:maxTitleLength-1] + "…"
		r.report.warn(humanPath, "title_truncated")
	}
	emoji, icon := page.Emoji, page.Icon
	if emoji == "" && icon == "" {
		icon = DefaultDocumentIcon
	}
	var sourceTemplate *uuid.UUID
	if page.SourceTemplateID != nil {
		if mapped, ok := r.pageID[*page.SourceTemplateID]; ok {
			id := mapped
			sourceTemplate = &id
		}
	}
	caller := r.target.CallerID
	now := r.now
	return &models.WikiDocument{
		DocumentID:       r.pageID[page.SourceID],
		OperationID:      r.target.OperationID,
		ParentDocumentID: parentID,
		PathIDs:          append([]uuid.UUID(nil), parentPath...),
		Title:            title,
		TitleLower:       strings.ToLower(title),
		Emoji:            emoji,
		Icon:             icon,
		Color:            page.Color,
		SortOrder:        sortOrder,
		IsTemplate:       page.IsTemplate,
		SourceTemplateID: sourceTemplate,
		CreatedByID:      caller,
		LastUpdatedByID:  &caller,
		LastUpdatedAt:    &now,
		ImportOrigin: &models.WikiImportOrigin{
			BundleID:         r.plan.BundleID,
			SourceDocumentID: page.SourceID,
			ImportedAt:       now,
		},
	}
}

type ingestedAttachment struct {
	kind AttachmentKind
	id   uuid.UUID
}

func (r *run) ingestAttachments(ctx context.Context, page *Page, doc *models.WikiDocument, humanPath string) []ingestedAttachment {
	var out []ingestedAttachment
	for _, src := range page.Attachments {
		att, ok := r.plan.Attachments[src]
		if !ok {
			r.report.warn(humanPath, "attachment_missing: "+src.String())
			continue
		}
		targetID := r.attID[src]
		body, err := att.Open()
		if err != nil {
			r.report.warn(humanPath, "attachment_open_failed: "+att.Filename)
			continue
		}
		switch att.Kind {
		case AttachmentImage:
			_, ierr := r.m.ingestor.IngestImageWithID(ctx, doc, r.target.CallerID, body, targetID)
			_ = body.Close()
			if ierr != nil {
				r.report.warn(humanPath, "image_ingest_failed: "+ierr.Message)
				continue
			}
			r.report.ImagesIngested++
		default:
			_, ierr := r.m.ingestor.IngestFileWithID(ctx, doc, r.target.CallerID, body, att.Filename, att.ContentType, targetID)
			_ = body.Close()
			if ierr != nil {
				r.report.warn(humanPath, "file_ingest_failed: "+ierr.Message)
				continue
			}
			r.report.FilesIngested++
		}
		out = append(out, ingestedAttachment{kind: att.Kind, id: targetID})
	}
	return out
}

func (r *run) discard(ctx context.Context, ingested []ingestedAttachment) {
	for _, a := range ingested {
		var err error
		if a.kind == AttachmentImage {
			err = r.m.ingestor.DiscardImage(ctx, a.id)
		} else {
			err = r.m.ingestor.DiscardFile(ctx, a.id)
		}
		if err != nil {
			r.m.logger.Warn("wiki transfer: discard attachment failed", zap.String("id", a.id.String()), zap.Error(err))
		}
	}
}

func (r *run) skipSubtree(page *Page, humanPath, reason string) {
	r.report.skip(humanPath, reason)
	r.advance()
	for _, child := range page.Children {
		r.skipSubtree(child, humanPath+"/"+child.Title, "parent_skipped")
	}
}

func (r *run) advance() {
	r.done++
	if r.progress != nil {
		r.progress(r.done, r.total)
	}
}

func (r *run) publishCreated(doc *models.WikiDocument) {
	if r.m.bus == nil {
		return
	}
	payload := eventbus.WikiDocumentEventPayload{
		DocumentID:  doc.DocumentID.String(),
		OperationID: doc.OperationID.String(),
		Title:       doc.Title,
	}
	if doc.ParentDocumentID != nil {
		payload.ParentDocumentID = doc.ParentDocumentID.String()
	}
	r.m.bus.Publish(eventbus.NewWikiDocumentCreatedEvent(eventbus.UserActor(r.target.CallerID.String()), payload))
}

// applyProjection copies the sidecar's projection onto the document, with
// the same Public-operation boundary persistence.ts enforces: credential,
// hash and host references never seed the inverse index on a world-readable
// page.
func applyProjection(doc *models.WikiDocument, res wiki.RebaseResult, operationID uuid.UUID) {
	now := time.Now().UTC()
	doc.Content = res.Content
	doc.ContentState = res.ContentState
	doc.ContentStateAt = &now
	doc.ContentStateSchemaVersion = res.SchemaVersion
	doc.References = parseIDs(res.References)
	doc.ImageReferences = parseIDs(res.ImageReferences)
	doc.FileReferences = parseIDs(res.FileReferences)
	doc.ChecklistTotal = res.Checklist.Total
	doc.ChecklistRequired = res.Checklist.Required
	doc.ChecklistAnswered = res.Checklist.Answered
	if models.IsPublicOperation(operationID) {
		return
	}
	doc.CredentialReferences = parseIDs(res.CredentialReferences)
	doc.HashReferences = parseIDs(res.HashReferences)
	doc.HostReferences = parseIDs(res.HostReferences)
}

func parseIDs(in []string) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(in))
	for _, s := range in {
		if id, err := uuid.Parse(s); err == nil {
			out = append(out, id)
		}
	}
	return out
}

// fractionalIndex builds a stable, lexicographically ordered sort key for
// the i-th sibling when the source carried none: fixed-width base36, good
// for 1296 siblings.
func fractionalIndex(i int) string {
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
	if i < 0 {
		i = 0
	}
	a := i / 36
	if a >= len(alphabet) {
		a = len(alphabet) - 1
	}
	return string(alphabet[a]) + string(alphabet[i%36])
}
