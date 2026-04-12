package controller

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/cookies"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/permissions"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/logger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/requests"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/session"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

type IAuthController interface {
	Login(c *gin.Context)
	Refresh(c *gin.Context)
	Logout(c *gin.Context)
	Me(c *gin.Context)
}

// AuthControllerConfig groups the durations and flags the auth controller
// needs. Mirrors the relevant subset of environment.AuthConfig.
type AuthControllerConfig struct {
	RefreshTTL         time.Duration
	RefreshGraceTTL    time.Duration
	GraceEncryptionKey []byte // 32-byte AES-256 key for grace shadow payloads
	IsDev              bool
}

type authController struct {
	userRepo     repository.IUserRepository
	sessionRepo  repository.ISessionRepository
	authProvider auth.IAuthProvider
	tokenStore   auth.TokenStore
	eventBus     eventbus.IEventBus
	log          *zap.Logger
	cfg          AuthControllerConfig
}

func NewAuthController(
	userRepo repository.IUserRepository,
	sessionRepo repository.ISessionRepository,
	authProvider auth.IAuthProvider,
	tokenStore auth.TokenStore,
	eventBus eventbus.IEventBus,
	log *zap.Logger,
	cfg AuthControllerConfig,
) IAuthController {
	return &authController{
		userRepo:     userRepo,
		sessionRepo:  sessionRepo,
		authProvider: authProvider,
		tokenStore:   tokenStore,
		eventBus:     eventBus,
		log:          log,
		cfg:          cfg,
	}
}

// Login authenticates a user with username/password and sets auth cookies.
//
//	@Summary		Login
//	@Description	Authenticate with username and password. Tokens are set as httpOnly cookies; CSRF token in a non-httpOnly cookie.
//	@Tags			Auth
//	@Accept			json
//	@Produce		json
//	@Param			body	body		requests.LoginRequest	true	"Login credentials"
//	@Success		200		{object}	responses.SessionResponse
//	@Failure		400		{object}	responses.ErrorResponse
//	@Failure		500		{object}	responses.ErrorResponse
//	@Router			/login [post]
func (ctrl *authController) Login(c *gin.Context) {
	log := logger.From(c.Request.Context())

	var req requests.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, responses.ErrInvalidCredentials)
		return
	}

	user, err := ctrl.userRepo.FindByUsername(c.Request.Context(), req.Username)
	if err != nil {
		log.Warn("login: user not found", zap.String("username", req.Username))
		c.JSON(http.StatusBadRequest, responses.ErrInvalidCredentials)
		return
	}

	if !user.Active {
		log.Warn("login: inactive account", zap.String("username", req.Username))
		c.JSON(http.StatusBadRequest, responses.ErrInvalidCredentials)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		log.Warn("login: bad password", zap.String("username", req.Username))
		c.JSON(http.StatusBadRequest, responses.ErrInvalidCredentials)
		return
	}

	resp, err := IssueSession(
		c, ctrl.authProvider, ctrl.tokenStore, ctrl.sessionRepo, ctrl.eventBus,
		&user, ctrl.cfg,
	)
	if err != nil {
		log.Error("login: failed to issue session", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	log.Info("login: success", zap.String("user_id", user.UserID.String()))
	ctrl.eventBus.Publish(eventbus.NewAuthLoginEvent(eventbus.UserActor(user.UserID.String()), eventbus.AuthEventPayload{
		UserID: user.UserID.String(), Username: user.Username,
	}))

	c.JSON(http.StatusOK, resp)
}

// Refresh rotates the refresh token and issues new auth cookies.
//
//	@Summary		Refresh tokens
//	@Description	Rotate the refresh token. Reads tokens from httpOnly cookies. Requires X-CSRF-Token header matching the csrf_token cookie.
//	@Tags			Auth
//	@Produce		json
//	@Success		200	{object}	responses.SessionResponse
//	@Failure		401	{object}	responses.ErrorResponse
//	@Failure		500	{object}	responses.ErrorResponse
//	@Router			/login/refresh [post]
func (ctrl *authController) Refresh(c *gin.Context) {
	log := logger.From(c.Request.Context())

	rawRefresh, err := c.Cookie(cookies.RefreshTokenCookie)
	if err != nil || rawRefresh == "" {
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	// The user_id is baked into the refresh token itself (see
	// auth.MintRefreshToken), so /login/refresh does not need the access
	// JWT to know which Redis key to CAS.
	userID, oldHash, ok := auth.ParseRefreshToken(rawRefresh)
	if !ok {
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	// Phase 1: attempt normal rotation.
	newRaw, sessionID, rotated := ctrl.tryRotate(c, log, userID, oldHash)

	// Phase 2: if rotation failed because the old hash is gone (loser of a
	// multi-tab race), check the grace shadow written by the winner.
	if !rotated {
		newRaw, sessionID, ok = ctrl.tryGraceLookup(c, log, userID, oldHash)
		if !ok {
			return // response already written
		}
	}

	ctrl.completeRefresh(c, log, userID, sessionID, newRaw)
}

// tryRotate performs the normal atomic CAS rotation. On success it also
// writes a short-lived grace shadow so that other tabs presenting the same
// old hash within the grace window receive the same new token.
// Returns ("", uuid.Nil, false) if the old hash is already gone.
func (ctrl *authController) tryRotate(c *gin.Context, log *zap.Logger, userID uuid.UUID, oldHash string) (newRaw string, sessionID uuid.UUID, ok bool) {
	newRaw, newHash, err := auth.MintRefreshToken(userID)
	if err != nil {
		log.Error("refresh: mint refresh token", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return "", uuid.Nil, false
	}

	sessionID, err = ctrl.tokenStore.Rotate(c.Request.Context(), userID, oldHash, newHash, ctrl.cfg.RefreshTTL)
	if err != nil {
		if errors.Is(err, auth.ErrTokenInvalid) {
			// Old hash gone — caller should fall through to grace lookup.
			return "", uuid.Nil, false
		}
		log.Error("refresh: rotate failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return "", uuid.Nil, false
	}

	// Best-effort: write a grace shadow so the loser of the race can
	// retrieve the same new token. Failures are logged but do not
	// block the primary refresh response.
	if ctrl.cfg.RefreshGraceTTL > 0 {
		encrypted, encErr := auth.EncryptGrace(ctrl.cfg.GraceEncryptionKey, []byte(newRaw))
		if encErr != nil {
			log.Warn("refresh: grace encrypt failed", zap.Error(encErr))
		} else {
			payload := auth.GracePayload{
				NewRawEncrypted: encrypted,
				NewHash:         newHash,
				SessionID:       sessionID,
			}
			if saveErr := ctrl.tokenStore.SaveGrace(c.Request.Context(), userID, oldHash, payload, ctrl.cfg.RefreshGraceTTL); saveErr != nil {
				log.Warn("refresh: save grace failed", zap.Error(saveErr))
			}
		}
	}

	return newRaw, sessionID, true
}

// tryGraceLookup checks the grace shadow written by the rotation winner.
// Returns the new raw token and session ID on success, or writes the error
// response and returns ("", uuid.Nil, false).
func (ctrl *authController) tryGraceLookup(c *gin.Context, log *zap.Logger, userID uuid.UUID, oldHash string) (string, uuid.UUID, bool) {
	if ctrl.cfg.RefreshGraceTTL <= 0 {
		log.Warn("refresh: token rejected (no grace period)", zap.Stringer("user_id", userID))
		cookies.ClearAuthCookies(c, ctrl.cfg.IsDev)
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return "", uuid.Nil, false
	}

	payload, err := ctrl.tokenStore.LookupGrace(c.Request.Context(), userID, oldHash)
	if err != nil {
		log.Warn("refresh: token rejected (grace miss)", zap.Stringer("user_id", userID), zap.Error(err))
		cookies.ClearAuthCookies(c, ctrl.cfg.IsDev)
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return "", uuid.Nil, false
	}

	// Decrypt the raw refresh token from the grace payload.
	decrypted, err := auth.DecryptGrace(ctrl.cfg.GraceEncryptionKey, payload.NewRawEncrypted)
	if err != nil {
		log.Error("refresh: grace decrypt failed", zap.Error(err))
		cookies.ClearAuthCookies(c, ctrl.cfg.IsDev)
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return "", uuid.Nil, false
	}

	// Integrity check: the decrypted raw token must hash to the stored hash.
	newRaw := string(decrypted)
	if auth.HashToken(newRaw) != payload.NewHash {
		log.Error("refresh: grace hash mismatch", zap.Stringer("user_id", userID))
		cookies.ClearAuthCookies(c, ctrl.cfg.IsDev)
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return "", uuid.Nil, false
	}

	log.Info("refresh: grace hit (multi-tab race resolved)",
		zap.Stringer("user_id", userID),
		zap.Stringer("session_id", payload.SessionID))

	return newRaw, payload.SessionID, true
}

// completeRefresh is the shared tail of a successful refresh — re-reads the
// user, mints a new access JWT, sets cookies, publishes events, and writes
// the JSON response.
func (ctrl *authController) completeRefresh(c *gin.Context, log *zap.Logger, userID, sessionID uuid.UUID, newRaw string) {
	user, err := ctrl.userRepo.FindByID(c.Request.Context(), userID)
	if err != nil {
		log.Error("refresh: user not found after rotation", zap.Stringer("user_id", userID))
		cookies.ClearAuthCookies(c, ctrl.cfg.IsDev)
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}
	if !user.Active {
		log.Warn("refresh: user inactive", zap.Stringer("user_id", userID))
		cookies.ClearAuthCookies(c, ctrl.cfg.IsDev)
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	newAccess, err := ctrl.authProvider.GenerateAuthToken(userID.String(), user.Username, user.Roles, sessionID.String())
	if err != nil {
		log.Error("refresh: generate access token", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	csrfToken, err := auth.GenerateCSRFToken()
	if err != nil {
		log.Error("refresh: csrf gen", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	cookies.SetAuthCookies(c, newAccess, newRaw, ctrl.cfg.RefreshTTL, ctrl.cfg.IsDev)
	cookies.SetCSRFCookie(c, csrfToken, ctrl.cfg.RefreshTTL, ctrl.cfg.IsDev)

	log.Info("refresh: success",
		zap.Stringer("user_id", userID),
		zap.Stringer("session_id", sessionID))
	ctrl.eventBus.Publish(eventbus.NewAuthRefreshEvent(eventbus.UserActor(userID.String())))
	ctrl.eventBus.Publish(eventbus.NewSessionRefreshedEvent(eventbus.UserActor(userID.String()), eventbus.SessionEventPayload{
		SessionID: sessionID.String(), UserID: userID.String(),
	}))

	c.JSON(http.StatusOK, responses.SessionResponse{
		UserID:      userID.String(),
		Roles:       user.Roles,
		Username:    user.Username,
		Permissions: permissions.GetPermissionsForRoles(user.Roles),
	})
}

// Logout terminates the current session and clears auth cookies.
//
//	@Summary		Logout
//	@Description	Terminate the current session and clear auth cookies. Requires X-CSRF-Token header.
//	@Tags			Auth
//	@Produce		json
//	@Success		200	{object}	responses.SuccessResponse
//	@Failure		500	{object}	responses.ErrorResponse
//	@Router			/logout [post]
func (ctrl *authController) Logout(c *gin.Context) {
	log := logger.From(c.Request.Context())
	userIDStr := c.GetString("userID")
	sessionIDStr := c.GetString("sessionID")

	userID, _ := uuid.Parse(userIDStr)
	sessionID, _ := uuid.Parse(sessionIDStr)

	if userID != uuid.Nil && sessionID != uuid.Nil {
		_, err := ctrl.tokenStore.DeleteBySessionID(c.Request.Context(), userID, sessionID)
		if err != nil && !errors.Is(err, auth.ErrTokenInvalid) {
			log.Warn("logout: delete redis session", zap.Error(err))
		}
		ctrl.eventBus.Publish(eventbus.NewSessionTerminatedEvent(eventbus.UserActor(userIDStr), eventbus.SessionEventPayload{
			SessionID: sessionIDStr, UserID: userIDStr, Reason: "logout",
		}))
	}

	log.Info("logout: success", zap.String("user_id", userIDStr))
	ctrl.eventBus.Publish(eventbus.NewAuthLogoutEvent(eventbus.UserActor(userIDStr)))

	cookies.ClearAuthCookies(c, ctrl.cfg.IsDev)
	c.JSON(http.StatusOK, responses.SuccessResponse{Message: "Logout successful."})
}

// Me returns the current user's session info.
//
//	@Summary		Current user
//	@Description	Return the authenticated user's info.
//	@Tags			Auth
//	@Produce		json
//	@Success		200	{object}	responses.SessionResponse
//	@Failure		500	{object}	responses.ErrorResponse
//	@Router			/login/me [get]
func (ctrl *authController) Me(c *gin.Context) {
	userID := c.GetString("userID")
	username := c.GetString("username")

	val, _ := c.Get("roles")
	roles, _ := val.([]string)

	c.JSON(http.StatusOK, responses.SessionResponse{
		UserID:      userID,
		Roles:       roles,
		Username:    username,
		Permissions: permissions.GetPermissionsForRoles(roles),
	})
}

// IssueSession is the shared session-creation flow used by Login and
// Enroll. It writes the Mongo creation row, mints an access JWT and an
// opaque refresh token, persists the active session in Redis, sets the
// auth + CSRF cookies, and returns the response payload. The caller is
// still responsible for publishing the per-flow auth event (LoginEvent /
// EnrollEvent).
//
// Mongo is written *first* — if it fails the login fails and no Redis
// state is created, so we never end up with a live Redis session that
// has no audit row.
func IssueSession(
	c *gin.Context,
	provider auth.IAuthProvider,
	store auth.TokenStore,
	sessionRepo repository.ISessionRepository,
	bus eventbus.IEventBus,
	user *models.User,
	cfg AuthControllerConfig,
) (responses.SessionResponse, error) {
	ctx := c.Request.Context()
	userID := user.UserID
	sessionID := uuid.New()
	meta := session.Extract(c)

	// Insert-once Mongo creation row.
	row := &models.Session{
		SessionID: sessionID,
		UserID:    userID,
		IPAddress: meta.IPAddress,
		UserAgent: meta.UserAgent,
		Browser:   meta.Browser,
		OS:        meta.OS,
		Device:    meta.Device,
	}
	if err := sessionRepo.Insert(ctx, row); err != nil {
		return responses.SessionResponse{}, err
	}

	rawRefresh, tokenHash, err := auth.MintRefreshToken(userID)
	if err != nil {
		return responses.SessionResponse{}, err
	}

	if err := store.Create(ctx, userID, sessionID, tokenHash, cfg.RefreshTTL); err != nil {
		return responses.SessionResponse{}, err
	}

	accessToken, err := provider.GenerateAuthToken(userID.String(), user.Username, user.Roles, sessionID.String())
	if err != nil {
		// Roll back the Redis entry so we don't leave a session the
		// caller can never use. The Mongo row stays — it's a creation
		// log and the session did get created.
		_, _ = store.DeleteBySessionID(ctx, userID, sessionID)
		return responses.SessionResponse{}, err
	}

	csrfToken, err := auth.GenerateCSRFToken()
	if err != nil {
		_, _ = store.DeleteBySessionID(ctx, userID, sessionID)
		return responses.SessionResponse{}, err
	}

	cookies.SetAuthCookies(c, accessToken, rawRefresh, cfg.RefreshTTL, cfg.IsDev)
	cookies.SetCSRFCookie(c, csrfToken, cfg.RefreshTTL, cfg.IsDev)

	bus.Publish(eventbus.NewSessionCreatedEvent(eventbus.UserActor(userID.String()), eventbus.SessionEventPayload{
		SessionID: sessionID.String(), UserID: userID.String(),
	}))

	return responses.SessionResponse{
		UserID:      userID.String(),
		Roles:       user.Roles,
		Username:    user.Username,
		Permissions: permissions.GetPermissionsForRoles(user.Roles),
	}, nil
}
