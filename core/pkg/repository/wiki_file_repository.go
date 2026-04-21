package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const wikiFileCollection = "wiki_files"

// IWikiFileRepository defines data access for wiki file attachment metadata.
type IWikiFileRepository interface {
	Create(ctx context.Context, file *models.WikiFile) error
	FindByID(ctx context.Context, id uuid.UUID) (models.WikiFile, error)
	FindByDocumentID(ctx context.Context, docID uuid.UUID) ([]models.WikiFile, error)
	// FindCandidatesOlderThan returns active (non-deleted) files whose creation
	// time is before the given cutoff. The sweeper cross-references these
	// against document content to decide which are orphaned.
	FindCandidatesOlderThan(ctx context.Context, cutoff time.Time, limit int64) ([]models.WikiFile, error)
	HardDelete(ctx context.Context, id uuid.UUID) error
	HardDeleteByDocumentID(ctx context.Context, docID uuid.UUID) error
	HardDeleteByOperationID(ctx context.Context, opID uuid.UUID) error
}

type wikiFileRepository struct {
	coll database.Collection
}

func NewWikiFileRepository(db database.Database) IWikiFileRepository {
	coll := db.Collection(wikiFileCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"file_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"document_id"}},
		{Key: []string{"operation_id"}},
		{Key: []string{"createAt"}},
	})

	return &wikiFileRepository{coll: coll}
}

func (r *wikiFileRepository) Create(ctx context.Context, file *models.WikiFile) error {
	_, err := r.coll.InsertOne(ctx, file)
	return err
}

func (r *wikiFileRepository) FindByID(ctx context.Context, id uuid.UUID) (models.WikiFile, error) {
	var file models.WikiFile
	err := r.coll.FindOne(ctx, bson.M{"file_id": id}).One(&file)
	return file, err
}

func (r *wikiFileRepository) FindByDocumentID(ctx context.Context, docID uuid.UUID) ([]models.WikiFile, error) {
	var files []models.WikiFile
	err := r.coll.Find(ctx, bson.M{"document_id": docID}).All(&files)
	return files, err
}

func (r *wikiFileRepository) FindCandidatesOlderThan(ctx context.Context, cutoff time.Time, limit int64) ([]models.WikiFile, error) {
	var files []models.WikiFile
	err := r.coll.Find(ctx, bson.M{
		"createAt": bson.M{"$lt": cutoff},
	}).Limit(limit).All(&files)
	return files, err
}

func (r *wikiFileRepository) HardDelete(ctx context.Context, id uuid.UUID) error {
	return r.coll.Remove(ctx, bson.M{"file_id": id})
}

func (r *wikiFileRepository) HardDeleteByDocumentID(ctx context.Context, docID uuid.UUID) error {
	_, err := r.coll.RemoveAll(ctx, bson.M{"document_id": docID})
	return err
}

func (r *wikiFileRepository) HardDeleteByOperationID(ctx context.Context, opID uuid.UUID) error {
	_, err := r.coll.RemoveAll(ctx, bson.M{"operation_id": opID})
	return err
}
