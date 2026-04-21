package wiki

import (
	"context"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// fileRefPattern matches file attachment URLs the frontend writes into wiki
// content. The node's renderHTML emits the /api/v1/wiki/files/<uuid> URL in a
// data attribute or href; a textual scan covers both.
var fileRefPattern = regexp.MustCompile(`/api/v1/wiki/files/([0-9a-fA-F-]{36})`)

// FileSweeper runs a periodic GC pass over wiki_files, deleting entries whose
// bytes are no longer referenced by any active or trashed document. Mirrors
// ImageSweeper's strategy — see image_sweeper.go for the rationale around the
// grace window and blob-before-metadata delete ordering.
type FileSweeper struct {
	docRepo   repository.IWikiDocumentRepository
	fileRepo  repository.IWikiFileRepository
	store     blob.ObjectStore
	logger    *zap.Logger
	interval  time.Duration
	grace     time.Duration
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
) *FileSweeper {
	ctx, cancel := context.WithCancel(context.Background())
	return &FileSweeper{
		docRepo:   docRepo,
		fileRepo:  fileRepo,
		store:     store,
		logger:    logger,
		interval:  interval,
		grace:     grace,
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

	byDoc := make(map[uuid.UUID][]models.WikiFile, len(candidates))
	for _, f := range candidates {
		byDoc[f.DocumentID] = append(byDoc[f.DocumentID], f)
	}

	deleted := 0
	for docID, files := range byDoc {
		doc, err := s.docRepo.FindByID(tickCtx, docID)
		if err != nil {
			// Owning document is gone — its files are orphans.
			for _, f := range files {
				if s.hardDelete(tickCtx, f) {
					deleted++
				}
			}
			continue
		}

		referenced := extractReferencedFileIDs(doc.Content)
		for _, f := range files {
			if _, ok := referenced[f.FileID]; ok {
				continue
			}
			if s.hardDelete(tickCtx, f) {
				deleted++
			}
		}
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

// extractReferencedFileIDs returns the set of file UUIDs referenced by the
// given document content. Exposed so the sweeper logic can be unit-tested
// without Mongo.
func extractReferencedFileIDs(content string) map[uuid.UUID]struct{} {
	matches := fileRefPattern.FindAllStringSubmatch(content, -1)
	out := make(map[uuid.UUID]struct{}, len(matches))
	for _, m := range matches {
		if len(m) != 2 {
			continue
		}
		id, err := uuid.Parse(strings.ToLower(m[1]))
		if err != nil {
			continue
		}
		out[id] = struct{}{}
	}
	return out
}
