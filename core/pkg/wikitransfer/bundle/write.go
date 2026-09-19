package bundle

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/markdown"
	"go.uber.org/zap"
)

// Renderer produces the human-readable .md copy of each page. Optional: a
// nil renderer skips the copies.
type Renderer interface {
	YjsToMarkdown(ctx context.Context, contentState []byte) (string, error)
}

// Config caps one export.
type Config struct {
	MaxDocuments       int   // default 5000
	MaxAttachmentBytes int64 // default 1 GiB
	// InstallationID is stamped into the manifest source when set.
	InstallationID string
	// SchemaVersion is the editor schema the stored content_state follows.
	SchemaVersion int
}

func (c Config) withDefaults() Config {
	if c.MaxDocuments <= 0 {
		c.MaxDocuments = 5000
	}
	if c.MaxAttachmentBytes <= 0 {
		c.MaxAttachmentBytes = 1 << 30
	}
	if c.SchemaVersion <= 0 {
		c.SchemaVersion = 1
	}
	return c
}

// Writer produces bundles.
type Writer struct {
	imageRepo   repository.IWikiImageRepository
	fileRepo    repository.IWikiFileRepository
	imageStore  blob.ObjectStore
	fileStore   blob.ObjectStore
	hostRepo    repository.IHostRepository
	hashRepo    repository.IHashRepository
	credentials wikitransfer.CredentialLookup
	renderer    Renderer
	logger      *zap.Logger
	cfg         Config
}

// NewWriter wires the writer. hostRepo, hashRepo, credentials and renderer
// may be nil: hints, credential payloads and .md copies are then omitted.
func NewWriter(
	imageRepo repository.IWikiImageRepository,
	fileRepo repository.IWikiFileRepository,
	imageStore, fileStore blob.ObjectStore,
	hostRepo repository.IHostRepository,
	hashRepo repository.IHashRepository,
	credentials wikitransfer.CredentialLookup,
	renderer Renderer,
	logger *zap.Logger,
	cfg Config,
) *Writer {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Writer{
		imageRepo: imageRepo, fileRepo: fileRepo, imageStore: imageStore, fileStore: fileStore,
		hostRepo: hostRepo, hashRepo: hashRepo, credentials: credentials, renderer: renderer,
		logger: logger, cfg: cfg.withDefaults(),
	}
}

// Options vary one export run.
type Options struct {
	// IncludeCredentials embeds credential payloads. The caller decides
	// from the requester's role.
	IncludeCredentials bool
}

type writeRun struct {
	w                *Writer
	zw               *zip.Writer
	scope            *wikitransfer.Scope
	manifest         *Manifest
	report           *wikitransfer.ExportReport
	credentials      map[uuid.UUID]wikitransfer.CredentialPayload
	hosts            map[uuid.UUID]struct{}
	hashes           map[uuid.UUID]struct{}
	totalAttachments int64
	progress         wikitransfer.Progress
	done             int
}

// Run writes the scope into zw. The caller owns zw and closes it.
func (w *Writer) Run(ctx context.Context, zw *zip.Writer, scope *wikitransfer.Scope, opts Options, progress wikitransfer.Progress) (*wikitransfer.ExportReport, error) {
	if len(scope.Docs) > w.cfg.MaxDocuments {
		return nil, fmt.Errorf("export exceeds %d documents (got %d)", w.cfg.MaxDocuments, len(scope.Docs))
	}
	now := time.Now().UTC()
	id := uuid.New()
	r := &writeRun{
		w: w, zw: zw, scope: scope, progress: progress,
		manifest: &Manifest{
			Format: Format, FormatVersion: FormatVersion, BundleID: id, ExportedAt: now,
			Source: Source{
				InstallationID: w.cfg.InstallationID,
				OperationID:    scope.OperationID,
				OperationName:  scope.OperationName,
				Scope:          scope.Label(),
			},
			SchemaVersion:       w.cfg.SchemaVersion,
			CredentialsIncluded: opts.IncludeCredentials && w.credentials != nil && !models.IsPublicOperation(scope.OperationID),
			Documents:           []Document{},
			Attachments:         []Attachment{},
		},
		report: &wikitransfer.ExportReport{
			BundleID: id, Format: "bundle", Scope: scope.Label(), RootTitle: scope.Title(), TotalDocs: len(scope.Docs),
		},
		credentials: map[uuid.UUID]wikitransfer.CredentialPayload{},
		hosts:       map[uuid.UUID]struct{}{},
		hashes:      map[uuid.UUID]struct{}{},
	}
	if scope.Root != nil {
		rootID := scope.Root.DocumentID
		r.manifest.Source.RootDocumentID = &rootID
	}

	scope.Walk(func(doc models.WikiDocument, depth, _ int) bool {
		r.writeDocument(ctx, doc, depth)
		return true
	})
	r.collectHints(ctx)

	if r.manifest.CredentialsIncluded {
		payloads := make([]wikitransfer.CredentialPayload, 0, len(r.credentials))
		for _, p := range r.credentials {
			payloads = append(payloads, p)
		}
		if err := writeJSON(zw, credentialsPath, payloads); err != nil {
			return r.report, fmt.Errorf("write credentials: %w", err)
		}
	}
	if err := writeJSON(zw, manifestPath, r.manifest); err != nil {
		return r.report, fmt.Errorf("write manifest: %w", err)
	}
	if err := writeJSON(zw, reportPath, r.report); err != nil {
		return r.report, fmt.Errorf("write report: %w", err)
	}
	return r.report, nil
}

func (r *writeRun) advance() {
	r.done++
	if r.progress != nil {
		r.progress(r.done, r.report.TotalDocs)
	}
}

func (r *writeRun) writeDocument(ctx context.Context, doc models.WikiDocument, depth int) {
	path := doc.Title
	entry := Document{
		ID:               doc.DocumentID,
		Title:            doc.Title,
		Emoji:            doc.Emoji,
		Icon:             doc.Icon,
		Color:            doc.Color,
		SortOrder:        doc.SortOrder,
		Kind:             doc.Kind.Or(),
		IsTemplate:       doc.IsTemplate,
		SourceTemplateID: doc.SourceTemplateID,
		CreatedAt:        doc.CreateAt,
		UpdatedAt:        doc.LastUpdatedAt,
		References: References{
			Documents:   nonNil(doc.References),
			Hosts:       nonNil(doc.HostReferences),
			Hashes:      nonNil(doc.HashReferences),
			Credentials: nonNil(doc.CredentialReferences),
			Images:      nonNil(doc.ImageReferences),
			Files:       nonNil(doc.FileReferences),
		},
		Checklist: Checklist{Total: doc.ChecklistTotal, Required: doc.ChecklistRequired, Answered: doc.ChecklistAnswered},
	}
	// Top of the exported scope has no parent inside the bundle. For a
	// subtree export that is the root; for a tree export, root-level docs.
	if depth > 0 && doc.ParentDocumentID != nil {
		pid := *doc.ParentDocumentID
		entry.ParentID = &pid
	}

	if len(doc.ContentState) > 0 {
		entry.ContentStateFile = documentsDir + doc.DocumentID.String() + ".ystate"
		entry.ContentStateBytes = int64(len(doc.ContentState))
		if err := writeBytes(r.zw, entry.ContentStateFile, doc.ContentState); err != nil {
			r.report.Skip(path, "zip_write_failed: "+err.Error())
			r.advance()
			return
		}
		if r.w.renderer != nil {
			if md, err := r.w.renderer.YjsToMarkdown(ctx, doc.ContentState); err == nil {
				_ = writeBytes(r.zw, documentsDir+doc.DocumentID.String()+".md", []byte(md))
				// The stored indexes are what the sidecar wrote on the last
				// save; a page last saved before an index existed has an
				// empty one. The rendered body is the truth, so union it in.
				mergeBodyReferences(&entry.References, md)
			} else {
				r.report.Warn(path, "markdown_copy_failed: "+err.Error())
			}
		}
	}

	r.streamAttachments(ctx, doc, entry.References, path)
	r.collectCredentials(ctx, doc, entry.References.Credentials)
	for _, id := range entry.References.Hosts {
		r.hosts[id] = struct{}{}
	}
	for _, id := range entry.References.Hashes {
		r.hashes[id] = struct{}{}
	}

	r.manifest.Documents = append(r.manifest.Documents, entry)
	r.report.ExportedDocs++
	r.advance()
}

// streamAttachments copies every attachment the document's index names.
// The index is what the sidecar wrote on the last save, which is exactly
// what the body references.
func (r *writeRun) streamAttachments(ctx context.Context, doc models.WikiDocument, refs References, path string) {
	for _, id := range refs.Images {
		img, err := r.w.imageRepo.FindByID(ctx, id)
		if err != nil || img.DeletedAt != nil || img.OperationID != doc.OperationID {
			r.report.Warn(path, "image_unavailable: "+id.String())
			continue
		}
		filename := markdown.ImageFilenameFor(id.String(), img.ContentType)
		att := Attachment{ID: id, Kind: "image", OwnerDocumentID: doc.DocumentID, Filename: filename, ContentType: img.ContentType, SizeBytes: img.SizeBytes, File: attachmentsDir + id.String()}
		if r.streamBlob(ctx, r.w.imageStore, img.ObjectKey, &att, path) {
			r.manifest.Attachments = append(r.manifest.Attachments, att)
			r.report.ImagesExported++
		}
	}
	for _, id := range refs.Files {
		file, err := r.w.fileRepo.FindByID(ctx, id)
		if err != nil || file.DeletedAt != nil || file.OperationID != doc.OperationID {
			r.report.Warn(path, "file_unavailable: "+id.String())
			continue
		}
		att := Attachment{ID: id, Kind: "file", OwnerDocumentID: doc.DocumentID, Filename: file.Filename, ContentType: file.ContentType, SizeBytes: file.SizeBytes, File: attachmentsDir + id.String()}
		if r.streamBlob(ctx, r.w.fileStore, file.ObjectKey, &att, path) {
			r.manifest.Attachments = append(r.manifest.Attachments, att)
			r.report.FilesExported++
		}
	}
}

func (r *writeRun) streamBlob(ctx context.Context, store blob.ObjectStore, objectKey string, att *Attachment, path string) bool {
	if r.totalAttachments+att.SizeBytes > r.w.cfg.MaxAttachmentBytes {
		r.report.Warn(path, "attachment_budget_exhausted")
		return false
	}
	reader, _, err := store.Get(ctx, objectKey)
	if err != nil {
		r.report.Warn(path, "blob_get_failed: "+err.Error())
		return false
	}
	defer reader.Close()
	w, err := r.zw.Create(att.File)
	if err != nil {
		r.report.Warn(path, "zip_create_failed: "+err.Error())
		return false
	}
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(w, h), reader)
	if err != nil {
		r.report.Warn(path, "blob_copy_failed: "+err.Error())
		return false
	}
	att.SizeBytes = n
	att.SHA256 = hex.EncodeToString(h.Sum(nil))
	r.totalAttachments += n
	return true
}

// collectCredentials gathers payloads for the document's credential index.
// Cross-operation ids are never embedded; they are reported as tombstones
// and import as plain text.
func (r *writeRun) collectCredentials(ctx context.Context, doc models.WikiDocument, ids []uuid.UUID) {
	if !r.manifest.CredentialsIncluded {
		return
	}
	for _, id := range ids {
		if _, seen := r.credentials[id]; seen {
			continue
		}
		cred, err := r.w.credentials.FindByID(ctx, id)
		if err != nil || cred.CredentialID == uuid.Nil || cred.OperationID != doc.OperationID {
			r.credentials[id] = wikitransfer.CredentialPayload{ID: id.String(), Deleted: true}
			r.report.CredentialsTombstoned++
			continue
		}
		r.credentials[id] = wikitransfer.PayloadFromCredential(cred)
		r.report.CredentialsExported++
	}
}

func (r *writeRun) collectHints(ctx context.Context) {
	for id := range r.hosts {
		hint := HostHint{ID: id}
		if r.w.hostRepo != nil {
			if h, err := r.w.hostRepo.FindByID(ctx, id); err == nil {
				hint.Hostname = h.Hostname
			}
		}
		r.manifest.Hosts = append(r.manifest.Hosts, hint)
	}
	for id := range r.hashes {
		hint := HashHint{ID: id}
		if r.w.hashRepo != nil {
			if h, err := r.w.hashRepo.FindByID(ctx, id); err == nil {
				hint.Value = h.Value
			}
		}
		r.manifest.Hashes = append(r.manifest.Hashes, hint)
	}
}

// mergeBodyReferences unions the ids the rendered body references into the
// manifest entry.
func mergeBodyReferences(refs *References, md string) {
	images, files := markdown.CollectAttachmentRefs(md)
	docs, hosts, hashes := markdown.CollectReferenceLinks(md)
	refs.Images = union(refs.Images, images)
	refs.Files = union(refs.Files, files)
	refs.Documents = union(refs.Documents, docs)
	refs.Hosts = union(refs.Hosts, hosts)
	refs.Hashes = union(refs.Hashes, hashes)
	refs.Credentials = union(refs.Credentials, markdown.CollectCredentialIDs(md))
}

func union(a, b []uuid.UUID) []uuid.UUID {
	out := append([]uuid.UUID{}, a...)
	seen := map[uuid.UUID]struct{}{}
	for _, id := range a {
		seen[id] = struct{}{}
	}
	for _, id := range b {
		if _, dup := seen[id]; !dup {
			seen[id] = struct{}{}
			out = append(out, id)
		}
	}
	return out
}

func nonNil(in []uuid.UUID) []uuid.UUID {
	if in == nil {
		return []uuid.UUID{}
	}
	return in
}

func writeBytes(zw *zip.Writer, path string, body []byte) error {
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
