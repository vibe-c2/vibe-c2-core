package repository

import (
	"context"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const userCollection = "users"

// UserSortField identifies a Mongo column the users list can be ordered by.
// The string value is the field path used in the sort and in the keyset
// cursor filter.
type UserSortField string

const (
	UserSortFieldCreatedAt UserSortField = "createAt"
	UserSortFieldUsername  UserSortField = "username"
)

// UserSort bundles the sort column and direction for the users list query.
// The zero value is NOT valid — use DefaultUserSort() (createAt descending,
// the historical order) when the caller doesn't choose.
type UserSort struct {
	Field     UserSortField
	Ascending bool
}

// DefaultUserSort returns the historical list order: newest first.
func DefaultUserSort() UserSort {
	return UserSort{Field: UserSortFieldCreatedAt, Ascending: false}
}

// SortKey maps the user sort to the pagination layer's representation.
// username is a string column, so its cursors carry the string sort key;
// createAt keeps the legacy time-keyed cursor shape.
func (s UserSort) SortKey() pagination.SortKey {
	return pagination.SortKey{
		Field:     string(s.Field),
		Ascending: s.Ascending,
		String:    s.Field != UserSortFieldCreatedAt,
	}
}

// Cursor encodes the edge cursor for a user row under this sort — the value
// of the active sort column plus the _id tiebreaker.
func (s UserSort) Cursor(u *models.User) string {
	if s.Field == UserSortFieldUsername {
		return pagination.EncodeStringCursor(u.Username, u.Id)
	}
	return pagination.EncodeCursor(u.CreateAt, u.Id)
}

// IUserRepository defines the interface for user database operations.
type IUserRepository interface {
	ExistsByUsername(ctx context.Context, username string) (bool, error)
	FindByUsername(ctx context.Context, username string) (models.User, error)
	Create(ctx context.Context, user *models.User) error

	Count(ctx context.Context, search string) (int64, error)
	FindAll(ctx context.Context, search string, offset, limit int64) ([]models.User, error)
	FindWithCursor(ctx context.Context, search string, sort UserSort, cursor *pagination.Cursor, limit int64, forward bool) ([]models.User, error)

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
		// Collated index backing the username column sort. The unique username
		// index above can't serve it — its collation differs, so Mongo would
		// sort case-sensitively. One index serves both directions (a reversed
		// sort walks the index backwards); see the credential repository's
		// index comment for the full rationale.
		{Key: []string{"username", "_id"}, IndexOptions: new(options.IndexOptions).SetCollation(caseInsensitiveSortCollation)},
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

func (r *userRepository) FindWithCursor(ctx context.Context, search string, sort UserSort, cursor *pagination.Cursor, limit int64, forward bool) ([]models.User, error) {
	key := sort.SortKey()
	if err := key.ValidateCursor(cursor); err != nil {
		return nil, err
	}

	q := r.coll.Find(ctx, pagination.ApplyCursorFilterKey(buildSearchFilter(search), cursor, forward, key))
	if key.String {
		q = q.Collation(caseInsensitiveSortCollation)
	}

	var users []models.User
	err := q.
		Sort(pagination.SortFieldsKey(forward, key)...).
		Limit(limit).
		All(&users)

	if !forward && len(users) > 0 {
		// Backward pagination fetches in reversed order; flip the page back to
		// the list order the client expects.
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
	regex := bson.M{"$regex": searchPattern(search), "$options": "i"}
	return bson.M{"$or": bson.A{
		bson.M{"username": regex},
		bson.M{"roles": regex},
	}}
}
