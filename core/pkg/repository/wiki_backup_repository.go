package repository

import (
	"context"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const wikiDocumentBackupCollection = "wiki_document_backups"

// IWikiDocumentBackupRepository defines the interface for WikiDocumentBackup database operations.
type IWikiDocumentBackupRepository interface {
	Create(ctx context.Context, backup *models.WikiDocumentBackup) error
	FindByID(ctx context.Context, id uuid.UUID) (models.WikiDocumentBackup, error)
	FindByDocumentIDWithCursor(ctx context.Context, docID uuid.UUID, trigger *models.WikiDocumentBackupTrigger, cursor *pagination.Cursor, limit int64, forward bool) ([]models.WikiDocumentBackup, error)
	CountByDocumentID(ctx context.Context, docID uuid.UUID, trigger *models.WikiDocumentBackupTrigger) (int64, error)
	FindLatestByDocumentID(ctx context.Context, docID uuid.UUID) (*models.WikiDocumentBackup, error)
	Delete(ctx context.Context, backup *models.WikiDocumentBackup) error
	DeleteByDocumentID(ctx context.Context, docID uuid.UUID) error
	DeleteByOperationID(ctx context.Context, opID uuid.UUID) error
}

type wikiDocumentBackupRepository struct {
	coll database.Collection
}

func NewWikiDocumentBackupRepository(db database.Database) IWikiDocumentBackupRepository {
	coll := db.Collection(wikiDocumentBackupCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"backup_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"document_id", "-createAt"}},
		{Key: []string{"operation_id"}},
	})

	return &wikiDocumentBackupRepository{coll: coll}
}

func (r *wikiDocumentBackupRepository) Create(ctx context.Context, backup *models.WikiDocumentBackup) error {
	_, err := r.coll.InsertOne(ctx, backup)
	return err
}

func (r *wikiDocumentBackupRepository) FindByID(ctx context.Context, id uuid.UUID) (models.WikiDocumentBackup, error) {
	var backup models.WikiDocumentBackup
	err := r.coll.FindOne(ctx, bson.M{"backup_id": id}).One(&backup)
	return backup, err
}

func (r *wikiDocumentBackupRepository) FindByDocumentIDWithCursor(ctx context.Context, docID uuid.UUID, trigger *models.WikiDocumentBackupTrigger, cursor *pagination.Cursor, limit int64, forward bool) ([]models.WikiDocumentBackup, error) {
	filter := bson.M{"document_id": docID}
	if trigger != nil {
		filter["trigger"] = *trigger
	}

	if cursorFilter := pagination.BuildCursorFilter(cursor, forward); len(cursorFilter) > 0 {
		for k, v := range cursorFilter {
			filter[k] = v
		}
	}

	var backups []models.WikiDocumentBackup
	err := r.coll.Find(ctx, filter).
		Sort(pagination.SortFields(forward)...).
		Limit(limit).
		All(&backups)

	if !forward && len(backups) > 0 {
		for i, j := 0, len(backups)-1; i < j; i, j = i+1, j-1 {
			backups[i], backups[j] = backups[j], backups[i]
		}
	}

	return backups, err
}

func (r *wikiDocumentBackupRepository) CountByDocumentID(ctx context.Context, docID uuid.UUID, trigger *models.WikiDocumentBackupTrigger) (int64, error) {
	filter := bson.M{"document_id": docID}
	if trigger != nil {
		filter["trigger"] = *trigger
	}
	return r.coll.Count(ctx, filter)
}

func (r *wikiDocumentBackupRepository) FindLatestByDocumentID(ctx context.Context, docID uuid.UUID) (*models.WikiDocumentBackup, error) {
	var backup models.WikiDocumentBackup
	err := r.coll.FindOne(ctx, bson.M{"document_id": docID}).Sort("-createAt").One(&backup)
	if err != nil {
		return nil, err
	}
	return &backup, nil
}

func (r *wikiDocumentBackupRepository) Delete(ctx context.Context, backup *models.WikiDocumentBackup) error {
	return r.coll.Remove(ctx, bson.M{"backup_id": backup.BackupID})
}

func (r *wikiDocumentBackupRepository) DeleteByDocumentID(ctx context.Context, docID uuid.UUID) error {
	_, err := r.coll.RemoveAll(ctx, bson.M{"document_id": docID})
	return err
}

func (r *wikiDocumentBackupRepository) DeleteByOperationID(ctx context.Context, opID uuid.UUID) error {
	_, err := r.coll.RemoveAll(ctx, bson.M{"operation_id": opID})
	return err
}
