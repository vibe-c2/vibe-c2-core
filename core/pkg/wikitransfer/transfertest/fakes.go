// Package transfertest holds in-memory doubles for the wiki transfer
// pipeline's dependencies. Shared by the tests of wikitransfer and its
// subpackages, which cannot share _test files.
//
// The fakes model exactly what the pipeline needs — a document store, an
// attachment store, an ingestor, a sidecar — and nothing else. The fake
// sidecar treats a body as text and rewrites the UUIDs it finds, which is
// enough to prove ids flow through the pipeline without running Node.
package transfertest

import (
	"bytes"
	"context"
	"errors"
	"io"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
)

// ErrNotFound is what every fake returns for an unknown id.
var ErrNotFound = errors.New("not found")

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

// DocRepo is an in-memory IWikiDocumentRepository covering the methods the
// pipeline uses. Unused methods panic via the embedded nil interface, so a
// widening of the pipeline's surface is noticed.
type DocRepo struct {
	repository.IWikiDocumentRepository
	mu   sync.Mutex
	Docs []models.WikiDocument
	// FailCreateTitle makes Create fail for a page with this title.
	FailCreateTitle string
}

func NewDocRepo(docs ...models.WikiDocument) *DocRepo {
	return &DocRepo{Docs: append([]models.WikiDocument(nil), docs...)}
}

func (f *DocRepo) Create(_ context.Context, doc *models.WikiDocument) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.FailCreateTitle != "" && doc.Title == f.FailCreateTitle {
		return errors.New("simulated create failure")
	}
	if doc.PathIDs == nil {
		doc.PathIDs = []uuid.UUID{}
		if doc.ParentDocumentID != nil {
			for _, d := range f.Docs {
				if d.DocumentID == *doc.ParentDocumentID {
					doc.PathIDs = repository.ComposePathIDs(d.PathIDs, d.DocumentID)
				}
			}
		}
	}
	doc.CreateAt = time.Now().UTC()
	f.Docs = append(f.Docs, *doc)
	return nil
}

func (f *DocRepo) FindByID(_ context.Context, id uuid.UUID) (models.WikiDocument, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, d := range f.Docs {
		if d.DocumentID == id {
			return d, nil
		}
	}
	return models.WikiDocument{}, ErrNotFound
}

func (f *DocRepo) FindAllByOperationID(_ context.Context, opID uuid.UUID) ([]models.WikiDocument, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []models.WikiDocument
	for _, d := range f.Docs {
		if d.OperationID == opID {
			out = append(out, d)
		}
	}
	return out, nil
}

func (f *DocRepo) FindDescendants(_ context.Context, docID uuid.UUID) ([]models.WikiDocument, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []models.WikiDocument
	for _, d := range f.Docs {
		for _, p := range d.PathIDs {
			if p == docID {
				out = append(out, d)
				break
			}
		}
	}
	return out, nil
}

func (f *DocRepo) FindChildDocumentsWithCounts(_ context.Context, opID uuid.UUID, parentID *uuid.UUID) ([]models.WikiDocument, map[uuid.UUID]int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []models.WikiDocument
	for _, d := range f.Docs {
		if d.OperationID != opID || d.DeletedAt != nil {
			continue
		}
		if (parentID == nil && d.ParentDocumentID == nil) || (parentID != nil && d.ParentDocumentID != nil && *d.ParentDocumentID == *parentID) {
			out = append(out, d)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].SortOrder < out[j].SortOrder })
	return out, map[uuid.UUID]int{}, nil
}

func (f *DocRepo) NestingDepth(ctx context.Context, parentID uuid.UUID) (int, error) {
	d, err := f.FindByID(ctx, parentID)
	if err != nil {
		return 0, err
	}
	return len(d.PathIDs) + 1, nil
}

// ByTitle returns the first document with the title, for assertions.
func (f *DocRepo) ByTitle(title string) (models.WikiDocument, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, d := range f.Docs {
		if d.Title == title {
			return d, true
		}
	}
	return models.WikiDocument{}, false
}

// Children returns the live children of parent in sort order.
func (f *DocRepo) Children(opID uuid.UUID, parent *uuid.UUID) []models.WikiDocument {
	out, _, _ := f.FindChildDocumentsWithCounts(context.Background(), opID, parent)
	return out
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

// Store is an in-memory blob.ObjectStore.
type Store struct {
	mu    sync.Mutex
	Bytes map[string][]byte
	Types map[string]string
}

func NewStore() *Store {
	return &Store{Bytes: map[string][]byte{}, Types: map[string]string{}}
}

func (s *Store) Put(_ context.Context, key string, body io.Reader, _ int64, contentType string) error {
	b, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Bytes[key] = b
	s.Types[key] = contentType
	return nil
}

func (s *Store) Get(_ context.Context, key string) (io.ReadCloser, blob.ObjectInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.Bytes[key]
	if !ok {
		return nil, blob.ObjectInfo{}, ErrNotFound
	}
	return io.NopCloser(bytes.NewReader(b)), blob.ObjectInfo{ContentLength: int64(len(b)), ContentType: s.Types[key]}, nil
}

func (s *Store) Head(_ context.Context, key string) (blob.ObjectInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.Bytes[key]
	if !ok {
		return blob.ObjectInfo{}, ErrNotFound
	}
	return blob.ObjectInfo{ContentLength: int64(len(b)), ContentType: s.Types[key]}, nil
}

func (s *Store) Delete(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.Bytes, key)
	delete(s.Types, key)
	return nil
}

// Keys returns the stored keys, sorted.
func (s *Store) Keys() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]string, 0, len(s.Bytes))
	for k := range s.Bytes {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// ImageRepo is an in-memory IWikiImageRepository.
type ImageRepo struct {
	mu     sync.Mutex
	Images map[uuid.UUID]models.WikiImage
}

func NewImageRepo(imgs ...models.WikiImage) *ImageRepo {
	r := &ImageRepo{Images: map[uuid.UUID]models.WikiImage{}}
	for _, i := range imgs {
		r.Images[i.ImageID] = i
	}
	return r
}

func (r *ImageRepo) Create(_ context.Context, img *models.WikiImage) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Images[img.ImageID] = *img
	return nil
}

func (r *ImageRepo) FindByID(_ context.Context, id uuid.UUID) (models.WikiImage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	img, ok := r.Images[id]
	if !ok {
		return models.WikiImage{}, ErrNotFound
	}
	return img, nil
}

func (r *ImageRepo) FindByDocumentID(_ context.Context, docID uuid.UUID) ([]models.WikiImage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []models.WikiImage
	for _, i := range r.Images {
		if i.DocumentID == docID {
			out = append(out, i)
		}
	}
	return out, nil
}

func (r *ImageRepo) FindCandidatesOlderThan(_ context.Context, _ time.Time, _ int64) ([]models.WikiImage, error) {
	return nil, nil
}

func (r *ImageRepo) HardDelete(_ context.Context, id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.Images, id)
	return nil
}

// FileRepo is an in-memory IWikiFileRepository.
type FileRepo struct {
	mu    sync.Mutex
	Files map[uuid.UUID]models.WikiFile
}

func NewFileRepo(files ...models.WikiFile) *FileRepo {
	r := &FileRepo{Files: map[uuid.UUID]models.WikiFile{}}
	for _, f := range files {
		r.Files[f.FileID] = f
	}
	return r
}

func (r *FileRepo) Create(_ context.Context, f *models.WikiFile) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Files[f.FileID] = *f
	return nil
}

func (r *FileRepo) FindByID(_ context.Context, id uuid.UUID) (models.WikiFile, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	f, ok := r.Files[id]
	if !ok {
		return models.WikiFile{}, ErrNotFound
	}
	return f, nil
}

func (r *FileRepo) FindByDocumentID(_ context.Context, docID uuid.UUID) ([]models.WikiFile, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []models.WikiFile
	for _, f := range r.Files {
		if f.DocumentID == docID {
			out = append(out, f)
		}
	}
	return out, nil
}

func (r *FileRepo) FindCandidatesOlderThan(_ context.Context, _ time.Time, _ int64) ([]models.WikiFile, error) {
	return nil, nil
}

func (r *FileRepo) HardDelete(_ context.Context, id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.Files, id)
	return nil
}

// Ingestor is an in-memory wikitransfer.Ingestor that records every blob
// under the id it was asked to use.
type Ingestor struct {
	mu        sync.Mutex
	Images    map[uuid.UUID][]byte
	Files     map[uuid.UUID][]byte
	Filenames map[uuid.UUID]string
	Owners    map[uuid.UUID]uuid.UUID
	Discarded []uuid.UUID
	// FailImages makes every image ingest fail.
	FailImages bool
}

func NewIngestor() *Ingestor {
	return &Ingestor{
		Images: map[uuid.UUID][]byte{}, Files: map[uuid.UUID][]byte{},
		Filenames: map[uuid.UUID]string{}, Owners: map[uuid.UUID]uuid.UUID{},
	}
}

func (i *Ingestor) IngestImageWithID(_ context.Context, doc *models.WikiDocument, uploader uuid.UUID, body io.Reader, imageID uuid.UUID) (*models.WikiImage, *wiki.IngestError) {
	if i.FailImages {
		return nil, &wiki.IngestError{Status: 500, Message: "simulated image failure"}
	}
	b, _ := io.ReadAll(body)
	i.mu.Lock()
	defer i.mu.Unlock()
	i.Images[imageID] = b
	i.Owners[imageID] = doc.DocumentID
	return &models.WikiImage{ImageID: imageID, DocumentID: doc.DocumentID, OperationID: doc.OperationID, UploadedByID: uploader, SizeBytes: int64(len(b))}, nil
}

func (i *Ingestor) IngestFileWithID(_ context.Context, doc *models.WikiDocument, uploader uuid.UUID, body io.Reader, filename, contentType string, fileID uuid.UUID) (*models.WikiFile, *wiki.IngestError) {
	b, _ := io.ReadAll(body)
	i.mu.Lock()
	defer i.mu.Unlock()
	i.Files[fileID] = b
	i.Filenames[fileID] = filename
	i.Owners[fileID] = doc.DocumentID
	return &models.WikiFile{FileID: fileID, DocumentID: doc.DocumentID, OperationID: doc.OperationID, UploadedByID: uploader, Filename: filename, ContentType: contentType, SizeBytes: int64(len(b))}, nil
}

func (i *Ingestor) DiscardImage(_ context.Context, id uuid.UUID) error {
	i.mu.Lock()
	defer i.mu.Unlock()
	delete(i.Images, id)
	i.Discarded = append(i.Discarded, id)
	return nil
}

func (i *Ingestor) DiscardFile(_ context.Context, id uuid.UUID) error {
	i.mu.Lock()
	defer i.mu.Unlock()
	delete(i.Files, id)
	i.Discarded = append(i.Discarded, id)
	return nil
}

// ---------------------------------------------------------------------------
// Sidecar
// ---------------------------------------------------------------------------

var uuidRe = regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)

// Rebaser is a text-level stand-in for the sidecar's rebase-document
// route. Bodies are plain text in which references are written as
// `doc:<uuid>`, `host:<uuid>`, `hash:<uuid>`, `cred:<uuid>`,
// `/api/v1/wiki/images/<uuid>` and `/api/v1/wiki/files/<uuid>`. Ids in the
// map are rewritten; dropped ids become the literal `[dropped]`; the
// projection lists what remains.
type Rebaser struct {
	mu    sync.Mutex
	Calls []wiki.RebaseRequest
	// DrawingCalls records the scene rebases a run performed, so a test can
	// assert a drawing took the scene route rather than the prose one.
	DrawingCalls []wiki.RebaseDrawingRequest
	// FailBodyContaining makes the call fail when the body contains this.
	FailBodyContaining string
}

func (r *Rebaser) RebaseDocument(_ context.Context, req wiki.RebaseRequest) (wiki.RebaseResult, error) {
	r.mu.Lock()
	r.Calls = append(r.Calls, req)
	r.mu.Unlock()

	body := req.Markdown
	if len(req.ContentState) > 0 {
		body = string(req.ContentState)
	}
	if r.FailBodyContaining != "" && strings.Contains(body, r.FailBodyContaining) {
		return wiki.RebaseResult{}, errors.New("simulated rebase failure")
	}

	drop := map[string]struct{}{}
	for _, id := range req.Drop {
		drop[strings.ToLower(id)] = struct{}{}
	}
	dropKinds := map[wiki.ChipKind]struct{}{}
	for _, k := range req.DropUnmappedKinds {
		dropKinds[k] = struct{}{}
	}
	res := wiki.RebaseResult{SchemaVersion: 1}
	seen := map[string]struct{}{}

	kindOf := func(prefix string) wiki.ChipKind {
		switch prefix {
		case "doc:":
			return wiki.ChipDoc
		case "host:":
			return wiki.ChipHost
		case "hash:":
			return wiki.ChipHash
		case "cred:":
			return wiki.ChipCredential
		}
		return ""
	}

	tokenRe := regexp.MustCompile(`(doc:|host:|hash:|cred:|/api/v1/wiki/images/|/api/v1/wiki/files/)(` + uuidRe.String() + `)`)
	out := tokenRe.ReplaceAllStringFunc(body, func(m string) string {
		sub := tokenRe.FindStringSubmatch(m)
		prefix, id := sub[1], strings.ToLower(sub[2])
		mapped, ok := req.IDMap[id]
		if !ok {
			for k, v := range req.IDMap {
				if strings.EqualFold(k, id) {
					mapped, ok = v, true
				}
			}
		}
		kind := kindOf(prefix)
		if ok {
			id = strings.ToLower(mapped)
			res.Remapped++
		} else if kind != "" {
			if _, d := drop[id]; d {
				res.Dropped++
				return "[dropped]"
			}
			if _, d := dropKinds[kind]; d {
				res.Dropped++
				return "[dropped]"
			}
			res.Unmapped = append(res.Unmapped, id)
		} else {
			res.Unmapped = append(res.Unmapped, id)
		}
		if _, dup := seen[prefix+id]; !dup {
			seen[prefix+id] = struct{}{}
			switch prefix {
			case "doc:":
				res.References = append(res.References, id)
			case "host:":
				res.HostReferences = append(res.HostReferences, id)
			case "hash:":
				res.HashReferences = append(res.HashReferences, id)
			case "cred:":
				res.CredentialReferences = append(res.CredentialReferences, id)
			case "/api/v1/wiki/images/":
				res.ImageReferences = append(res.ImageReferences, id)
			case "/api/v1/wiki/files/":
				res.FileReferences = append(res.FileReferences, id)
			}
		}
		return prefix + id
	})
	res.ContentState = []byte(out)
	res.Content = out
	if strings.Contains(out, "checklist") {
		res.Checklist = wiki.ChecklistCoverage{Total: 1, Required: 1, Answered: 1}
	}
	return res, nil
}

// Renderer turns fake content_state (plain text) back into "markdown" by
// returning it verbatim, so the exported .md copies and the reference
// collectors see the same ids the fake sidecar would.
type Renderer struct{}

func (Renderer) YjsToMarkdown(_ context.Context, state []byte) (string, error) {
	return string(state), nil
}

// ---------------------------------------------------------------------------
// Credentials, hosts, hashes, operations
// ---------------------------------------------------------------------------

// CredentialRepo is an in-memory ICredentialRepository for FindByID/Create.
type CredentialRepo struct {
	repository.ICredentialRepository
	mu    sync.Mutex
	Creds map[uuid.UUID]models.Credential
}

func NewCredentialRepo(creds ...models.Credential) *CredentialRepo {
	r := &CredentialRepo{Creds: map[uuid.UUID]models.Credential{}}
	for _, c := range creds {
		r.Creds[c.CredentialID] = c
	}
	return r
}

func (r *CredentialRepo) Create(_ context.Context, c *models.Credential) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Creds[c.CredentialID] = *c
	return nil
}

func (r *CredentialRepo) FindByID(_ context.Context, id uuid.UUID) (models.Credential, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	c, ok := r.Creds[id]
	if !ok {
		return models.Credential{}, ErrNotFound
	}
	return c, nil
}

// HostRepo answers FindByID from a map.
type HostRepo struct {
	repository.IHostRepository
	Hosts map[uuid.UUID]models.Host
}

func (r *HostRepo) FindByID(_ context.Context, id uuid.UUID) (models.Host, error) {
	h, ok := r.Hosts[id]
	if !ok {
		return models.Host{}, ErrNotFound
	}
	return h, nil
}

// HashRepo answers FindByID from a map.
type HashRepo struct {
	repository.IHashRepository
	Hashes map[uuid.UUID]models.Hash
}

func (r *HashRepo) FindByID(_ context.Context, id uuid.UUID) (models.Hash, error) {
	h, ok := r.Hashes[id]
	if !ok {
		return models.Hash{}, ErrNotFound
	}
	return h, nil
}

// OperationRepo answers FindByID from a map.
type OperationRepo struct {
	repository.IOperationRepository
	Ops map[uuid.UUID]models.Operation
}

func (r *OperationRepo) FindByID(_ context.Context, id uuid.UUID) (models.Operation, error) {
	op, ok := r.Ops[id]
	if !ok {
		return models.Operation{}, ErrNotFound
	}
	return op, nil
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

// JobRepo is an in-memory IWikiTransferJobRepository.
type JobRepo struct {
	mu   sync.Mutex
	Jobs map[uuid.UUID]*models.WikiTransferJob
	seq  int
	// order preserves insertion order for Claim.
	order []uuid.UUID
}

func NewJobRepo() *JobRepo {
	return &JobRepo{Jobs: map[uuid.UUID]*models.WikiTransferJob{}}
}

func (r *JobRepo) Create(_ context.Context, job *models.WikiTransferJob) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.seq++
	job.CreateAt = time.Now().UTC().Add(time.Duration(r.seq) * time.Millisecond)
	cp := *job
	r.Jobs[job.JobID] = &cp
	r.order = append(r.order, job.JobID)
	return nil
}

func (r *JobRepo) FindByID(_ context.Context, id uuid.UUID) (models.WikiTransferJob, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	j, ok := r.Jobs[id]
	if !ok {
		return models.WikiTransferJob{}, ErrNotFound
	}
	return *j, nil
}

func (r *JobRepo) FindByOperationID(_ context.Context, opID uuid.UUID, _ int64) ([]models.WikiTransferJob, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []models.WikiTransferJob
	for i := len(r.order) - 1; i >= 0; i-- {
		if j := r.Jobs[r.order[i]]; j != nil && j.OperationID == opID {
			out = append(out, *j)
		}
	}
	return out, nil
}

func (r *JobRepo) Claim(_ context.Context, now time.Time) (models.WikiTransferJob, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, id := range r.order {
		j := r.Jobs[id]
		if j != nil && j.Status == models.WikiTransferQueued {
			j.Status = models.WikiTransferRunning
			t := now
			j.StartedAt = &t
			return *j, nil
		}
	}
	return models.WikiTransferJob{}, repository.ErrNoQueuedJob
}

func (r *JobRepo) CountRunningForOperation(_ context.Context, opID uuid.UUID) (int64, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var n int64
	for _, j := range r.Jobs {
		if j.OperationID == opID && (j.Status == models.WikiTransferQueued || j.Status == models.WikiTransferRunning) {
			n++
		}
	}
	return n, nil
}

// Update applies the subset of fields the runner writes.
func (r *JobRepo) Update(_ context.Context, id uuid.UUID, updates map[string]any) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	j, ok := r.Jobs[id]
	if !ok {
		return ErrNotFound
	}
	for k, v := range updates {
		switch k {
		case "status":
			j.Status = v.(models.WikiTransferStatus)
		case "error":
			j.Error = v.(string)
		case "report":
			j.Report = v.([]byte)
		case "artifact_key":
			j.ArtifactKey = v.(string)
		case "artifact_name":
			j.ArtifactName = v.(string)
		case "artifact_size":
			j.ArtifactSize = v.(int64)
		case "progress":
			j.Progress = v.(models.WikiTransferProgress)
		case "format":
			j.Format = v.(models.WikiTransferFormat)
		case "finished_at":
			t := v.(time.Time)
			j.FinishedAt = &t
		case "expires_at":
			j.ExpiresAt = v.(time.Time)
		}
	}
	return nil
}

func (r *JobRepo) FindExpired(_ context.Context, now time.Time, _ int64) ([]models.WikiTransferJob, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []models.WikiTransferJob
	for _, j := range r.Jobs {
		if j.IsTerminal() && j.ExpiresAt.Before(now) {
			out = append(out, *j)
		}
	}
	return out, nil
}

func (r *JobRepo) FindStale(_ context.Context, cutoff time.Time, _ int64) ([]models.WikiTransferJob, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []models.WikiTransferJob
	for _, j := range r.Jobs {
		if j.Status == models.WikiTransferRunning && j.StartedAt != nil && j.StartedAt.Before(cutoff) {
			out = append(out, *j)
		}
	}
	return out, nil
}

func (r *JobRepo) Delete(_ context.Context, id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.Jobs, id)
	return nil
}

// RebaseDrawing is the scene counterpart of RebaseDocument.
//
// The fake treats ContentState as an opaque string, exactly as the prose fake
// does, and rewrites any wiki image id it finds using the same IDMap. That is
// enough to test what the materialiser is responsible for — that a drawing
// goes through this call, that the mapping reaches it, and that unmapped
// images are reported — without reimplementing Y.js here.
func (r *Rebaser) RebaseDrawing(_ context.Context, req wiki.RebaseDrawingRequest) (wiki.RebaseDrawingResult, error) {
	r.mu.Lock()
	r.DrawingCalls = append(r.DrawingCalls, req)
	r.mu.Unlock()

	body := string(req.ContentState)
	if r.FailBodyContaining != "" && strings.Contains(body, r.FailBodyContaining) {
		return wiki.RebaseDrawingResult{}, errors.New("simulated drawing rebase failure")
	}

	res := wiki.RebaseDrawingResult{}
	seen := map[string]struct{}{}

	out := uuidRe.ReplaceAllStringFunc(body, func(id string) string {
		lower := strings.ToLower(id)
		mapped, ok := req.IDMap[lower]
		if !ok {
			for k, v := range req.IDMap {
				if strings.EqualFold(k, lower) {
					mapped, ok = v, true
				}
			}
		}
		if ok {
			lower = strings.ToLower(mapped)
			res.Remapped++
		} else {
			res.Unmapped = append(res.Unmapped, lower)
			return lower
		}
		if _, dup := seen[lower]; !dup {
			seen[lower] = struct{}{}
			res.ImageReferences = append(res.ImageReferences, lower)
		}
		return lower
	})

	res.ContentState = []byte(out)
	res.Content = out
	res.ElementCount = strings.Count(out, "element") + 1
	res.VersionSum = res.ElementCount
	return res, nil
}
