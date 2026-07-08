package wikiexport

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// fakeDocRepo implements only the methods the export orchestrator uses.
// Methods not exercised by the export path either panic (so we notice if
// the surface accidentally widens) or return zero values for read-only
// trivia (CountChildDocuments).
type fakeDocRepo struct {
	repository.IWikiDocumentRepository
	docs []models.WikiDocument
}

func (f *fakeDocRepo) FindAllByOperationID(_ context.Context, _ uuid.UUID) ([]models.WikiDocument, error) {
	out := make([]models.WikiDocument, len(f.docs))
	copy(out, f.docs)
	return out, nil
}

func (f *fakeDocRepo) FindTemplatesByOperationID(_ context.Context, _ uuid.UUID) ([]models.WikiDocument, error) {
	var out []models.WikiDocument
	for _, d := range f.docs {
		if d.IsTemplate && d.DeletedAt == nil {
			out = append(out, d)
		}
	}
	return out, nil
}

func (f *fakeDocRepo) FindByID(_ context.Context, id uuid.UUID) (models.WikiDocument, error) {
	for _, d := range f.docs {
		if d.DocumentID == id {
			return d, nil
		}
	}
	return models.WikiDocument{}, errors.New("not found")
}

func (f *fakeDocRepo) FindDescendants(_ context.Context, root uuid.UUID) ([]models.WikiDocument, error) {
	var out []models.WikiDocument
	queue := []uuid.UUID{root}
	for len(queue) > 0 {
		parent := queue[0]
		queue = queue[1:]
		for _, d := range f.docs {
			if d.ParentDocumentID != nil && *d.ParentDocumentID == parent {
				out = append(out, d)
				queue = append(queue, d.DocumentID)
			}
		}
	}
	return out, nil
}

// fakeImageRepo / fakeFileRepo store one record per id.
type fakeImageRepo struct {
	repository.IWikiImageRepository
	by map[uuid.UUID]models.WikiImage
}

func (f *fakeImageRepo) FindByID(_ context.Context, id uuid.UUID) (models.WikiImage, error) {
	img, ok := f.by[id]
	if !ok {
		return models.WikiImage{}, errors.New("not found")
	}
	return img, nil
}

type fakeFileRepo struct {
	repository.IWikiFileRepository
	by map[uuid.UUID]models.WikiFile
}

func (f *fakeFileRepo) FindByID(_ context.Context, id uuid.UUID) (models.WikiFile, error) {
	file, ok := f.by[id]
	if !ok {
		return models.WikiFile{}, errors.New("not found")
	}
	return file, nil
}

// fakeStore is the minimal blob.ObjectStore the export reads from. Returns
// fixed bytes for each known key.
type fakeStore struct {
	bytes map[string][]byte
}

func (s *fakeStore) Get(_ context.Context, key string) (io.ReadCloser, blob.ObjectInfo, error) {
	b, ok := s.bytes[key]
	if !ok {
		return nil, blob.ObjectInfo{}, errors.New("blob not found")
	}
	return io.NopCloser(bytes.NewReader(b)), blob.ObjectInfo{ContentLength: int64(len(b))}, nil
}

func (s *fakeStore) Put(_ context.Context, _ string, _ io.Reader, _ int64, _ string) error {
	return errors.New("unused")
}

func (s *fakeStore) Head(_ context.Context, _ string) (blob.ObjectInfo, error) {
	return blob.ObjectInfo{}, errors.New("unused")
}

func (s *fakeStore) Delete(_ context.Context, _ string) error {
	return errors.New("unused")
}

// fakeRenderer returns markdown keyed by content_state bytes so tests can
// give each document a distinct body. The constructor accepts a single
// default markdown for the common case where only one doc's body matters.
type fakeRenderer struct {
	markdown   string
	byBytesKey map[string]string
}

func (r *fakeRenderer) YjsToMarkdown(_ context.Context, bytes []byte) (string, error) {
	if r.byBytesKey != nil {
		if md, ok := r.byBytesKey[string(bytes)]; ok {
			return md, nil
		}
	}
	return r.markdown, nil
}

// newRunner builds an orchestrator with the given fakes. bodyMarkdown is the
// renderer's default output for any doc whose content_state bytes don't appear
// in bodyByContentState — pass an empty string to default to "no body".
func newRunner(docs []models.WikiDocument, imgs []models.WikiImage, files []models.WikiFile, bodyMarkdown string, bodyByContentState ...map[string]string) (*Orchestrator, *fakeStore, *fakeStore) {
	imageByID := map[uuid.UUID]models.WikiImage{}
	imageBlobs := map[string][]byte{}
	for _, img := range imgs {
		imageByID[img.ImageID] = img
		imageBlobs[img.ObjectKey] = []byte("image-bytes:" + img.ImageID.String())
	}
	fileByID := map[uuid.UUID]models.WikiFile{}
	fileBlobs := map[string][]byte{}
	for _, file := range files {
		fileByID[file.FileID] = file
		fileBlobs[file.ObjectKey] = []byte("file-bytes:" + file.FileID.String())
	}
	imageStore := &fakeStore{bytes: imageBlobs}
	fileStore := &fakeStore{bytes: fileBlobs}
	var byBytes map[string]string
	if len(bodyByContentState) > 0 {
		byBytes = bodyByContentState[0]
	}
	o := NewOrchestrator(
		&fakeDocRepo{docs: docs},
		&fakeImageRepo{by: imageByID},
		&fakeFileRepo{by: fileByID},
		imageStore,
		fileStore,
		&fakeRenderer{markdown: bodyMarkdown, byBytesKey: byBytes},
		nil, // credential lookup not exercised by attachment-focused tests
		zap.NewNop(),
		Config{},
	)
	return o, imageStore, fileStore
}

// Helper to enumerate zip entries in the export buffer.
func listZipEntries(t *testing.T, buf *bytes.Buffer) []string {
	t.Helper()
	r, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatalf("open zip: %v", err)
	}
	out := make([]string, 0, len(r.File))
	for _, f := range r.File {
		out = append(out, f.Name)
	}
	return out
}

// readZipFile returns the body of one entry in the zip.
func readZipFile(t *testing.T, buf *bytes.Buffer, name string) string {
	t.Helper()
	r, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatalf("open zip: %v", err)
	}
	for _, f := range r.File {
		if f.Name != name {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("open %s: %v", name, err)
		}
		defer rc.Close()
		b, err := io.ReadAll(rc)
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		return string(b)
	}
	t.Fatalf("entry %s not in zip; entries: %v", name, listZipEntries(t, buf))
	return ""
}

func TestExportAttachmentsAreStreamed(t *testing.T) {
	opID := uuid.MustParse("00000000-0000-0000-0000-0000000000aa")
	docID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	imgID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	fileID := uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
	now := time.Now()

	doc := models.WikiDocument{
		DefaultField: field.DefaultField{CreateAt: now, UpdateAt: now},
		DocumentID:   docID,
		OperationID:  opID,
		Title:        "Intro",
		SortOrder:    "a0",
		ContentState: []byte{0x01, 0x02}, // non-empty so renderer is called
	}

	img := models.WikiImage{
		DefaultField: field.DefaultField{CreateAt: now, UpdateAt: now},
		ImageID:      imgID,
		OperationID:  opID,
		DocumentID:   docID,
		ObjectKey:    "img/" + imgID.String(),
		ContentType:  "image/png",
		SizeBytes:    12,
	}
	file := models.WikiFile{
		DefaultField: field.DefaultField{CreateAt: now, UpdateAt: now},
		FileID:       fileID,
		OperationID:  opID,
		DocumentID:   docID,
		ObjectKey:    "file/" + fileID.String(),
		Filename:     "report.pdf",
		ContentType:  "application/pdf",
		SizeBytes:    11,
	}

	body := "Look:\n\n" +
		"![alt](/api/v1/wiki/images/" + imgID.String() + " \" =100x200\")\n\n" +
		"And the file: [report.pdf 11](/api/v1/wiki/files/" + fileID.String() + ")\n"

	o, _, _ := newRunner(
		[]models.WikiDocument{doc},
		[]models.WikiImage{img},
		[]models.WikiFile{file},
		body,
	)

	var out bytes.Buffer
	zw := zip.NewWriter(&out)
	report, err := o.Run(context.Background(), zw, Request{
		OperationID:   opID,
		OperationName: "Op",
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zw.Close: %v", err)
	}

	if report.ExportedDocs != 1 {
		t.Errorf("ExportedDocs = %d, want 1", report.ExportedDocs)
	}
	if report.ImagesExported != 1 {
		t.Errorf("ImagesExported = %d, want 1 (warnings: %+v)", report.ImagesExported, report.Warnings)
	}
	if report.FilesExported != 1 {
		t.Errorf("FilesExported = %d, want 1 (warnings: %+v)", report.FilesExported, report.Warnings)
	}

	entries := listZipEntries(t, &out)
	hasImageEntry := false
	hasFileEntry := false
	for _, name := range entries {
		if strings.Contains(name, "/uploads/"+docID.String()+"/"+imgID.String()+"/") {
			hasImageEntry = true
		}
		if strings.Contains(name, "/uploads/"+docID.String()+"/"+fileID.String()+"/") {
			hasFileEntry = true
		}
	}
	if !hasImageEntry {
		t.Errorf("image not in zip; entries: %v", entries)
	}
	if !hasFileEntry {
		t.Errorf("file not in zip; entries: %v", entries)
	}

	// And the rewritten body should reference the in-zip relative paths,
	// not the original /api/v1/... URLs.
	docContent := readZipFile(t, &out, "op/001-intro.md")
	if strings.Contains(docContent, "/api/v1/wiki/images/"+imgID.String()) {
		t.Errorf("image ref not rewritten:\n%s", docContent)
	}
	if !strings.Contains(docContent, "uploads/"+docID.String()+"/"+imgID.String()+"/") {
		t.Errorf("image relative path missing:\n%s", docContent)
	}
}

func TestExportSubtreeAttachments(t *testing.T) {
	opID := uuid.MustParse("00000000-0000-0000-0000-0000000000bb")
	rootID := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	childID := uuid.MustParse("33333333-3333-3333-3333-333333333333")
	imgID := uuid.MustParse("cccccccc-cccc-cccc-cccc-cccccccccccc")
	now := time.Now()

	root := models.WikiDocument{
		DefaultField: field.DefaultField{CreateAt: now, UpdateAt: now},
		DocumentID:   rootID,
		OperationID:  opID,
		Title:        "Root",
		SortOrder:    "a0",
		ContentState: []byte{0x01},
	}
	child := models.WikiDocument{
		DefaultField:     field.DefaultField{CreateAt: now, UpdateAt: now},
		DocumentID:       childID,
		OperationID:      opID,
		ParentDocumentID: &rootID,
		Title:            "Child With Image",
		SortOrder:        "b0",
		ContentState:     []byte{0x02},
	}
	img := models.WikiImage{
		DefaultField: field.DefaultField{CreateAt: now, UpdateAt: now},
		ImageID:      imgID,
		OperationID:  opID,
		DocumentID:   childID,
		ObjectKey:    "img/" + imgID.String(),
		ContentType:  "image/jpeg",
		SizeBytes:    8,
	}

	// Only the child references the image. The root's body is plain
	// markdown with no attachments, mirroring a typical wiki subtree
	// where parents are landing pages and leaves carry the artwork.
	rootBody := "Welcome to the subtree.\n"
	childBody := "![](/api/v1/wiki/images/" + imgID.String() + ")\n"
	o, _, _ := newRunner(
		[]models.WikiDocument{root, child},
		[]models.WikiImage{img},
		nil,
		"",
		map[string]string{
			string([]byte{0x01}): rootBody,
			string([]byte{0x02}): childBody,
		},
	)

	var out bytes.Buffer
	zw := zip.NewWriter(&out)
	report, err := o.Run(context.Background(), zw, Request{
		OperationID:   opID,
		OperationName: "Op",
		RootID:        &rootID,
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zw.Close: %v", err)
	}

	if report.ImagesExported != 1 {
		t.Errorf("ImagesExported = %d, want 1 (warnings: %+v)", report.ImagesExported, report.Warnings)
	}

	entries := listZipEntries(t, &out)
	found := false
	for _, e := range entries {
		if strings.Contains(e, "/uploads/"+childID.String()+"/"+imgID.String()+"/") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("subtree child's image not exported; entries: %v", entries)
	}

	// Child .md should reference attachments by the canonical
	// `uploads/<docId>/<attId>/<filename>` form — same convention the
	// importer's parser matches — regardless of how deep the .md is.
	// A filesystem-relative `../uploads/...` form would NOT round-trip.
	for _, e := range entries {
		if !strings.HasSuffix(e, ".md") || strings.HasSuffix(e, "EXPORT_REPORT.json") {
			continue
		}
		if !strings.Contains(e, "/001-root/") {
			continue
		}
		body := readZipFile(t, &out, e)
		if strings.Contains(body, "../uploads/") {
			t.Errorf("child markdown must NOT use ../uploads/ (importer matches uploads/...), got:\n%s", body)
		}
		if !strings.Contains(body, "uploads/"+childID.String()+"/") {
			t.Errorf("child markdown should use uploads/<docId>/..., got:\n%s", body)
		}
	}
}

// Sanity: the regex matchers should pick up canonical URLs without choking
// on adjacent characters or attribute hints.
func TestCollectAttachmentRefsAcceptsCanonicalURLs(t *testing.T) {
	id := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	bodies := []string{
		// Bare URL
		"see /api/v1/wiki/images/" + id.String() + " here",
		// Inside markdown image
		"![alt](/api/v1/wiki/images/" + id.String() + ")",
		// With size title
		"![alt](/api/v1/wiki/images/" + id.String() + " \" =640x480\")",
	}
	for _, body := range bodies {
		images, _ := collectAttachmentRefs(body)
		if len(images) != 1 || images[0] != id {
			t.Errorf("missed ref in %q — got images=%v", body, images)
		}
	}
}

// Compile-time check that fakeStore satisfies blob.ObjectStore.
var _ blob.ObjectStore = (*fakeStore)(nil)
