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

// imageRefPattern matches image URLs the frontend writes into wiki content.
// Docs persist as Markdown on the server side (see wiki.graphql's note on the
// content field), so a textual scan is sufficient to find references.
var imageRefPattern = regexp.MustCompile(`/api/v1/wiki/images/([0-9a-fA-F-]{36})`)

// ImageSweeper runs a periodic GC pass over wiki_images, deleting entries
// whose bytes are no longer referenced by any active or trashed document.
// Only images older than the grace period are considered, which leaves a
// window for uploads-in-flight (optimistic insert → CRDT sync → Mongo
// snapshot) to land without getting swept.
type ImageSweeper struct {
	docRepo   repository.IWikiDocumentRepository
	imageRepo repository.IWikiImageRepository
	store     blob.ObjectStore
	logger    *zap.Logger
	interval  time.Duration
	grace     time.Duration
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
) *ImageSweeper {
	ctx, cancel := context.WithCancel(context.Background())
	return &ImageSweeper{
		docRepo:   docRepo,
		imageRepo: imageRepo,
		store:     store,
		logger:    logger,
		interval:  interval,
		grace:     grace,
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

	// Group candidates by document so we only load each document once.
	byDoc := make(map[uuid.UUID][]models.WikiImage, len(candidates))
	for _, img := range candidates {
		byDoc[img.DocumentID] = append(byDoc[img.DocumentID], img)
	}

	deleted := 0
	for docID, imgs := range byDoc {
		doc, err := s.docRepo.FindByID(tickCtx, docID)
		if err != nil {
			// Owning document is gone — its images are orphans.
			for _, img := range imgs {
				if s.hardDelete(tickCtx, img) {
					deleted++
				}
			}
			continue
		}

		referenced := extractReferencedImageIDs(doc.Content)
		for _, img := range imgs {
			if _, ok := referenced[img.ImageID]; ok {
				continue
			}
			if s.hardDelete(tickCtx, img) {
				deleted++
			}
		}
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

// extractReferencedImageIDs returns the set of image UUIDs referenced by the
// given document content. Exposed so the sweeper logic can be unit-tested
// without spinning up Mongo.
func extractReferencedImageIDs(content string) map[uuid.UUID]struct{} {
	matches := imageRefPattern.FindAllStringSubmatch(content, -1)
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
