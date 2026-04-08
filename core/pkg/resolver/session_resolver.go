package resolver

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// ISessionResolver defines the business logic methods for the Session entity.
//
// Mongo holds the immutable creation log; Redis holds the live active set.
// The resolver loads rows from Mongo and decorates each one with `Status`
// and `LastActivityAt` from Redis at query time.
type ISessionResolver interface {
	// Queries
	MySessions(ctx context.Context, activeOnly *bool, first *int, after *string, last *int, before *string) (*model.SessionConnection, error)
	Sessions(ctx context.Context, userID *string, search *string, activeOnly *bool, first *int, after *string, last *int, before *string) (*model.SessionConnection, error)
	Session(ctx context.Context, id string) (*models.Session, error)

	// Mutations
	RevokeSession(ctx context.Context, id string) (bool, error)
	RevokeAllMySessions(ctx context.Context) (int, error)
	AdminRevokeSession(ctx context.Context, id string) (bool, error)
	AdminRevokeAllUserSessions(ctx context.Context, userID string) (int, error)

	// Field resolvers
	ID(ctx context.Context, obj *models.Session) (string, error)
	UserID(ctx context.Context, obj *models.Session) (string, error)
	User(ctx context.Context, obj *models.Session) (*models.User, error)
	Status(ctx context.Context, obj *models.Session) (models.SessionStatus, error)
	LastActivityAt(ctx context.Context, obj *models.Session) (*string, error)
	IsCurrent(ctx context.Context, obj *models.Session) (bool, error)
	CreatedAt(ctx context.Context, obj *models.Session) (string, error)
	UpdatedAt(ctx context.Context, obj *models.Session) (string, error)
}

type sessionResolver struct {
	sessionRepo repository.ISessionRepository // Mongo creation log
	userRepo    repository.IUserRepository
	tokenStore  auth.TokenStore // Redis active set
	bus         eventbus.IEventBus
}

func NewSessionResolver(
	sessionRepo repository.ISessionRepository,
	userRepo repository.IUserRepository,
	tokenStore auth.TokenStore,
	bus eventbus.IEventBus,
) ISessionResolver {
	return &sessionResolver{
		sessionRepo: sessionRepo,
		userRepo:    userRepo,
		tokenStore:  tokenStore,
		bus:         bus,
	}
}

// --- Queries ---

func (r *sessionResolver) MySessions(ctx context.Context, activeOnly *bool, first *int, after *string, last *int, before *string) (*model.SessionConnection, error) {
	authInfo := gqlctx.AuthFromContext(ctx)
	userUUID, err := uuid.Parse(authInfo.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID in token: %w", err)
	}
	return r.listSessions(ctx, []uuid.UUID{userUUID}, boolOr(activeOnly, false), first, after, last, before)
}

func (r *sessionResolver) Sessions(ctx context.Context, userID *string, search *string, activeOnly *bool, first *int, after *string, last *int, before *string) (*model.SessionConnection, error) {
	if userID != nil && *userID != "" && search != nil && *search != "" {
		return nil, fmt.Errorf("cannot specify both userID and search")
	}

	var userIDs []uuid.UUID

	if userID != nil && *userID != "" {
		uid, err := uuid.Parse(*userID)
		if err != nil {
			return nil, fmt.Errorf("invalid user ID: %w", err)
		}
		userIDs = []uuid.UUID{uid}
	}

	if search != nil && *search != "" {
		users, err := r.userRepo.FindAll(ctx, *search, 0, 100)
		if err != nil {
			return nil, fmt.Errorf("failed to search users: %w", err)
		}
		if len(users) == 0 {
			return &model.SessionConnection{
				Edges:      []*model.SessionEdge{},
				PageInfo:   &pagination.PageInfo{},
				TotalCount: 0,
			}, nil
		}
		userIDs = make([]uuid.UUID, len(users))
		for i, u := range users {
			userIDs[i] = u.UserID
		}
	}

	return r.listSessions(ctx, userIDs, boolOr(activeOnly, false), first, after, last, before)
}

func (r *sessionResolver) Session(ctx context.Context, id string) (*models.Session, error) {
	sid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid session ID: %w", err)
	}

	sess, err := r.sessionRepo.FindByID(ctx, sid)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}

	// Decorate with active state. We need to know the owning user_id —
	// luckily it's right there on the row.
	r.decorate(ctx, []*models.Session{&sess})
	return &sess, nil
}

// listSessions returns paginated session rows with `is_active` and
// `last_activity_at` decorated from Redis.
//
//   - activeOnly=false (default): Mongo paginated find scoped to userIDs,
//     each row decorated.
//   - activeOnly=true: pull live session_ids from Redis (bounded by the
//     active set), Mongo find by session_id $in, decorate. Pagination is a
//     no-op since the active set is small; we just respect `first` as a cap.
//   - userIDs empty: admin global view. Mongo paginated find unscoped,
//     decoration falls back to per-row Redis lookups (small N).
func (r *sessionResolver) listSessions(ctx context.Context, userIDs []uuid.UUID, activeOnly bool,
	first *int, after *string, last *int, before *string) (*model.SessionConnection, error) {

	args, err := pagination.ParseArgs(first, after, last, before)
	if err != nil {
		return nil, fmt.Errorf("invalid pagination args: %w", err)
	}

	if activeOnly {
		// Redis-first: collect live session_ids from each user, then Mongo
		// find by session_id. Bounded by total live sessions (small).
		if len(userIDs) == 0 {
			// Unscoped admin global active view. We could SCAN every
			// user index, but that's expensive and rarely needed —
			// require a user filter.
			return nil, fmt.Errorf("activeOnly requires a user filter")
		}
		var ids []uuid.UUID
		for _, uid := range userIDs {
			actives, err := r.tokenStore.ListByUser(ctx, uid)
			if err != nil {
				return nil, fmt.Errorf("list active: %w", err)
			}
			for _, a := range actives {
				ids = append(ids, a.SessionID)
			}
		}
		if len(ids) == 0 {
			return &model.SessionConnection{
				Edges:      []*model.SessionEdge{},
				PageInfo:   &pagination.PageInfo{},
				TotalCount: 0,
			}, nil
		}
		rows, err := r.sessionRepo.FindBySessionIDs(ctx, ids)
		if err != nil {
			return nil, fmt.Errorf("find by session ids: %w", err)
		}
		// Cap to first if provided.
		if int64(len(rows)) > args.Limit {
			rows = rows[:args.Limit]
		}
		ptrs := toPtrs(rows)
		r.decorate(ctx, ptrs)
		return r.buildConnection(ptrs, len(ptrs), false), nil
	}

	// History path: Mongo paginated find scoped to userIDs.
	total, err := r.sessionRepo.Count(ctx, userIDs)
	if err != nil {
		return nil, fmt.Errorf("count: %w", err)
	}
	rows, err := r.sessionRepo.FindWithCursor(ctx, userIDs, args.Cursor, args.Limit+1, args.Forward)
	if err != nil {
		return nil, fmt.Errorf("find: %w", err)
	}
	hasMore := int64(len(rows)) > args.Limit
	if hasMore {
		rows = rows[:args.Limit]
	}
	ptrs := toPtrs(rows)
	r.decorate(ctx, ptrs)

	conn := r.buildConnection(ptrs, int(total), hasMore)
	conn.PageInfo.HasNextPage = args.Forward && hasMore
	conn.PageInfo.HasPreviousPage = (!args.Forward && hasMore) || (args.Forward && args.Cursor != nil)
	return conn, nil
}

// buildConnection wraps a row slice into a SessionConnection with cursors.
func (r *sessionResolver) buildConnection(rows []*models.Session, total int, _ bool) *model.SessionConnection {
	edges := make([]*model.SessionEdge, len(rows))
	for i, row := range rows {
		cursor := pagination.EncodeCursor(row.CreateAt, row.Id)
		edges[i] = &model.SessionEdge{Node: row, Cursor: cursor}
	}
	pi := &pagination.PageInfo{}
	if len(edges) > 0 {
		pi.StartCursor = &edges[0].Cursor
		pi.EndCursor = &edges[len(edges)-1].Cursor
	}
	return &model.SessionConnection{
		Edges:      edges,
		PageInfo:   pi,
		TotalCount: total,
	}
}

// decorate populates Status + LastActivityAt on each row from Redis.
//
// Strategy: group rows by user_id, then for each user fetch their full
// active set in one ListByUser call (one Redis SMEMBERS+MGET round-trip
// per user). Match each row's session_id against the active set.
//
// For typical pages (one or a few users) this is O(pages) Redis calls
// regardless of page size.
func (r *sessionResolver) decorate(ctx context.Context, rows []*models.Session) {
	if len(rows) == 0 {
		return
	}
	cache := make(map[uuid.UUID]map[uuid.UUID]time.Time)
	for _, row := range rows {
		set, ok := cache[row.UserID]
		if !ok {
			actives, err := r.tokenStore.ListByUser(ctx, row.UserID)
			if err != nil {
				// Best-effort: leave rows un-decorated (status zero-value).
				cache[row.UserID] = nil
				continue
			}
			set = make(map[uuid.UUID]time.Time, len(actives))
			for _, a := range actives {
				set[a.SessionID] = a.LastActivityAt
			}
			cache[row.UserID] = set
		}
		if set == nil {
			row.Status = models.SessionStatusInactive
			continue
		}
		if last, live := set[row.SessionID]; live {
			row.Status = models.SessionStatusActive
			unix := last.Unix()
			row.LastActivityAt = &unix
		} else {
			row.Status = models.SessionStatusInactive
		}
	}
}

func toPtrs(rows []models.Session) []*models.Session {
	out := make([]*models.Session, len(rows))
	for i := range rows {
		out[i] = &rows[i]
	}
	return out
}

func boolOr(p *bool, def bool) bool {
	if p == nil {
		return def
	}
	return *p
}

// --- Mutations ---

func (r *sessionResolver) RevokeSession(ctx context.Context, id string) (bool, error) {
	authInfo := gqlctx.AuthFromContext(ctx)
	userUUID, err := uuid.Parse(authInfo.UserID)
	if err != nil {
		return false, fmt.Errorf("invalid user ID in token: %w", err)
	}

	sid, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("invalid session ID: %w", err)
	}

	if authInfo.CurrentSessionID != "" && sid.String() == authInfo.CurrentSessionID {
		return false, fmt.Errorf("cannot revoke current session — use logout instead")
	}

	if _, err := r.tokenStore.DeleteBySessionID(ctx, userUUID, sid); err != nil {
		if errors.Is(err, auth.ErrTokenInvalid) {
			return false, fmt.Errorf("session not found or already inactive")
		}
		return false, fmt.Errorf("failed to revoke: %w", err)
	}

	r.bus.Publish(eventbus.NewSessionTerminatedEvent(eventbus.UserActor(authInfo.UserID), eventbus.SessionEventPayload{
		SessionID: id, UserID: authInfo.UserID, Reason: "user_revoked",
	}))
	return true, nil
}

func (r *sessionResolver) RevokeAllMySessions(ctx context.Context) (int, error) {
	authInfo := gqlctx.AuthFromContext(ctx)
	userUUID, err := uuid.Parse(authInfo.UserID)
	if err != nil {
		return 0, fmt.Errorf("invalid user ID in token: %w", err)
	}
	return r.bulkRevoke(ctx, userUUID, authInfo.CurrentSessionID, "user_revoked", authInfo.UserID)
}

func (r *sessionResolver) AdminRevokeSession(ctx context.Context, id string) (bool, error) {
	authInfo := gqlctx.AuthFromContext(ctx)

	sid, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("invalid session ID: %w", err)
	}
	if authInfo.CurrentSessionID != "" && sid.String() == authInfo.CurrentSessionID {
		return false, fmt.Errorf("cannot revoke your own current session — use logout instead")
	}

	// Look up the session in the Mongo creation log to learn the owning
	// user_id, then delete the Redis entry by session_id.
	row, err := r.sessionRepo.FindByID(ctx, sid)
	if err != nil {
		return false, fmt.Errorf("session not found: %w", err)
	}

	if _, err := r.tokenStore.DeleteBySessionID(ctx, row.UserID, sid); err != nil {
		if errors.Is(err, auth.ErrTokenInvalid) {
			return false, fmt.Errorf("session is already inactive")
		}
		return false, fmt.Errorf("failed to revoke: %w", err)
	}

	r.bus.Publish(eventbus.NewSessionTerminatedEvent(eventbus.UserActor(authInfo.UserID), eventbus.SessionEventPayload{
		SessionID: id, UserID: row.UserID.String(), Reason: "admin_revoked",
	}))
	return true, nil
}

func (r *sessionResolver) AdminRevokeAllUserSessions(ctx context.Context, userID string) (int, error) {
	authInfo := gqlctx.AuthFromContext(ctx)
	targetUUID, err := uuid.Parse(userID)
	if err != nil {
		return 0, fmt.Errorf("invalid user ID: %w", err)
	}
	return r.bulkRevoke(ctx, targetUUID, "", "admin_revoked", authInfo.UserID)
}

// bulkRevoke removes all live sessions for a user (skipping the optional
// excludeSessionID), then publishes one terminated event per session.
func (r *sessionResolver) bulkRevoke(ctx context.Context, userID uuid.UUID, excludeSessionID string,
	reason string, actorUserID string) (int, error) {

	actives, err := r.tokenStore.ListByUser(ctx, userID)
	if err != nil {
		return 0, fmt.Errorf("list active: %w", err)
	}
	var revoked int
	for _, a := range actives {
		if excludeSessionID != "" && a.SessionID.String() == excludeSessionID {
			continue
		}
		if _, err := r.tokenStore.DeleteBySessionID(ctx, userID, a.SessionID); err != nil {
			continue
		}
		r.bus.Publish(eventbus.NewSessionTerminatedEvent(eventbus.UserActor(actorUserID), eventbus.SessionEventPayload{
			SessionID: a.SessionID.String(), UserID: userID.String(), Reason: reason,
		}))
		revoked++
	}
	return revoked, nil
}

// --- Field Resolvers ---

func (r *sessionResolver) ID(_ context.Context, obj *models.Session) (string, error) {
	return obj.SessionID.String(), nil
}

func (r *sessionResolver) UserID(_ context.Context, obj *models.Session) (string, error) {
	return obj.UserID.String(), nil
}

func (r *sessionResolver) User(ctx context.Context, obj *models.Session) (*models.User, error) {
	user, err := r.userRepo.FindByID(ctx, obj.UserID)
	if err != nil {
		return nil, fmt.Errorf("session user not found: %w", err)
	}
	return &user, nil
}

func (r *sessionResolver) Status(_ context.Context, obj *models.Session) (models.SessionStatus, error) {
	if obj.Status == "" {
		return models.SessionStatusInactive, nil
	}
	return obj.Status, nil
}

func (r *sessionResolver) LastActivityAt(_ context.Context, obj *models.Session) (*string, error) {
	if obj.LastActivityAt == nil {
		return nil, nil
	}
	s := time.Unix(*obj.LastActivityAt, 0).UTC().Format(time.RFC3339)
	return &s, nil
}

func (r *sessionResolver) IsCurrent(ctx context.Context, obj *models.Session) (bool, error) {
	authInfo := gqlctx.AuthFromContext(ctx)
	if authInfo.CurrentSessionID == "" {
		return false, nil
	}
	return obj.SessionID.String() == authInfo.CurrentSessionID, nil
}

func (r *sessionResolver) CreatedAt(_ context.Context, obj *models.Session) (string, error) {
	return obj.CreateAt.Format(time.RFC3339), nil
}

func (r *sessionResolver) UpdatedAt(_ context.Context, obj *models.Session) (string, error) {
	return obj.UpdateAt.Format(time.RFC3339), nil
}

