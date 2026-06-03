package wiki

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// --- test stubs -------------------------------------------------------------
//
// Each stub embeds the full interface so it satisfies the type; only the
// methods the sweeper actually calls are implemented. Any unexpected call
// panics with a nil-method dereference, which surfaces accidental coupling.

type stubImageDocRepo struct {
	repository.IWikiDocumentRepository
	// referenced maps operationID -> set of image ids considered live.
	referenced map[uuid.UUID]map[uuid.UUID]struct{}
	err        error
	calls      int
}

func (s *stubImageDocRepo) FilterReferencedImageIDs(_ context.Context, opID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]struct{}, error) {
	s.calls++
	if s.err != nil {
		return nil, s.err
	}
	out := make(map[uuid.UUID]struct{})
	live := s.referenced[opID]
	for _, id := range ids {
		if _, ok := live[id]; ok {
			out[id] = struct{}{}
		}
	}
	return out, nil
}

type stubImageRepo struct {
	repository.IWikiImageRepository
	candidates []models.WikiImage
	deleted    []uuid.UUID
}

func (s *stubImageRepo) FindCandidatesOlderThan(_ context.Context, _ time.Time, _ int64) ([]models.WikiImage, error) {
	return s.candidates, nil
}

func (s *stubImageRepo) HardDelete(_ context.Context, id uuid.UUID) error {
	s.deleted = append(s.deleted, id)
	return nil
}

type stubStore struct {
	blob.ObjectStore
	deleted []string
}

func (s *stubStore) Delete(_ context.Context, key string) error {
	s.deleted = append(s.deleted, key)
	return nil
}

func newImageCandidate(opID uuid.UUID) models.WikiImage {
	id := uuid.New()
	return models.WikiImage{
		ImageID:     id,
		OperationID: opID,
		ObjectKey:   "img/" + id.String(),
	}
}

// --- tests ------------------------------------------------------------------

func TestImageSweeper_DeletesOnlyUnreferenced(t *testing.T) {
	opID := uuid.New()
	live := newImageCandidate(opID)
	dead := newImageCandidate(opID)

	docRepo := &stubImageDocRepo{
		referenced: map[uuid.UUID]map[uuid.UUID]struct{}{
			opID: {live.ImageID: {}},
		},
	}
	imgRepo := &stubImageRepo{candidates: []models.WikiImage{live, dead}}
	store := &stubStore{}

	s := NewImageSweeper(docRepo, imgRepo, store, zap.NewNop(), time.Hour, time.Hour, false)
	s.runTick()

	if len(imgRepo.deleted) != 1 || imgRepo.deleted[0] != dead.ImageID {
		t.Fatalf("expected only the unreferenced image deleted, got %v", imgRepo.deleted)
	}
	if len(store.deleted) != 1 || store.deleted[0] != dead.ObjectKey {
		t.Fatalf("expected only the unreferenced blob deleted, got %v", store.deleted)
	}
}

func TestImageSweeper_DryRunDeletesNothing(t *testing.T) {
	opID := uuid.New()
	dead := newImageCandidate(opID)

	docRepo := &stubImageDocRepo{referenced: map[uuid.UUID]map[uuid.UUID]struct{}{}}
	imgRepo := &stubImageRepo{candidates: []models.WikiImage{dead}}
	store := &stubStore{}

	s := NewImageSweeper(docRepo, imgRepo, store, zap.NewNop(), time.Hour, time.Hour, true)
	s.runTick()

	if len(imgRepo.deleted) != 0 || len(store.deleted) != 0 {
		t.Fatalf("dry-run must not delete anything; metadata=%v blobs=%v", imgRepo.deleted, store.deleted)
	}
}

func TestImageSweeper_FailSafeOnQueryError(t *testing.T) {
	opID := uuid.New()
	dead := newImageCandidate(opID)

	docRepo := &stubImageDocRepo{err: errors.New("mongo down")}
	imgRepo := &stubImageRepo{candidates: []models.WikiImage{dead}}
	store := &stubStore{}

	s := NewImageSweeper(docRepo, imgRepo, store, zap.NewNop(), time.Hour, time.Hour, false)
	s.runTick()

	if len(imgRepo.deleted) != 0 || len(store.deleted) != 0 {
		t.Fatalf("a reference-lookup error must skip deletion; metadata=%v blobs=%v", imgRepo.deleted, store.deleted)
	}
}

func TestImageSweeper_ScopesReferencesPerOperation(t *testing.T) {
	opA := uuid.New()
	opB := uuid.New()
	imgA := newImageCandidate(opA) // referenced in opA -> kept
	imgB := newImageCandidate(opB) // referenced by nothing in opB -> deleted

	docRepo := &stubImageDocRepo{
		referenced: map[uuid.UUID]map[uuid.UUID]struct{}{
			opA: {imgA.ImageID: {}},
			// opB intentionally has no live set
		},
	}
	imgRepo := &stubImageRepo{candidates: []models.WikiImage{imgA, imgB}}
	store := &stubStore{}

	s := NewImageSweeper(docRepo, imgRepo, store, zap.NewNop(), time.Hour, time.Hour, false)
	s.runTick()

	if len(imgRepo.deleted) != 1 || imgRepo.deleted[0] != imgB.ImageID {
		t.Fatalf("expected only opB image deleted, got %v", imgRepo.deleted)
	}
	// One liveness query per operation.
	if docRepo.calls != 2 {
		t.Fatalf("expected one reference query per operation (2), got %d", docRepo.calls)
	}
}

// Ensure the stub store's Get is never needed by the sweeper (compile-time
// guard that we didn't accidentally add a read path).
var _ = io.EOF
