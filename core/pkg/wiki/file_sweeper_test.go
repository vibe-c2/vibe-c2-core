package wiki

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// File-sweeper stubs mirror the image-sweeper stubs in image_sweeper_test.go
// (which defines the shared stubStore). Only the methods the sweeper calls are
// implemented; the embedded interface satisfies the rest.

type stubFileDocRepo struct {
	repository.IWikiDocumentRepository
	referenced map[uuid.UUID]map[uuid.UUID]struct{}
	err        error
	calls      int
}

func (s *stubFileDocRepo) FilterReferencedFileIDs(_ context.Context, opID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]struct{}, error) {
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

type stubFileRepo struct {
	repository.IWikiFileRepository
	candidates []models.WikiFile
	deleted    []uuid.UUID
}

func (s *stubFileRepo) FindCandidatesOlderThan(_ context.Context, _ time.Time, _ int64) ([]models.WikiFile, error) {
	return s.candidates, nil
}

func (s *stubFileRepo) HardDelete(_ context.Context, id uuid.UUID) error {
	s.deleted = append(s.deleted, id)
	return nil
}

func newFileCandidate(opID uuid.UUID) models.WikiFile {
	id := uuid.New()
	return models.WikiFile{
		FileID:      id,
		OperationID: opID,
		ObjectKey:   "file/" + id.String(),
	}
}

func TestFileSweeper_DeletesOnlyUnreferenced(t *testing.T) {
	opID := uuid.New()
	live := newFileCandidate(opID)
	dead := newFileCandidate(opID)

	docRepo := &stubFileDocRepo{
		referenced: map[uuid.UUID]map[uuid.UUID]struct{}{
			opID: {live.FileID: {}},
		},
	}
	fileRepo := &stubFileRepo{candidates: []models.WikiFile{live, dead}}
	store := &stubStore{}

	s := NewFileSweeper(docRepo, fileRepo, store, zap.NewNop(), time.Hour, time.Hour, false)
	s.runTick()

	if len(fileRepo.deleted) != 1 || fileRepo.deleted[0] != dead.FileID {
		t.Fatalf("expected only the unreferenced file deleted, got %v", fileRepo.deleted)
	}
	if len(store.deleted) != 1 || store.deleted[0] != dead.ObjectKey {
		t.Fatalf("expected only the unreferenced blob deleted, got %v", store.deleted)
	}
}

func TestFileSweeper_DryRunDeletesNothing(t *testing.T) {
	opID := uuid.New()
	dead := newFileCandidate(opID)

	docRepo := &stubFileDocRepo{referenced: map[uuid.UUID]map[uuid.UUID]struct{}{}}
	fileRepo := &stubFileRepo{candidates: []models.WikiFile{dead}}
	store := &stubStore{}

	s := NewFileSweeper(docRepo, fileRepo, store, zap.NewNop(), time.Hour, time.Hour, true)
	s.runTick()

	if len(fileRepo.deleted) != 0 || len(store.deleted) != 0 {
		t.Fatalf("dry-run must not delete anything; metadata=%v blobs=%v", fileRepo.deleted, store.deleted)
	}
}

func TestFileSweeper_FailSafeOnQueryError(t *testing.T) {
	opID := uuid.New()
	dead := newFileCandidate(opID)

	docRepo := &stubFileDocRepo{err: errors.New("mongo down")}
	fileRepo := &stubFileRepo{candidates: []models.WikiFile{dead}}
	store := &stubStore{}

	s := NewFileSweeper(docRepo, fileRepo, store, zap.NewNop(), time.Hour, time.Hour, false)
	s.runTick()

	if len(fileRepo.deleted) != 0 || len(store.deleted) != 0 {
		t.Fatalf("a reference-lookup error must skip deletion; metadata=%v blobs=%v", fileRepo.deleted, store.deleted)
	}
}
