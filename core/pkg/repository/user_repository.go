package repository

import (
	"context"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const userCollection = "users"

// IUserRepository defines the interface for user database operations.
type IUserRepository interface {
	ExistsByUsername(ctx context.Context, username string) (bool, error)
	FindByUsername(ctx context.Context, username string) (models.User, error)
	Create(ctx context.Context, user *models.User) error

	Count(ctx context.Context, search string) (int64, error)
	FindAll(ctx context.Context, search string, offset, limit int64) ([]models.User, error)

	FindByID(ctx context.Context, id uuid.UUID) (models.User, error)
	Update(ctx context.Context, user *models.User, updates map[string]interface{}) error
	Delete(ctx context.Context, user *models.User) error
}

type userRepository struct {
	coll database.Collection
}

func NewUserRepository(db database.Database) IUserRepository {
	coll := db.Collection(userCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"username"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"user_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
	})

	return &userRepository{coll: coll}
}

func (r *userRepository) ExistsByUsername(ctx context.Context, username string) (bool, error) {
	count, err := r.coll.Count(ctx, bson.M{"username": username})
	return count > 0, err
}

func (r *userRepository) FindByUsername(ctx context.Context, username string) (models.User, error) {
	var user models.User
	err := r.coll.FindOne(ctx, bson.M{"username": username}).One(&user)
	return user, err
}

func (r *userRepository) Create(ctx context.Context, user *models.User) error {
	_, err := r.coll.InsertOne(ctx, user)
	return err
}

func (r *userRepository) Count(ctx context.Context, search string) (int64, error) {
	return r.coll.Count(ctx, buildSearchFilter(search))
}

func (r *userRepository) FindAll(ctx context.Context, search string, offset, limit int64) ([]models.User, error) {
	var users []models.User
	err := r.coll.Find(ctx, buildSearchFilter(search)).
		Sort("-createAt").
		Skip(offset).
		Limit(limit).
		All(&users)

	return users, err
}

func (r *userRepository) FindByID(ctx context.Context, id uuid.UUID) (models.User, error) {
	var user models.User
	err := r.coll.FindOne(ctx, bson.M{"user_id": id}).One(&user)
	return user, err
}

func (r *userRepository) Update(ctx context.Context, user *models.User, updates map[string]interface{}) error {
	return r.coll.UpdateOne(ctx, bson.M{"user_id": user.UserID}, bson.M{"$set": updates})
}

func (r *userRepository) Delete(ctx context.Context, user *models.User) error {
	return r.coll.Remove(ctx, bson.M{"user_id": user.UserID})
}

func buildSearchFilter(search string) bson.M {
	if search == "" {
		return bson.M{}
	}
	regex := bson.M{"$regex": search, "$options": "i"}
	return bson.M{"$or": bson.A{
		bson.M{"username": regex},
		bson.M{"role": regex},
	}}
}
