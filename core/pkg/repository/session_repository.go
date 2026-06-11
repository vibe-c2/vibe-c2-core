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

const sessionCollection = "sessions"

// ISessionRepository is the insert-once creation log for sessions. Every
// successful login writes one row; nothing else is ever written, updated,
// or deleted by application code. Active state lives in Redis (TokenStore);
// this repository is never consulted during authorization.
//
// The resolver reads from this collection to display historical sessions
// in the UI, and decorates each row with `is_active` and `last_activity_at`
// from Redis at query time.
type ISessionRepository interface {
	// Insert persists a new session creation row. Called once on login.
	Insert(ctx context.Context, session *models.Session) error

	// FindByID looks up a session row by its session UUID. Used by
	// AdminRevokeSession to learn the owning user_id from a session_id.
	FindByID(ctx context.Context, id uuid.UUID) (models.Session, error)

	// FindBySessionIDs returns the rows whose session_id is in the given
	// set. Used by the resolver's `activeOnly=true` path: it pulls live
	// session_ids from Redis and then loads their corresponding rows.
	// Sorted by createAt descending. Empty input returns nil.
	FindBySessionIDs(ctx context.Context, ids []uuid.UUID) ([]models.Session, error)

	// Count returns the number of rows matching the user filter.
	Count(ctx context.Context, userIDs []uuid.UUID) (int64, error)

	// FindWithCursor returns paginated rows scoped to the given users.
	FindWithCursor(ctx context.Context, userIDs []uuid.UUID,
		cursor *pagination.Cursor, limit int64, forward bool) ([]models.Session, error)
}

type sessionRepository struct {
	coll database.Collection
}

// NewSessionRepository creates the session creation-log repository.
func NewSessionRepository(db database.Database) ISessionRepository {
	coll := db.Collection(sessionCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"session_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"user_id", "-createAt"}},
		{Key: []string{"-createAt", "-_id"}}, // cursor pagination
	})

	return &sessionRepository{coll: coll}
}

func (r *sessionRepository) Insert(ctx context.Context, session *models.Session) error {
	_, err := r.coll.InsertOne(ctx, session)
	return err
}

func (r *sessionRepository) FindByID(ctx context.Context, id uuid.UUID) (models.Session, error) {
	var session models.Session
	err := r.coll.FindOne(ctx, bson.M{"session_id": id}).One(&session)
	return session, err
}

func (r *sessionRepository) FindBySessionIDs(ctx context.Context, ids []uuid.UUID) ([]models.Session, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var sessions []models.Session
	err := r.coll.Find(ctx, bson.M{"session_id": bson.M{"$in": ids}}).
		Sort("-createAt", "-_id").
		All(&sessions)
	return sessions, err
}

func (r *sessionRepository) Count(ctx context.Context, userIDs []uuid.UUID) (int64, error) {
	return r.coll.Count(ctx, buildSessionFilter(userIDs))
}

func (r *sessionRepository) FindWithCursor(ctx context.Context, userIDs []uuid.UUID,
	cursor *pagination.Cursor, limit int64, forward bool) ([]models.Session, error) {

	filter := pagination.ApplyCursorFilter(buildSessionFilter(userIDs), cursor, forward)

	var sessions []models.Session
	err := r.coll.Find(ctx, filter).
		Sort(pagination.SortFields(forward)...).
		Limit(limit).
		All(&sessions)

	if !forward && len(sessions) > 0 {
		for i, j := 0, len(sessions)-1; i < j; i, j = i+1, j-1 {
			sessions[i], sessions[j] = sessions[j], sessions[i]
		}
	}

	return sessions, err
}

func buildSessionFilter(userIDs []uuid.UUID) bson.M {
	filter := bson.M{}
	if len(userIDs) == 1 {
		filter["user_id"] = userIDs[0]
	} else if len(userIDs) > 1 {
		filter["user_id"] = bson.M{"$in": userIDs}
	}
	return filter
}
