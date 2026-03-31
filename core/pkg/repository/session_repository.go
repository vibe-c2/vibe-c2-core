package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const sessionCollection = "sessions"

// ISessionRepository defines the interface for session database operations.
// Sessions are persisted in MongoDB for metadata storage and audit history,
// while the corresponding refresh tokens live in Redis for fast validation.
type ISessionRepository interface {
	Create(ctx context.Context, session *models.Session) error
	FindByID(ctx context.Context, id uuid.UUID) (models.Session, error)
	FindByTokenHash(ctx context.Context, tokenHash string) (models.Session, error)

	// UpdateOnRefresh atomically swaps the token hash during rotation and
	// bumps last_activity_at and expires_at.
	UpdateOnRefresh(ctx context.Context, oldTokenHash, newTokenHash string, newExpiresAt time.Time) error

	// Terminate marks a single session as inactive with the given reason.
	Terminate(ctx context.Context, sessionID uuid.UUID, reason models.SessionTerminationReason) error

	// TerminateAllForUser marks all active sessions for a user as inactive.
	// Used during replay detection and admin bulk-revoke.
	TerminateAllForUser(ctx context.Context, userID uuid.UUID, reason models.SessionTerminationReason) (int64, error)

	// Count returns total sessions matching the filter.
	// If userIDs is non-empty, scopes to those users. If activeOnly, only active sessions.
	Count(ctx context.Context, userIDs []uuid.UUID, activeOnly bool) (int64, error)

	// FindWithCursor returns paginated sessions.
	// If userIDs is non-empty, scopes to those users. If activeOnly, only active sessions.
	FindWithCursor(ctx context.Context, userIDs []uuid.UUID, activeOnly bool,
		cursor *pagination.Cursor, limit int64, forward bool) ([]models.Session, error)

	// FindActiveSessions returns a batch of active sessions (up to limit).
	// Used by the session cleaner for reconciliation against Redis.
	FindActiveSessions(ctx context.Context, limit int64) ([]models.Session, error)

	// MarkExpiredSessions bulk-updates active sessions past their expires_at
	// to inactive with reason "expired". Returns the count of sessions marked.
	MarkExpiredSessions(ctx context.Context) (int64, error)
}

type sessionRepository struct {
	coll database.Collection
}

func NewSessionRepository(db database.Database) ISessionRepository {
	coll := db.Collection(sessionCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"session_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"token_hash"}, IndexOptions: new(options.IndexOptions).SetUnique(true).SetSparse(true)},
		{Key: []string{"user_id", "status", "-createAt"}},
		{Key: []string{"status", "expires_at"}},
		{Key: []string{"-createAt", "-_id"}}, // cursor-based pagination
	})

	return &sessionRepository{coll: coll}
}

func (r *sessionRepository) Create(ctx context.Context, session *models.Session) error {
	_, err := r.coll.InsertOne(ctx, session)
	return err
}

func (r *sessionRepository) FindByID(ctx context.Context, id uuid.UUID) (models.Session, error) {
	var session models.Session
	err := r.coll.FindOne(ctx, bson.M{"session_id": id}).One(&session)
	return session, err
}

func (r *sessionRepository) FindByTokenHash(ctx context.Context, tokenHash string) (models.Session, error) {
	var session models.Session
	err := r.coll.FindOne(ctx, bson.M{"token_hash": tokenHash, "status": string(models.SessionStatusActive)}).One(&session)
	return session, err
}

func (r *sessionRepository) UpdateOnRefresh(ctx context.Context, oldTokenHash, newTokenHash string, newExpiresAt time.Time) error {
	now := time.Now().UTC()
	return r.coll.UpdateOne(ctx,
		bson.M{"token_hash": oldTokenHash, "status": string(models.SessionStatusActive)},
		bson.M{"$set": bson.M{
			"token_hash":      newTokenHash,
			"last_activity_at": now,
			"expires_at":      newExpiresAt,
		}},
	)
}

func (r *sessionRepository) Terminate(ctx context.Context, sessionID uuid.UUID, reason models.SessionTerminationReason) error {
	now := time.Now().UTC()
	return r.coll.UpdateOne(ctx,
		bson.M{"session_id": sessionID, "status": string(models.SessionStatusActive)},
		bson.M{"$set": bson.M{
			"status":             string(models.SessionStatusInactive),
			"termination_reason": string(reason),
			"terminated_at":      now,
		}},
	)
}

func (r *sessionRepository) TerminateAllForUser(ctx context.Context, userID uuid.UUID, reason models.SessionTerminationReason) (int64, error) {
	now := time.Now().UTC()
	result, err := r.coll.UpdateAll(ctx,
		bson.M{"user_id": userID, "status": string(models.SessionStatusActive)},
		bson.M{"$set": bson.M{
			"status":             string(models.SessionStatusInactive),
			"termination_reason": string(reason),
			"terminated_at":      now,
		}},
	)
	if err != nil {
		return 0, err
	}
	if result != nil {
		return result.ModifiedCount, nil
	}
	return 0, nil
}

func (r *sessionRepository) Count(ctx context.Context, userIDs []uuid.UUID, activeOnly bool) (int64, error) {
	filter := buildSessionFilter(userIDs, activeOnly)
	return r.coll.Count(ctx, filter)
}

func (r *sessionRepository) FindWithCursor(ctx context.Context, userIDs []uuid.UUID, activeOnly bool,
	cursor *pagination.Cursor, limit int64, forward bool) ([]models.Session, error) {

	filter := buildSessionFilter(userIDs, activeOnly)

	if cursorFilter := pagination.BuildCursorFilter(cursor, forward); len(cursorFilter) > 0 {
		for k, v := range cursorFilter {
			filter[k] = v
		}
	}

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

func (r *sessionRepository) FindActiveSessions(ctx context.Context, limit int64) ([]models.Session, error) {
	var sessions []models.Session
	err := r.coll.Find(ctx, bson.M{"status": string(models.SessionStatusActive)}).
		Limit(limit).
		All(&sessions)
	return sessions, err
}

func (r *sessionRepository) MarkExpiredSessions(ctx context.Context) (int64, error) {
	now := time.Now().UTC()
	result, err := r.coll.UpdateAll(ctx,
		bson.M{
			"status":     string(models.SessionStatusActive),
			"expires_at": bson.M{"$lt": now},
		},
		bson.M{"$set": bson.M{
			"status":             string(models.SessionStatusInactive),
			"termination_reason": string(models.TerminationExpired),
			"terminated_at":      now,
		}},
	)
	if err != nil {
		return 0, err
	}
	if result != nil {
		return result.ModifiedCount, nil
	}
	return 0, nil
}

func buildSessionFilter(userIDs []uuid.UUID, activeOnly bool) bson.M {
	filter := bson.M{}
	if len(userIDs) == 1 {
		filter["user_id"] = userIDs[0]
	} else if len(userIDs) > 1 {
		filter["user_id"] = bson.M{"$in": userIDs}
	}
	if activeOnly {
		filter["status"] = string(models.SessionStatusActive)
	}
	return filter
}
