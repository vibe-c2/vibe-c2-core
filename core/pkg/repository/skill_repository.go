package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	v1bson "go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	skillCollection        = "skills"
	skillVersionCollection = "skill_versions"
)

// ISkillRepository is data access for community skills and their version
// history.
//
// The two collections live behind one interface because they are one
// aggregate: a skill without its versions is a claimed name with nothing to
// download, and a version row without its skill is unreachable. Nothing
// outside a publish ever touches them separately.
type ISkillRepository interface {
	// Create claims a name. The unique index on name is what settles a race
	// between two people publishing the same name at the same moment; the
	// loser gets a duplicate-key error.
	Create(ctx context.Context, skill *models.Skill) error
	FindByName(ctx context.Context, name string) (models.Skill, error)
	FindByID(ctx context.Context, id uuid.UUID) (models.Skill, error)
	// List returns every skill, newest upload first.
	List(ctx context.Context) ([]models.Skill, error)

	// ReserveNextVersion atomically increments the counter and returns the
	// number the caller now owns. Two concurrent publishes of the same skill
	// get different numbers, so neither can overwrite the other's bundle.
	ReserveNextVersion(ctx context.Context, skillID uuid.UUID) (int, error)
	// ReleaseVersion gives a reserved number back when the upload that
	// reserved it failed before the version row existed. Guarded on the
	// counter still being that number, so it cannot undo somebody else's
	// later publish; a no-op otherwise.
	ReleaseVersion(ctx context.Context, skillID uuid.UUID, version int) error
	// DeleteIfEmpty removes a skill that has no versions, undoing a claim
	// whose first upload never completed. Guarded on the counter being back
	// at zero so it can never delete a name somebody has published under —
	// including a publish that landed between the failure and this call.
	DeleteIfEmpty(ctx context.Context, skillID uuid.UUID) error

	// FinishPublish records the metadata that mirrors the new current version
	// onto the skill row, and refreshes what the publisher supplied.
	FinishPublish(ctx context.Context, skillID uuid.UUID, in FinishPublishInput) error
	// Delete removes a skill and every version row it owns. The bundles are
	// the caller's to clean up first: this is the point of no return.
	Delete(ctx context.Context, skillID uuid.UUID) error
	// Transfer moves ownership of a name to another operator.
	Transfer(ctx context.Context, skillID uuid.UUID, ownerID uuid.UUID, ownerUsername string) error

	CreateVersion(ctx context.Context, version *models.SkillVersion) error
	FindVersion(ctx context.Context, skillID uuid.UUID, version int) (models.SkillVersion, error)
	ListVersions(ctx context.Context, skillID uuid.UUID) ([]models.SkillVersion, error)
}

// FinishPublishInput is the tail of a publish: what the skill row should say
// now that a new bundle is stored.
type FinishPublishInput struct {
	Version       int
	SizeBytes     int64
	UploadedAt    time.Time
	Description   string
	OwnerUsername string
}

type skillRepository struct {
	coll     database.Collection
	versions database.Collection
}

func NewSkillRepository(db database.Database) ISkillRepository {
	coll := db.Collection(skillCollection)
	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"skill_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"name"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"owner_user_id"}},
		{Key: []string{"-uploaded_at"}},
	})

	versions := db.Collection(skillVersionCollection)
	versions.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"skill_version_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"skill_id", "version"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
	})

	return &skillRepository{coll: coll, versions: versions}
}

func (r *skillRepository) Create(ctx context.Context, skill *models.Skill) error {
	_, err := r.coll.InsertOne(ctx, skill)
	return err
}

func (r *skillRepository) FindByName(ctx context.Context, name string) (models.Skill, error) {
	var skill models.Skill
	err := r.coll.FindOne(ctx, bson.M{"name": name}).One(&skill)
	return skill, err
}

func (r *skillRepository) FindByID(ctx context.Context, id uuid.UUID) (models.Skill, error) {
	var skill models.Skill
	err := r.coll.FindOne(ctx, bson.M{"skill_id": id}).One(&skill)
	return skill, err
}

func (r *skillRepository) List(ctx context.Context) ([]models.Skill, error) {
	// A row with no versions is a claim whose upload never completed. It is
	// not a skill yet — nothing can be downloaded from it — so it stays out
	// of every listing rather than showing as an empty shell.
	var out []models.Skill
	err := r.coll.Find(ctx, bson.M{"current_version": bson.M{"$gte": 1}}).Sort("-uploaded_at").All(&out)
	return out, err
}

func (r *skillRepository) ReserveNextVersion(ctx context.Context, skillID uuid.UUID) (int, error) {
	raw, err := r.coll.RawCollection()
	if err != nil {
		return 0, err
	}
	var updated models.Skill
	err = raw.FindOneAndUpdate(ctx,
		v1bson.M{"skill_id": skillID},
		v1bson.M{"$inc": v1bson.M{"current_version": 1}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&updated)
	if err != nil {
		return 0, err
	}
	return updated.CurrentVersion, nil
}

func (r *skillRepository) ReleaseVersion(ctx context.Context, skillID uuid.UUID, version int) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"skill_id": skillID, "current_version": version},
		bson.M{"$inc": bson.M{"current_version": -1}},
	)
}

func (r *skillRepository) DeleteIfEmpty(ctx context.Context, skillID uuid.UUID) error {
	return r.coll.Remove(ctx, bson.M{
		"skill_id":        skillID,
		"current_version": bson.M{"$lte": 0},
	})
}

func (r *skillRepository) FinishPublish(ctx context.Context, skillID uuid.UUID, in FinishPublishInput) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"skill_id": skillID},
		bson.M{"$set": bson.M{
			"size_bytes":     in.SizeBytes,
			"uploaded_at":    in.UploadedAt,
			"description":    in.Description,
			"owner_username": in.OwnerUsername,
			"updateAt":       time.Now().UTC(),
		}},
	)
}

func (r *skillRepository) Delete(ctx context.Context, skillID uuid.UUID) error {
	// Versions first: a skill row without its versions is recoverable by
	// deleting it again, whereas orphaned version rows are invisible.
	if _, err := r.versions.RemoveAll(ctx, bson.M{"skill_id": skillID}); err != nil {
		return err
	}
	return r.coll.Remove(ctx, bson.M{"skill_id": skillID})
}

func (r *skillRepository) Transfer(ctx context.Context, skillID uuid.UUID, ownerID uuid.UUID, ownerUsername string) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"skill_id": skillID},
		bson.M{"$set": bson.M{"owner_user_id": ownerID, "owner_username": ownerUsername}},
	)
}

func (r *skillRepository) CreateVersion(ctx context.Context, version *models.SkillVersion) error {
	_, err := r.versions.InsertOne(ctx, version)
	return err
}

func (r *skillRepository) FindVersion(ctx context.Context, skillID uuid.UUID, version int) (models.SkillVersion, error) {
	var out models.SkillVersion
	err := r.versions.FindOne(ctx, bson.M{"skill_id": skillID, "version": version}).One(&out)
	return out, err
}

func (r *skillRepository) ListVersions(ctx context.Context, skillID uuid.UUID) ([]models.SkillVersion, error) {
	var out []models.SkillVersion
	err := r.versions.Find(ctx, bson.M{"skill_id": skillID}).Sort("-version").All(&out)
	return out, err
}
