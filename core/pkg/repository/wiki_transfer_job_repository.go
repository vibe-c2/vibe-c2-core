package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	v1bson "go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const wikiTransferJobCollection = "wiki_transfer_jobs"

// ErrNoQueuedJob is returned by Claim when nothing is waiting.
var ErrNoQueuedJob = errors.New("no queued transfer job")

// IWikiTransferJobRepository persists export/import jobs.
type IWikiTransferJobRepository interface {
	Create(ctx context.Context, job *models.WikiTransferJob) error
	FindByID(ctx context.Context, id uuid.UUID) (models.WikiTransferJob, error)
	// FindByOperationID lists an operation's jobs, newest first.
	FindByOperationID(ctx context.Context, opID uuid.UUID, limit int64) ([]models.WikiTransferJob, error)
	// Claim atomically moves the oldest queued job to running and returns
	// it. Safe across processes: the status flip is one findAndModify.
	Claim(ctx context.Context, now time.Time) (models.WikiTransferJob, error)
	// CountRunningForOperation says whether an operation already has a
	// job in flight.
	CountRunningForOperation(ctx context.Context, opID uuid.UUID) (int64, error)
	Update(ctx context.Context, id uuid.UUID, updates map[string]any) error
	// FindExpired returns terminal jobs whose expires_at has passed.
	FindExpired(ctx context.Context, now time.Time, limit int64) ([]models.WikiTransferJob, error)
	// FindStale returns jobs still marked running whose started_at is older
	// than cutoff — a worker died mid-run.
	FindStale(ctx context.Context, cutoff time.Time, limit int64) ([]models.WikiTransferJob, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

type wikiTransferJobRepository struct {
	coll database.Collection
}

// NewWikiTransferJobRepository builds the repository and its indexes.
func NewWikiTransferJobRepository(db database.Database) IWikiTransferJobRepository {
	coll := db.Collection(wikiTransferJobCollection)
	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"job_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"operation_id", "-createAt"}},
		{Key: []string{"status", "createAt"}},
		{Key: []string{"expires_at"}},
	})
	return &wikiTransferJobRepository{coll: coll}
}

func (r *wikiTransferJobRepository) Create(ctx context.Context, job *models.WikiTransferJob) error {
	_, err := r.coll.InsertOne(ctx, job)
	return err
}

func (r *wikiTransferJobRepository) FindByID(ctx context.Context, id uuid.UUID) (models.WikiTransferJob, error) {
	var job models.WikiTransferJob
	err := r.coll.FindOne(ctx, bson.M{"job_id": id}).One(&job)
	return job, err
}

func (r *wikiTransferJobRepository) FindByOperationID(ctx context.Context, opID uuid.UUID, limit int64) ([]models.WikiTransferJob, error) {
	var jobs []models.WikiTransferJob
	err := r.coll.Find(ctx, bson.M{"operation_id": opID}).Sort("-createAt").Limit(limit).All(&jobs)
	return jobs, err
}

func (r *wikiTransferJobRepository) Claim(ctx context.Context, now time.Time) (models.WikiTransferJob, error) {
	var job models.WikiTransferJob
	raw, err := r.coll.RawCollection()
	if err != nil {
		return job, fmt.Errorf("raw collection: %w", err)
	}
	res := raw.FindOneAndUpdate(ctx,
		v1bson.M{"status": models.WikiTransferQueued},
		v1bson.M{"$set": v1bson.M{
			"status":     models.WikiTransferRunning,
			"started_at": now,
			"updateAt":   now,
		}},
		options.FindOneAndUpdate().
			SetSort(v1bson.D{{Key: "createAt", Value: 1}}).
			SetReturnDocument(options.After),
	)
	if err := res.Decode(&job); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return job, ErrNoQueuedJob
		}
		return job, err
	}
	return job, nil
}

func (r *wikiTransferJobRepository) CountRunningForOperation(ctx context.Context, opID uuid.UUID) (int64, error) {
	return r.coll.Count(ctx, bson.M{
		"operation_id": opID,
		"status":       bson.M{"$in": []models.WikiTransferStatus{models.WikiTransferQueued, models.WikiTransferRunning}},
	})
}

func (r *wikiTransferJobRepository) Update(ctx context.Context, id uuid.UUID, updates map[string]any) error {
	updates["updateAt"] = time.Now().UTC()
	return r.coll.UpdateOne(ctx, bson.M{"job_id": id}, bson.M{"$set": updates})
}

func (r *wikiTransferJobRepository) FindExpired(ctx context.Context, now time.Time, limit int64) ([]models.WikiTransferJob, error) {
	var jobs []models.WikiTransferJob
	err := r.coll.Find(ctx, bson.M{
		"expires_at": bson.M{"$lt": now},
		"status":     bson.M{"$in": []models.WikiTransferStatus{models.WikiTransferDone, models.WikiTransferFailed}},
	}).Limit(limit).All(&jobs)
	return jobs, err
}

func (r *wikiTransferJobRepository) FindStale(ctx context.Context, cutoff time.Time, limit int64) ([]models.WikiTransferJob, error) {
	var jobs []models.WikiTransferJob
	err := r.coll.Find(ctx, bson.M{
		"status":     models.WikiTransferRunning,
		"started_at": bson.M{"$lt": cutoff},
	}).Limit(limit).All(&jobs)
	return jobs, err
}

func (r *wikiTransferJobRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.coll.Remove(ctx, bson.M{"job_id": id})
}
