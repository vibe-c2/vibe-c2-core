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

const skillSubscriptionCollection = "skill_subscriptions"

// ISkillSubscriptionRepository records what each operator has downloaded and
// dismissed, one row per (user, skill).
//
// This is the whole basis of the update prompt: without a record of what
// somebody installed, a new version is not news to anyone. It is written on
// download rather than on any explicit "subscribe" action, because downloading
// is the only moment we know for certain that a copy now exists somewhere.
type ISkillSubscriptionRepository interface {
	// RecordDownload upserts the row for this operator and skill. Downloading
	// an older version on purpose does not pretend they are up to date, so the
	// stored version only ever moves forward.
	RecordDownload(ctx context.Context, userID, skillID uuid.UUID, version int, at time.Time) error
	// Snooze records that the operator dismissed the prompt for this version.
	// Only meaningful for a skill they already downloaded.
	Snooze(ctx context.Context, userID, skillID uuid.UUID, version int) error
	// FindByUser returns every subscription for one operator, which is what
	// the skills listing joins against.
	FindByUser(ctx context.Context, userID uuid.UUID) ([]models.SkillSubscription, error)
	Find(ctx context.Context, userID, skillID uuid.UUID) (models.SkillSubscription, error)
	// DeleteBySkill removes the subscriptions for a skill. Used when a skill
	// is deleted outright, so nobody is prompted about something that is gone.
	DeleteBySkill(ctx context.Context, skillID uuid.UUID) error
}

type skillSubscriptionRepository struct {
	coll database.Collection
}

func NewSkillSubscriptionRepository(db database.Database) ISkillSubscriptionRepository {
	coll := db.Collection(skillSubscriptionCollection)
	db.EnsureIndexes(context.Background(), skillSubscriptionCollection, []opts.IndexModel{
		{Key: []string{"user_id", "skill_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"skill_id"}},
	})
	return &skillSubscriptionRepository{coll: coll}
}

func (r *skillSubscriptionRepository) RecordDownload(ctx context.Context, userID, skillID uuid.UUID, version int, at time.Time) error {
	raw, err := r.coll.RawCollection()
	if err != nil {
		return err
	}
	// $max on the version so fetching version 2 after version 5 does not
	// quietly mark the operator as behind; $set on the timestamp because the
	// interesting fact there is when they last took a copy of anything.
	_, err = raw.UpdateOne(ctx,
		v1bson.M{"user_id": userID, "skill_id": skillID},
		v1bson.M{
			"$max": v1bson.M{"downloaded_version": version},
			"$set": v1bson.M{"downloaded_at": at, "updateAt": at},
			"$setOnInsert": v1bson.M{
				"user_id":  userID,
				"skill_id": skillID,
				"createAt": at,
			},
		},
		options.Update().SetUpsert(true),
	)
	return err
}

func (r *skillSubscriptionRepository) Snooze(ctx context.Context, userID, skillID uuid.UUID, version int) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"user_id": userID, "skill_id": skillID},
		bson.M{"$max": bson.M{"snoozed_version": version}},
	)
}

func (r *skillSubscriptionRepository) FindByUser(ctx context.Context, userID uuid.UUID) ([]models.SkillSubscription, error) {
	var out []models.SkillSubscription
	err := r.coll.Find(ctx, bson.M{"user_id": userID}).All(&out)
	return out, err
}

func (r *skillSubscriptionRepository) Find(ctx context.Context, userID, skillID uuid.UUID) (models.SkillSubscription, error) {
	var out models.SkillSubscription
	err := r.coll.FindOne(ctx, bson.M{"user_id": userID, "skill_id": skillID}).One(&out)
	return out, err
}

func (r *skillSubscriptionRepository) DeleteBySkill(ctx context.Context, skillID uuid.UUID) error {
	_, err := r.coll.RemoveAll(ctx, bson.M{"skill_id": skillID})
	return err
}
