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
	RefreshTTL time.Duration
	IsDev      bool
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

	// Mint the new refresh token first so we can pass its hash into the CAS.
	newRaw, newHash, err := auth.MintRefreshToken(userID)
	if err != nil {
		log.Error("refresh: mint refresh token", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	// Atomic Redis CAS. The script preserves the embedded session_id and
	// returns it. NOTFOUND is the loser-of-race / replay signal — clear
	// cookies and return 401 with no audit write.
	sessionID, err := ctrl.tokenStore.Rotate(c.Request.Context(), userID, oldHash, newHash, ctrl.cfg.RefreshTTL)
	if err != nil {
		if errors.Is(err, auth.ErrTokenInvalid) {
			log.Warn("refresh: token rejected", zap.Stringer("user_id", userID))
			cookies.ClearAuthCookies(c, ctrl.cfg.IsDev)
			c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
			return
		}
		log.Error("refresh: rotate failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	// Re-read the user from Mongo so role/username changes propagate within
	// one access-TTL window. The Mongo lookup is cheap and refresh is not
	// the hot path.
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
