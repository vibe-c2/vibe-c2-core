package wikiimport

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
	"go.uber.org/zap"
)

var errNotFound = errors.New("not found")

// TestOrchestrator_Run_Smoke runs the parser+orchestrator end-to-end on the
// real Outline fixture using in-memory fakes for Mongo, the blob store, and
// the Hocuspocus sidecar. Asserts the basic shape of the report and that
// the import/<timestamp>/<collection> hierarchy was created.
func TestOrchestrator_Run_Smoke(t *testing.T) {
	zr := openFixture(t)
	parsed, err := Parse(&zr.Reader)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	docRepo := newFakeDocRepo()
	imageIn := &fakeImageIngestor{}
	fileIn := &fakeFileIngestor{}
	converter := &fakeConverter{}

	orch := NewOrchestrator(docRepo, imageIn, fileIn, converter, zap.NewNop())

	opID := uuid.New()
	callerID := uuid.New()

	report, err := orch.Run(context.Background(), opID, callerID, parsed)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if report.ImportParentID == uuid.Nil {
		t.Error("ImportParentID not set")
	}
	if report.TimestampParentID == uuid.Nil {
		t.Error("TimestampParentID not set")
	}
	if report.TotalDocs != 3 {
		t.Errorf("TotalDocs = %d, want 3", report.TotalDocs)
	}
	if report.CreatedDocs != 3 {
		t.Errorf("CreatedDocs = %d, want 3 (had skipped: %v)", report.CreatedDocs, report.Skipped)
	}
	if report.ImagesIngested != 1 {
		t.Errorf("ImagesIngested = %d, want 1", report.ImagesIngested)
	}
	if report.FilesIngested != 1 {
		t.Errorf("FilesIngested = %d, want 1", report.FilesIngested)
	}

	// Holding-pen structure: one "import" parent, one "<ISO>" timestamp
	// parent under it, one "test" collection parent under that, then the
	// 3 imported docs under "test".
	if got, want := docRepo.countDocs(), 6; got != want {
		t.Errorf("doc count = %d, want %d", got, want)
	}
	if !docRepo.hasRootDocWithTitle("import") {
		t.Error("import singleton missing")
	}

	// The first three updates seed the imported docs' content_state.
	if converter.calls < 3 {
		t.Errorf("converter called %d times, want >= 3", converter.calls)
	}
}

// TestOrchestrator_ReusesImportParent verifies that running two imports
// against the same operation reuses the singleton import parent rather
// than creating a new one each time.
func TestOrchestrator_ReusesImportParent(t *testing.T) {
	zr := openFixture(t)
	parsed, _ := Parse(&zr.Reader)

	docRepo := newFakeDocRepo()
	orch := NewOrchestrator(docRepo, &fakeImageIngestor{}, &fakeFileIngestor{}, &fakeConverter{}, zap.NewNop())

	opID := uuid.New()
	callerID := uuid.New()

	r1, err := orch.Run(context.Background(), opID, callerID, parsed)
	if err != nil {
		t.Fatalf("first Run: %v", err)
	}
	r2, err := orch.Run(context.Background(), opID, callerID, parsed)
	if err != nil {
		t.Fatalf("second Run: %v", err)
	}

	if r1.ImportParentID != r2.ImportParentID {
		t.Errorf("import parent should be reused: r1=%s r2=%s",
			r1.ImportParentID, r2.ImportParentID)
	}
	if r1.TimestampParentID == r2.TimestampParentID {
		t.Errorf("timestamp parent should be fresh per run, got same %s",
			r1.TimestampParentID)
	}
}

// --- fakes ---

type fakeDocRepo struct {
	docs map[uuid.UUID]*models.WikiDocument
}

func newFakeDocRepo() *fakeDocRepo {
	return &fakeDocRepo{docs: map[uuid.UUID]*models.WikiDocument{}}
}

func (r *fakeDocRepo) countDocs() int { return len(r.docs) }

func (r *fakeDocRepo) hasRootDocWithTitle(title string) bool {
	for _, d := range r.docs {
		if d.ParentDocumentID == nil && strings.EqualFold(d.Title, title) {
			return true
		}
	}
	return false
}

func (r *fakeDocRepo) Create(_ context.Context, doc *models.WikiDocument) error {
	r.docs[doc.DocumentID] = doc
	return nil
}

func (r *fakeDocRepo) FindByID(_ context.Context, id uuid.UUID) (models.WikiDocument, error) {
	if d, ok := r.docs[id]; ok {
		return *d, nil
	}
	return models.WikiDocument{}, errNotFound
}

func (r *fakeDocRepo) FindAllByOperationID(_ context.Context, opID uuid.UUID) ([]models.WikiDocument, error) {
	var out []models.WikiDocument
	for _, d := range r.docs {
		if d.OperationID == opID {
			out = append(out, *d)
		}
	}
	return out, nil
}

func (r *fakeDocRepo) NestingDepth(_ context.Context, parentID uuid.UUID) (int, error) {
	depth := 0
	id := parentID
	for {
		d, ok := r.docs[id]
		if !ok {
			break
		}
		depth++
		if d.ParentDocumentID == nil {
			break
		}
		id = *d.ParentDocumentID
	}
	return depth, nil
}

func (r *fakeDocRepo) Update(_ context.Context, doc *models.WikiDocument, updates map[string]interface{}) error {
	stored, ok := r.docs[doc.DocumentID]
	if !ok {
		return errNotFound
	}
	if v, ok := updates["content"]; ok {
		stored.Content = v.(string)
	}
	if v, ok := updates["content_state"]; ok {
		stored.ContentState = v.([]byte)
	}
	return nil
}

// Unused interface methods — minimal stubs.
func (r *fakeDocRepo) FindByOperationIDWithCursor(context.Context, uuid.UUID, repository.WikiDocumentFilter, *pagination.Cursor, int64, bool) ([]models.WikiDocument, error) {
	return nil, nil
}
func (r *fakeDocRepo) FindTrashedByOperationIDWithCursor(context.Context, uuid.UUID, *pagination.Cursor, int64, bool) ([]models.WikiDocument, error) {
	return nil, nil
}
func (r *fakeDocRepo) CountByOperationID(context.Context, uuid.UUID, repository.WikiDocumentFilter) (int64, error) {
	return 0, nil
}
func (r *fakeDocRepo) FindChildDocuments(context.Context, uuid.UUID) ([]models.WikiDocument, error) {
	return nil, nil
}
func (r *fakeDocRepo) CountChildDocuments(context.Context, uuid.UUID) (int64, error) {
	return 0, nil
}
func (r *fakeDocRepo) FindDescendants(context.Context, uuid.UUID) ([]models.WikiDocument, error) {
	return nil, nil
}
func (r *fakeDocRepo) FindTrashedDescendants(context.Context, uuid.UUID) ([]models.WikiDocument, error) {
	return nil, nil
}
func (r *fakeDocRepo) FindAncestors(context.Context, uuid.UUID) ([]models.WikiDocument, error) {
	return nil, nil
}
func (r *fakeDocRepo) SoftDelete(context.Context, *models.WikiDocument, uuid.UUID) error { return nil }
func (r *fakeDocRepo) SoftDeleteBatch(context.Context, []uuid.UUID, uuid.UUID) error    { return nil }
func (r *fakeDocRepo) Restore(context.Context, *models.WikiDocument) error              { return nil }
func (r *fakeDocRepo) RestoreBatch(context.Context, []uuid.UUID, uuid.UUID) error       { return nil }
func (r *fakeDocRepo) HardDelete(context.Context, *models.WikiDocument) error           { return nil }
func (r *fakeDocRepo) HardDeleteByOperationID(context.Context, uuid.UUID) error         { return nil }
func (r *fakeDocRepo) HardDeleteTrashed(context.Context, uuid.UUID) error               { return nil }
func (r *fakeDocRepo) FindChangedSinceLastBackup(context.Context, int64) ([]models.WikiDocument, error) {
	return nil, nil
}
func (r *fakeDocRepo) RestoreFromBackup(context.Context, uuid.UUID, string, []byte) error {
	return nil
}
func (r *fakeDocRepo) SearchByOperationID(context.Context, uuid.UUID, *uuid.UUID, string, int64, int64) ([]repository.WikiDocumentSearchHit, int64, error) {
	return nil, 0, nil
}

type fakeImageIngestor struct{ count int }

func (f *fakeImageIngestor) IngestImage(_ context.Context, doc *models.WikiDocument, _ uuid.UUID, body io.Reader) (*models.WikiImage, *wiki.IngestError) {
	_, _ = io.Copy(io.Discard, body)
	f.count++
	return &models.WikiImage{
		ImageID:     uuid.New(),
		OperationID: doc.OperationID,
		DocumentID:  doc.DocumentID,
	}, nil
}

type fakeFileIngestor struct{ count int }

func (f *fakeFileIngestor) IngestFile(_ context.Context, doc *models.WikiDocument, _ uuid.UUID, body io.Reader, _ string, _ string) (*models.WikiFile, *wiki.IngestError) {
	_, _ = io.Copy(io.Discard, body)
	f.count++
	return &models.WikiFile{
		FileID:      uuid.New(),
		OperationID: doc.OperationID,
		DocumentID:  doc.DocumentID,
	}, nil
}

type fakeConverter struct{ calls int }

func (f *fakeConverter) MarkdownToYjs(_ context.Context, _ string) ([]byte, error) {
	f.calls++
	// A non-empty stub — orchestrator only stores it, doesn't decode.
	return []byte("y-doc-update"), nil
}
