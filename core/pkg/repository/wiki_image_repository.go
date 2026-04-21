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

const wikiImageCollection = "wiki_images"

// IWikiImageRepository defines data access for wiki image metadata.
type IWikiImageRepository interface {
	Create(ctx context.Context, img *models.WikiImage) error
	FindByID(ctx context.Context, id uuid.UUID) (models.WikiImage, error)
	FindByDocumentID(ctx context.Context, docID uuid.UUID) ([]models.WikiImage, error)
	// FindCandidatesOlderThan returns active (non-deleted) images whose creation
	// time is before the given cutoff. The sweeper cross-references these
	// against document content to decide which are orphaned.
	FindCandidatesOlderThan(ctx context.Context, cutoff time.Time, limit int64) ([]models.WikiImage, error)
	HardDelete(ctx context.Context, id uuid.UUID) error
}

type wikiImageRepository struct {
	coll database.Collection
}

func NewWikiImageRepository(db database.Database) IWikiImageRepository {
	coll := db.Collection(wikiImageCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"image_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"document_id"}},
		{Key: []string{"operation_id"}},
		{Key: []string{"createAt"}},
	})

	return &wikiImageRepository{coll: coll}
}

func (r *wikiImageRepository) Create(ctx context.Context, img *models.WikiImage) error {
	_, err := r.coll.InsertOne(ctx, img)
	return err
}

func (r *wikiImageRepository) FindByID(ctx context.Context, id uuid.UUID) (models.WikiImage, error) {
	var img models.WikiImage
	err := r.coll.FindOne(ctx, bson.M{"image_id": id}).One(&img)
	return img, err
}

func (r *wikiImageRepository) FindByDocumentID(ctx context.Context, docID uuid.UUID) ([]models.WikiImage, error) {
	var imgs []models.WikiImage
	err := r.coll.Find(ctx, bson.M{"document_id": docID}).All(&imgs)
	return imgs, err
}

func (r *wikiImageRepository) FindCandidatesOlderThan(ctx context.Context, cutoff time.Time, limit int64) ([]models.WikiImage, error) {
	var imgs []models.WikiImage
	err := r.coll.Find(ctx, bson.M{
		"createAt": bson.M{"$lt": cutoff},
	}).Limit(limit).All(&imgs)
	return imgs, err
}

func (r *wikiImageRepository) HardDelete(ctx context.Context, id uuid.UUID) error {
	return r.coll.Remove(ctx, bson.M{"image_id": id})
}
