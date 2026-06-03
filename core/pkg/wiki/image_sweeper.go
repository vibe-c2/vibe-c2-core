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

// ImageSweeper runs a periodic GC pass over wiki_images, deleting entries
// whose bytes are no longer referenced by any active or trashed document.
//
// Liveness is decided by the document's image_references array — the
// authoritative index the Hocuspocus sidecar rewrites on every content
// persist. (The older approach of regex-scanning the document's `content`
// field was unsound: `content` is a plain-text snapshot that never carried
// attachment URLs, so every aged image looked unreferenced and got deleted
// while still embedded in the live document.)
//
// Only images older than the grace period are considered, which leaves a
// window for uploads-in-flight (optimistic insert → CRDT sync → Mongo
// snapshot) to land without getting swept.
//
// When dryRun is set the sweeper logs what it WOULD delete but touches
// nothing — the safety gate used to validate the reference index in
// production before arming real deletion.
type ImageSweeper struct {
	docRepo   repository.IWikiDocumentRepository
	imageRepo repository.IWikiImageRepository
	store     blob.ObjectStore
	logger    *zap.Logger
	interval  time.Duration
	grace     time.Duration
	dryRun    bool
	batchSize int64
	ctx       context.Context
	cancel    context.CancelFunc
}

func NewImageSweeper(
	docRepo repository.IWikiDocumentRepository,
	imageRepo repository.IWikiImageRepository,
	store blob.ObjectStore,
	logger *zap.Logger,
	interval time.Duration,
	grace time.Duration,
	dryRun bool,
) *ImageSweeper {
	ctx, cancel := context.WithCancel(context.Background())
	return &ImageSweeper{
		docRepo:   docRepo,
		imageRepo: imageRepo,
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

func (s *ImageSweeper) Start() {
	go func() {
		ticker := time.NewTicker(s.interval)
		defer ticker.Stop()

		s.logger.Info("Wiki image sweeper started",
			zap.Duration("interval", s.interval),
			zap.Duration("grace", s.grace),
			zap.Bool("dry_run", s.dryRun),
		)

		for {
			select {
			case <-ticker.C:
				s.runTick()
			case <-s.ctx.Done():
				s.logger.Info("Wiki image sweeper stopped")
				return
			}
		}
	}()
}

func (s *ImageSweeper) Stop() {
	s.cancel()
}

func (s *ImageSweeper) runTick() {
	// Keep the tick bounded so it cannot overlap with the next one.
	tickCtx, cancel := context.WithTimeout(s.ctx, s.interval/2)
	defer cancel()

	cutoff := time.Now().UTC().Add(-s.grace)
	candidates, err := s.imageRepo.FindCandidatesOlderThan(tickCtx, cutoff, s.batchSize)
	if err != nil {
		s.logger.Error("Image sweeper: failed to list candidates", zap.Error(err))
		return
	}
	if len(candidates) == 0 {
		return
	}

	// Group candidates by operation: liveness is checked against the
	// operation's documents, and a reference only counts within its own
	// operation (attachment blobs are operation-scoped).
	byOp := make(map[uuid.UUID][]models.WikiImage, len(candidates))
	for _, img := range candidates {
		byOp[img.OperationID] = append(byOp[img.OperationID], img)
	}

	deleted := 0
	wouldDelete := 0
	for opID, imgs := range byOp {
		ids := make([]uuid.UUID, len(imgs))
		for i, img := range imgs {
			ids[i] = img.ImageID
		}

		referenced, err := s.docRepo.FilterReferencedImageIDs(tickCtx, opID, ids)
		if err != nil {
			// Fail safe: on any query error we must NOT delete — skip this
			// operation and retry next tick. Deleting on uncertainty is the
			// exact failure mode that lost data before.
			s.logger.Warn("Image sweeper: reference lookup failed, skipping operation",
				zap.String("operation_id", opID.String()),
				zap.Error(err))
			continue
		}

		for _, img := range imgs {
			if _, ok := referenced[img.ImageID]; ok {
				continue
			}
			if s.dryRun {
				wouldDelete++
				s.logger.Info("Image sweeper (dry-run): would delete unreferenced image",
					zap.String("image_id", img.ImageID.String()),
					zap.String("operation_id", opID.String()),
					zap.String("key", img.ObjectKey))
				continue
			}
			if s.hardDelete(tickCtx, img) {
				deleted++
			}
		}
	}

	if s.dryRun {
		if wouldDelete > 0 {
			s.logger.Info("Wiki image sweeper (dry-run) completed", zap.Int("would_delete", wouldDelete))
		}
		return
	}
	if deleted > 0 {
		s.logger.Info("Wiki image sweeper completed", zap.Int("deleted", deleted))
	}
}

// hardDelete removes the blob first, then the metadata row. If blob removal
// fails we keep the metadata so the next sweeper pass can retry — better
// than a dangling object in the bucket.
func (s *ImageSweeper) hardDelete(ctx context.Context, img models.WikiImage) bool {
	if err := s.store.Delete(ctx, img.ObjectKey); err != nil {
		s.logger.Warn("Image sweeper: failed to delete object",
			zap.String("image_id", img.ImageID.String()),
			zap.String("key", img.ObjectKey),
			zap.Error(err))
		return false
	}
	if err := s.imageRepo.HardDelete(ctx, img.ImageID); err != nil {
		s.logger.Warn("Image sweeper: failed to delete metadata",
			zap.String("image_id", img.ImageID.String()),
			zap.Error(err))
		return false
	}
	return true
}
