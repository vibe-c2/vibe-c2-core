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

const userCollection = "users"

// IUserRepository defines the interface for user database operations.
type IUserRepository interface {
	ExistsByUsername(ctx context.Context, username string) (bool, error)
	FindByUsername(ctx context.Context, username string) (models.User, error)
	Create(ctx context.Context, user *models.User) error

	Count(ctx context.Context, search string) (int64, error)
	FindAll(ctx context.Context, search string, offset, limit int64) ([]models.User, error)
	FindWithCursor(ctx context.Context, search string, cursor *pagination.Cursor, limit int64, forward bool) ([]models.User, error)

	FindByID(ctx context.Context, id uuid.UUID) (models.User, error)
	FindSuggestions(ctx context.Context, search string, limit int64) ([]models.User, error)
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
		{Key: []string{"-createAt", "-_id"}}, // Supports cursor-based pagination
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

func (r *userRepository) FindWithCursor(ctx context.Context, search string, cursor *pagination.Cursor, limit int64, forward bool) ([]models.User, error) {
	filter := buildSearchFilter(search)

	if cursorFilter := pagination.BuildCursorFilter(cursor, forward); len(cursorFilter) > 0 {
		for k, v := range cursorFilter {
			filter[k] = v
		}
	}

	var users []models.User
	err := r.coll.Find(ctx, filter).
		Sort(pagination.SortFields(forward)...).
		Limit(limit).
		All(&users)

	if !forward && len(users) > 0 {
		// Backward pagination fetches in ascending order; reverse to maintain
		// descending createAt order that the client expects.
		for i, j := 0, len(users)-1; i < j; i, j = i+1, j-1 {
			users[i], users[j] = users[j], users[i]
		}
	}

	return users, err
}

func (r *userRepository) FindByID(ctx context.Context, id uuid.UUID) (models.User, error) {
	var user models.User
	err := r.coll.FindOne(ctx, bson.M{"user_id": id}).One(&user)
	return user, err
}

func (r *userRepository) FindSuggestions(ctx context.Context, search string, limit int64) ([]models.User, error) {
	var users []models.User
	err := r.coll.Find(ctx, buildSearchFilter(search)).
		Sort("-createAt").
		Limit(limit).
		All(&users)
	return users, err
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
		bson.M{"roles": regex},
	}}
}
