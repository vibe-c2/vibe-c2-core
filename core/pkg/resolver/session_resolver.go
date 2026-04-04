package resolver

import (
	"context"
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
	TerminationReason(ctx context.Context, obj *models.Session) (*models.SessionTerminationReason, error)
	LastActivityAt(ctx context.Context, obj *models.Session) (string, error)
	ExpiresAt(ctx context.Context, obj *models.Session) (string, error)
	TerminatedAt(ctx context.Context, obj *models.Session) (*string, error)
	IsCurrent(ctx context.Context, obj *models.Session) (bool, error)
	CreatedAt(ctx context.Context, obj *models.Session) (string, error)
	UpdatedAt(ctx context.Context, obj *models.Session) (string, error)
}

type sessionResolver struct {
	sessionRepo  repository.ISessionRepository
	userRepo     repository.IUserRepository
	tokenStore   auth.TokenStore
	authProvider auth.IAuthProvider
	eventBus     eventbus.IEventBus
}

func NewSessionResolver(
	sessionRepo repository.ISessionRepository,
	userRepo repository.IUserRepository,
	tokenStore auth.TokenStore,
	authProvider auth.IAuthProvider,
	eventBus eventbus.IEventBus,
) ISessionResolver {
	return &sessionResolver{
		sessionRepo:  sessionRepo,
		userRepo:     userRepo,
		tokenStore:   tokenStore,
		authProvider: authProvider,
		eventBus:     eventBus,
	}
}

// --- Queries ---

func (r *sessionResolver) MySessions(ctx context.Context, activeOnly *bool, first *int, after *string, last *int, before *string) (*model.SessionConnection, error) {
	authInfo := gqlctx.AuthFromContext(ctx)
	userUUID, err := uuid.Parse(authInfo.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID in token: %w", err)
	}

	active := false
	if activeOnly != nil {
		active = *activeOnly
	}

	return r.listSessions(ctx, &userUUID, active, first, after, last, before)
}

func (r *sessionResolver) Sessions(ctx context.Context, userID *string, search *string, activeOnly *bool, first *int, after *string, last *int, before *string) (*model.SessionConnection, error) {
	if userID != nil && *userID != "" && search != nil && *search != "" {
		return nil, fmt.Errorf("cannot specify both userID and search")
	}

	var userIDs []uuid.UUID

	// If a specific userId is provided, use it directly.
	if userID != nil && *userID != "" {
		uid, err := uuid.Parse(*userID)
		if err != nil {
			return nil, fmt.Errorf("invalid user ID: %w", err)
		}
		userIDs = []uuid.UUID{uid}
	}

	// If a search string is provided, find matching users by username
	// and filter sessions to those users.
	if search != nil && *search != "" {
		users, err := r.userRepo.FindAll(ctx, *search, 0, 100)
		if err != nil {
			return nil, fmt.Errorf("failed to search users: %w", err)
		}
		if len(users) == 0 {
			// No matching users — return empty result
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

	active := false
	if activeOnly != nil {
		active = *activeOnly
	}

	return r.listSessionsByUserIDs(ctx, userIDs, active, first, after, last, before)
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
	return &sess, nil
}

// listSessions is a helper for MySessions (single user).
func (r *sessionResolver) listSessions(ctx context.Context, userID *uuid.UUID, activeOnly bool, first *int, after *string, last *int, before *string) (*model.SessionConnection, error) {
	var userIDs []uuid.UUID
	if userID != nil {
		userIDs = []uuid.UUID{*userID}
	}
	return r.listSessionsByUserIDs(ctx, userIDs, activeOnly, first, after, last, before)
}

// listSessionsByUserIDs is the shared pagination helper.
// If userIDs is empty, returns sessions for all users.
// If userIDs has one element, filters to that user.
// If userIDs has multiple elements, filters to those users (search result).
func (r *sessionResolver) listSessionsByUserIDs(ctx context.Context, userIDs []uuid.UUID, activeOnly bool, first *int, after *string, last *int, before *string) (*model.SessionConnection, error) {
	args, err := pagination.ParseArgs(first, after, last, before)
	if err != nil {
		return nil, fmt.Errorf("invalid pagination args: %w", err)
	}

	total, err := r.sessionRepo.Count(ctx, userIDs, activeOnly)
	if err != nil {
		return nil, fmt.Errorf("failed to count sessions: %w", err)
	}

	sessions, err := r.sessionRepo.FindWithCursor(ctx, userIDs, activeOnly, args.Cursor, args.Limit+1, args.Forward)
	if err != nil {
		return nil, fmt.Errorf("failed to list sessions: %w", err)
	}

	hasMore := int64(len(sessions)) > args.Limit
	if hasMore {
		sessions = sessions[:args.Limit]
	}

	edges := make([]*model.SessionEdge, len(sessions))
	for i := range sessions {
		cursor := pagination.EncodeCursor(sessions[i].CreateAt, sessions[i].Id)
		edges[i] = &model.SessionEdge{
			Node:   &sessions[i],
			Cursor: cursor,
		}
	}

	pageInfo := pagination.PageInfo{
		HasNextPage:     args.Forward && hasMore,
		HasPreviousPage: (!args.Forward && hasMore) || (args.Forward && args.Cursor != nil),
	}
	if len(edges) > 0 {
		pageInfo.StartCursor = &edges[0].Cursor
		pageInfo.EndCursor = &edges[len(edges)-1].Cursor
	}

	return &model.SessionConnection{
		Edges:      edges,
		PageInfo:   &pageInfo,
		TotalCount: int(total),
	}, nil
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

	sess, err := r.sessionRepo.FindByID(ctx, sid)
	if err != nil {
		return false, fmt.Errorf("session not found: %w", err)
	}

	// Verify ownership
	if sess.UserID != userUUID {
		return false, fmt.Errorf("forbidden: session does not belong to you")
	}

	// Cannot revoke the current session (use logout for that)
	if authInfo.CurrentSessionID != "" && sess.SessionID.String() == authInfo.CurrentSessionID {
		return false, fmt.Errorf("cannot revoke current session — use logout instead")
	}

	if sess.Status != models.SessionStatusActive {
		return false, fmt.Errorf("session is already inactive")
	}

	// Revoke the refresh token in Redis
	if err := r.tokenStore.DeleteByTokenHash(ctx, authInfo.UserID, sess.TokenHash); err != nil {
		return false, fmt.Errorf("failed to revoke token: %w", err)
	}

	// Mark session as terminated in MongoDB
	if err := r.sessionRepo.Terminate(ctx, sid, models.TerminationUserRevoked); err != nil {
		return false, fmt.Errorf("failed to terminate session: %w", err)
	}

	r.eventBus.Publish(eventbus.NewSessionTerminatedEvent(eventbus.UserActor(authInfo.UserID), eventbus.SessionEventPayload{
		SessionID: id, UserID: authInfo.UserID, Reason: string(models.TerminationUserRevoked),
	}))

	return true, nil
}

func (r *sessionResolver) RevokeAllMySessions(ctx context.Context) (int, error) {
	authInfo := gqlctx.AuthFromContext(ctx)
	userUUID, err := uuid.Parse(authInfo.UserID)
	if err != nil {
		return 0, fmt.Errorf("invalid user ID in token: %w", err)
	}

	// Fetch all active sessions for this user.
	sessions, err := r.sessionRepo.FindWithCursor(ctx, []uuid.UUID{userUUID}, true, nil, 1000, true)
	if err != nil {
		return 0, fmt.Errorf("failed to find sessions: %w", err)
	}

	var revoked, failed int
	for _, sess := range sessions {
		// Skip the current session — it must stay active.
		if authInfo.CurrentSessionID != "" && sess.SessionID.String() == authInfo.CurrentSessionID {
			continue
		}

		// Revoke token in Redis
		if err := r.tokenStore.DeleteByTokenHash(ctx, authInfo.UserID, sess.TokenHash); err != nil {
			failed++
			continue
		}

		// Terminate in MongoDB
		if err := r.sessionRepo.Terminate(ctx, sess.SessionID, models.TerminationUserRevoked); err != nil {
			failed++
			continue
		}

		r.eventBus.Publish(eventbus.NewSessionTerminatedEvent(eventbus.UserActor(authInfo.UserID), eventbus.SessionEventPayload{
			SessionID: sess.SessionID.String(), UserID: authInfo.UserID, Reason: string(models.TerminationUserRevoked),
		}))

		revoked++
	}

	if failed > 0 {
		return revoked, fmt.Errorf("revoked %d sessions but %d failed", revoked, failed)
	}
	return revoked, nil
}

func (r *sessionResolver) AdminRevokeSession(ctx context.Context, id string) (bool, error) {
	authInfo := gqlctx.AuthFromContext(ctx)

	sid, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("invalid session ID: %w", err)
	}

	sess, err := r.sessionRepo.FindByID(ctx, sid)
	if err != nil {
		return false, fmt.Errorf("session not found: %w", err)
	}

	// Prevent admin from accidentally revoking their own current session
	if authInfo.CurrentSessionID != "" && sess.SessionID.String() == authInfo.CurrentSessionID {
		return false, fmt.Errorf("cannot revoke your own current session — use logout instead")
	}

	if sess.Status != models.SessionStatusActive {
		return false, fmt.Errorf("session is already inactive")
	}

	// Revoke the refresh token in Redis
	sessionOwnerID := sess.UserID.String()
	if err := r.tokenStore.DeleteByTokenHash(ctx, sessionOwnerID, sess.TokenHash); err != nil {
		return false, fmt.Errorf("failed to revoke token: %w", err)
	}

	// Mark session as terminated in MongoDB
	if err := r.sessionRepo.Terminate(ctx, sid, models.TerminationAdminRevoked); err != nil {
		return false, fmt.Errorf("failed to terminate session: %w", err)
	}

	r.eventBus.Publish(eventbus.NewSessionTerminatedEvent(eventbus.UserActor(authInfo.UserID), eventbus.SessionEventPayload{
		SessionID: id, UserID: sessionOwnerID, Reason: string(models.TerminationAdminRevoked),
	}))

	return true, nil
}

func (r *sessionResolver) AdminRevokeAllUserSessions(ctx context.Context, userID string) (int, error) {
	authInfo := gqlctx.AuthFromContext(ctx)
	targetUUID, err := uuid.Parse(userID)
	if err != nil {
		return 0, fmt.Errorf("invalid user ID: %w", err)
	}

	// Fetch active sessions before terminating so we can publish per-session events.
	activeSessions, err := r.sessionRepo.FindWithCursor(ctx, []uuid.UUID{targetUUID}, true, nil, 1000, true)
	if err != nil {
		return 0, fmt.Errorf("failed to find active sessions: %w", err)
	}

	// Invalidate all refresh tokens in Redis
	if err := r.authProvider.InvalidateAllRefreshTokens(ctx, userID); err != nil {
		return 0, fmt.Errorf("failed to invalidate tokens: %w", err)
	}

	// Mark all sessions as terminated in MongoDB
	count, err := r.sessionRepo.TerminateAllForUser(ctx, targetUUID, models.TerminationAdminRevoked)
	if err != nil {
		return 0, fmt.Errorf("failed to terminate sessions: %w", err)
	}

	// Publish per-session events so each subscriber can detect their session was revoked
	for _, sess := range activeSessions {
		r.eventBus.Publish(eventbus.NewSessionTerminatedEvent(eventbus.UserActor(authInfo.UserID), eventbus.SessionEventPayload{
			SessionID: sess.SessionID.String(), UserID: userID, Reason: string(models.TerminationAdminRevoked),
		}))
	}

	return int(count), nil
}

// --- Field Resolvers ---

func (r *sessionResolver) ID(_ context.Context, obj *models.Session) (string, error) {
	return obj.SessionID.String(), nil
}

func (r *sessionResolver) UserID(_ context.Context, obj *models.Session) (string, error) {
	return obj.UserID.String(), nil
}

// User resolves the owning User object from the session's UserID.
func (r *sessionResolver) User(ctx context.Context, obj *models.Session) (*models.User, error) {
	user, err := r.userRepo.FindByID(ctx, obj.UserID)
	if err != nil {
		return nil, fmt.Errorf("session user not found: %w", err)
	}
	return &user, nil
}

func (r *sessionResolver) Status(_ context.Context, obj *models.Session) (models.SessionStatus, error) {
	return obj.Status, nil
}

func (r *sessionResolver) TerminationReason(_ context.Context, obj *models.Session) (*models.SessionTerminationReason, error) {
	if obj.TerminationReason == "" {
		return nil, nil
	}
	return &obj.TerminationReason, nil
}

func (r *sessionResolver) LastActivityAt(_ context.Context, obj *models.Session) (string, error) {
	return obj.LastActivityAt.Format(time.RFC3339), nil
}

func (r *sessionResolver) ExpiresAt(_ context.Context, obj *models.Session) (string, error) {
	return obj.ExpiresAt.Format(time.RFC3339), nil
}

func (r *sessionResolver) TerminatedAt(_ context.Context, obj *models.Session) (*string, error) {
	if obj.TerminatedAt == nil {
		return nil, nil
	}
	s := obj.TerminatedAt.Format(time.RFC3339)
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
