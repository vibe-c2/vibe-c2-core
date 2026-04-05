package wiki

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// BackupScheduler runs periodic auto-backups for wiki documents that have
// changed since their last backup. Follows the same Start/Stop pattern as
// session.Cleaner.
type BackupScheduler struct {
	docRepo    repository.IWikiDocumentRepository
	backupRepo repository.IWikiDocumentBackupRepository
	logger     *zap.Logger
	interval   time.Duration
	batchSize  int64
	ctx        context.Context
	cancel     context.CancelFunc
}

// NewBackupScheduler creates a new auto-backup scheduler.
func NewBackupScheduler(
	docRepo repository.IWikiDocumentRepository,
	backupRepo repository.IWikiDocumentBackupRepository,
	logger *zap.Logger,
	interval time.Duration,
) *BackupScheduler {
	ctx, cancel := context.WithCancel(context.Background())
	return &BackupScheduler{
		docRepo:    docRepo,
		backupRepo: backupRepo,
		logger:     logger,
		interval:   interval,
		batchSize:  100,
		ctx:        ctx,
		cancel:     cancel,
	}
}

// Start begins the periodic auto-backup in a background goroutine.
func (s *BackupScheduler) Start() {
	go func() {
		ticker := time.NewTicker(s.interval)
		defer ticker.Stop()

		s.logger.Info("Wiki auto-backup scheduler started", zap.Duration("interval", s.interval))

		for {
			select {
			case <-ticker.C:
				s.runBackupTick()
			case <-s.ctx.Done():
				s.logger.Info("Wiki auto-backup scheduler stopped")
				return
			}
		}
	}()
}

// Stop signals the scheduler to exit.
func (s *BackupScheduler) Stop() {
	s.cancel()
}

func (s *BackupScheduler) runBackupTick() {
	// Per-tick timeout to prevent overlap with the next tick
	tickCtx, cancel := context.WithTimeout(s.ctx, s.interval/2)
	defer cancel()

	docs, err := s.docRepo.FindChangedSinceLastBackup(tickCtx, s.batchSize)
	if err != nil {
		s.logger.Error("Auto-backup: failed to find changed documents", zap.Error(err))
		return
	}

	if len(docs) == 0 {
		return
	}

	backed := 0
	for _, doc := range docs {
		if err := s.backupDocument(tickCtx, &doc); err != nil {
			s.logger.Error("Auto-backup: failed to backup document",
				zap.String("document_id", doc.DocumentID.String()), zap.Error(err))
			continue
		}
		backed++
	}

	if backed > 0 {
		s.logger.Info("Auto-backup completed", zap.Int("count", backed))
	}
}

func (s *BackupScheduler) backupDocument(ctx context.Context, doc *models.WikiDocument) error {
	backup := &models.WikiDocumentBackup{
		BackupID:     uuid.New(),
		DocumentID:   doc.DocumentID,
		OperationID:  doc.OperationID,
		Title:        doc.Title,
		Content:      doc.Content,
		ContentState: doc.ContentState,
		Trigger:      models.WikiDocumentBackupTriggerAuto,
		CreatedByID:  uuid.Nil, // system-created
	}

	if err := s.backupRepo.Create(ctx, backup); err != nil {
		return err
	}

	// Update lastBackupAt
	now := time.Now().UTC()
	return s.docRepo.Update(ctx, doc, map[string]interface{}{"last_backup_at": now})
}
