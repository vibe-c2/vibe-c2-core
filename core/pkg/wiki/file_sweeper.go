package wiki

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// FileSweeper runs a periodic GC pass over wiki_files, deleting entries whose
// bytes are no longer referenced by any active or trashed document. Mirrors
// ImageSweeper's strategy — see image_sweeper.go for the rationale around the
// reference-index liveness check, the grace window, the dry-run gate, and the
// blob-before-metadata delete ordering.
type FileSweeper struct {
	docRepo   repository.IWikiDocumentRepository
	fileRepo  repository.IWikiFileRepository
	store     blob.ObjectStore
	logger    *zap.Logger
	interval  time.Duration
	grace     time.Duration
	dryRun    bool
	batchSize int64
	ctx       context.Context
	cancel    context.CancelFunc
}

func NewFileSweeper(
	docRepo repository.IWikiDocumentRepository,
	fileRepo repository.IWikiFileRepository,
	store blob.ObjectStore,
	logger *zap.Logger,
	interval time.Duration,
	grace time.Duration,
	dryRun bool,
) *FileSweeper {
	ctx, cancel := context.WithCancel(context.Background())
	return &FileSweeper{
		docRepo:   docRepo,
		fileRepo:  fileRepo,
		store:     store,
		logger:    logger,
		interval:  interval,
		grace:     grace,
		dryRun:    dryRun,
		batchSize: 200,
		ctx:       ctx,
		cancel:    cancel,
	}
}

func (s *FileSweeper) Start() {
	go func() {
		ticker := time.NewTicker(s.interval)
		defer ticker.Stop()

		s.logger.Info("Wiki file sweeper started",
			zap.Duration("interval", s.interval),
			zap.Duration("grace", s.grace),
			zap.Bool("dry_run", s.dryRun),
		)

		for {
			select {
			case <-ticker.C:
				s.runTick()
			case <-s.ctx.Done():
				s.logger.Info("Wiki file sweeper stopped")
				return
			}
		}
	}()
}

func (s *FileSweeper) Stop() {
	s.cancel()
}

func (s *FileSweeper) runTick() {
	tickCtx, cancel := context.WithTimeout(s.ctx, s.interval/2)
	defer cancel()

	cutoff := time.Now().UTC().Add(-s.grace)
	candidates, err := s.fileRepo.FindCandidatesOlderThan(tickCtx, cutoff, s.batchSize)
	if err != nil {
		s.logger.Error("File sweeper: failed to list candidates", zap.Error(err))
		return
	}
	if len(candidates) == 0 {
		return
	}

	// Group candidates by operation: liveness is checked against the
	// operation's documents, and a reference only counts within its own
	// operation (attachment blobs are operation-scoped).
	byOp := make(map[uuid.UUID][]models.WikiFile, len(candidates))
	for _, f := range candidates {
		byOp[f.OperationID] = append(byOp[f.OperationID], f)
	}

	deleted := 0
	wouldDelete := 0
	for opID, files := range byOp {
		ids := make([]uuid.UUID, len(files))
		for i, f := range files {
			ids[i] = f.FileID
		}

		referenced, err := s.docRepo.FilterReferencedFileIDs(tickCtx, opID, ids)
		if err != nil {
			// Fail safe: never delete on a query error — skip and retry.
			s.logger.Warn("File sweeper: reference lookup failed, skipping operation",
				zap.String("operation_id", opID.String()),
				zap.Error(err))
			continue
		}

		for _, f := range files {
			if _, ok := referenced[f.FileID]; ok {
				continue
			}
			if s.dryRun {
				wouldDelete++
				s.logger.Info("File sweeper (dry-run): would delete unreferenced file",
					zap.String("file_id", f.FileID.String()),
					zap.String("operation_id", opID.String()),
					zap.String("key", f.ObjectKey))
				continue
			}
			if s.hardDelete(tickCtx, f) {
				deleted++
			}
		}
	}

	if s.dryRun {
		if wouldDelete > 0 {
			s.logger.Info("Wiki file sweeper (dry-run) completed", zap.Int("would_delete", wouldDelete))
		}
		return
	}
	if deleted > 0 {
		s.logger.Info("Wiki file sweeper completed", zap.Int("deleted", deleted))
	}
}

// hardDelete removes the blob first, then the metadata row. If blob removal
// fails we keep the metadata so the next sweeper pass can retry — better than
// a dangling object in the bucket.
func (s *FileSweeper) hardDelete(ctx context.Context, f models.WikiFile) bool {
	if err := s.store.Delete(ctx, f.ObjectKey); err != nil {
		s.logger.Warn("File sweeper: failed to delete object",
			zap.String("file_id", f.FileID.String()),
			zap.String("key", f.ObjectKey),
			zap.Error(err))
		return false
	}
	if err := s.fileRepo.HardDelete(ctx, f.FileID); err != nil {
		s.logger.Warn("File sweeper: failed to delete metadata",
			zap.String("file_id", f.FileID.String()),
			zap.Error(err))
		return false
	}
	return true
}
