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
	// List returns every published skill, newest upload first. Unpublished
	// ones are excluded unless includeRetired is set, which only the admin
	// surfaces ask for.
	List(ctx context.Context, includeRetired bool) ([]models.Skill, error)

	// ReserveNextVersion atomically increments the counter and returns the
	// number the caller now owns. Two concurrent publishes of the same skill
	// get different numbers, so neither can overwrite the other's bundle.
	ReserveNextVersion(ctx context.Context, skillID uuid.UUID) (int, error)
	// ReleaseVersion gives a reserved number back when the upload that
	// reserved it failed before the version row existed. Guarded on the
	// counter still being that number, so it cannot undo somebody else's
	// later publish; a no-op otherwise.
	ReleaseVersion(ctx context.Context, skillID uuid.UUID, version int) error

	// FinishPublish records the metadata that mirrors the new current version
	// onto the skill row, and refreshes what the publisher supplied.
	FinishPublish(ctx context.Context, skillID uuid.UUID, in FinishPublishInput) error
	// SetUnpublished retires or restores a skill.
	SetUnpublished(ctx context.Context, skillID uuid.UUID, at *time.Time, by *uuid.UUID) error
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

func (r *skillRepository) List(ctx context.Context, includeRetired bool) ([]models.Skill, error) {
	filter := bson.M{}
	if !includeRetired {
		filter["unpublished_at"] = bson.M{"$exists": false}
	}
	var out []models.Skill
	err := r.coll.Find(ctx, filter).Sort("-uploaded_at").All(&out)
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

func (r *skillRepository) SetUnpublished(ctx context.Context, skillID uuid.UUID, at *time.Time, by *uuid.UUID) error {
	if at == nil {
		return r.coll.UpdateOne(ctx,
			bson.M{"skill_id": skillID},
			bson.M{"$unset": bson.M{"unpublished_at": "", "unpublished_by": ""}},
		)
	}
	return r.coll.UpdateOne(ctx,
		bson.M{"skill_id": skillID},
		bson.M{"$set": bson.M{"unpublished_at": *at, "unpublished_by": by}},
	)
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
