package controller

import (
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

type authController struct {
	userRepo    repository.IUserRepository
	sessionRepo repository.ISessionRepository
	authProvider auth.IAuthProvider
	tokenStore  auth.TokenStore
	eventBus    eventbus.IEventBus
	log         *zap.Logger
	isDev       bool
}

func NewAuthController(
	userRepo repository.IUserRepository,
	sessionRepo repository.ISessionRepository,
	authProvider auth.IAuthProvider,
	tokenStore auth.TokenStore,
	eventBus eventbus.IEventBus,
	log *zap.Logger,
	isDev bool,
) IAuthController {
	return &authController{
		userRepo:     userRepo,
		sessionRepo:  sessionRepo,
		authProvider: authProvider,
		tokenStore:   tokenStore,
		eventBus:     eventBus,
		log:          log,
		isDev:        isDev,
	}
}

// Login authenticates a user with username/password and sets auth cookies.
//
//	@Summary		Login
//	@Description	Authenticate with username and password. Tokens are set as httpOnly cookies.
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
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("account is inactive"))
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		log.Warn("login: bad password", zap.String("username", req.Username))
		c.JSON(http.StatusBadRequest, responses.ErrInvalidCredentials)
		return
	}

	userID := user.UserID.String()
	sessionID := uuid.New()

	authToken, err := ctrl.authProvider.GenerateAuthToken(userID, user.Username, user.Roles, sessionID.String())
	if err != nil {
		log.Error("login: failed to generate auth token", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	refreshToken, evictedHash, err := ctrl.authProvider.GenerateRefreshToken(c.Request.Context(), userID, user.Username, user.Roles)
	if err != nil {
		log.Error("login: failed to generate refresh token", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	// Mark the evicted session in MongoDB (if max sessions was reached)
	if evictedHash != "" {
		if err := ctrl.sessionRepo.TerminateByTokenHash(c.Request.Context(), evictedHash, models.TerminationEvicted); err != nil {
			log.Warn("login: failed to mark evicted session", zap.Error(err))
		}
	}

	// Create persistent session record in MongoDB
	meta := session.Extract(c)
	now := time.Now().UTC()
	sess := &models.Session{
		SessionID:      sessionID,
		UserID:         user.UserID,
		TokenHash:      auth.HashToken(refreshToken),
		IPAddress:      meta.IPAddress,
		UserAgent:      meta.UserAgent,
		Browser:        meta.Browser,
		OS:             meta.OS,
		Device:         meta.Device,
		Status:         models.SessionStatusActive,
		LastActivityAt: now,
		ExpiresAt:      now.Add(auth.TTLRefreshToken),
	}
	if err := ctrl.sessionRepo.Create(c.Request.Context(), sess); err != nil {
		log.Error("login: failed to create session record", zap.Error(err))
		// Non-fatal: auth tokens were already issued. Log and continue.
	} else {
		ctrl.eventBus.Publish(eventbus.NewSessionCreatedEvent(eventbus.UserActor(userID), eventbus.SessionEventPayload{
			SessionID: sess.SessionID.String(), UserID: userID,
		}))
	}

	perms := permissions.GetPermissionsForRoles(user.Roles)

	log.Info("login: success", zap.String("user_id", userID))
	ctrl.eventBus.Publish(eventbus.NewAuthLoginEvent(eventbus.UserActor(userID), eventbus.AuthEventPayload{
		UserID: userID, Username: user.Username,
	}))

	cookies.SetAuthCookies(c, authToken, refreshToken, ctrl.authProvider.AuthTokenTTL(), ctrl.isDev)
	c.JSON(http.StatusOK, responses.SessionResponse{
		UserID:      userID,
		Roles:       user.Roles,
		Username:    user.Username,
		Permissions: perms,
	})
}

// Refresh rotates the refresh token and issues new auth cookies.
// Both the access token (possibly expired) and refresh token are read from cookies.
//
//	@Summary		Refresh tokens
//	@Description	Rotate the refresh token. Reads tokens from httpOnly cookies.
//	@Tags			Auth
//	@Produce		json
//	@Success		200	{object}	responses.SessionResponse
//	@Failure		401	{object}	responses.ErrorResponse
//	@Failure		500	{object}	responses.ErrorResponse
//	@Router			/login/refresh [post]
func (ctrl *authController) Refresh(c *gin.Context) {
	log := logger.From(c.Request.Context())

	// Read the expired access token to extract the userID.
	accessTokenStr, err := c.Cookie(cookies.AccessTokenCookie)
	if err != nil || accessTokenStr == "" {
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	claims, err := ctrl.authProvider.ParseAuthTokenUnvalidated(accessTokenStr)
	if err != nil {
		log.Warn("refresh: failed to parse access token", zap.Error(err))
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}
	userID := claims.Subject

	// Read the refresh token from its dedicated cookie.
	refreshTokenStr, err := c.Cookie(cookies.RefreshTokenCookie)
	if err != nil || refreshTokenStr == "" {
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	// Compute old token hash before rotation so we can update the MongoDB session.
	oldTokenHash := auth.HashToken(refreshTokenStr)

	// Look up the session ID to embed in the new JWT.
	var currentSessionID string
	if sess, err := ctrl.sessionRepo.FindByTokenHash(c.Request.Context(), oldTokenHash); err == nil {
		currentSessionID = sess.SessionID.String()
	}

	// RotateRefreshToken validates the old token, deletes it, and generates a new
	// pair. If the old token is invalid (possible replay attack), it invalidates
	// ALL sessions for the user.
	newAuthToken, newRefreshToken, err := ctrl.authProvider.RotateRefreshToken(c.Request.Context(), userID, refreshTokenStr, currentSessionID)
	if err != nil {
		log.Warn("refresh: rotation failed", zap.String("user_id", userID), zap.Error(err))
		ctrl.eventBus.Publish(eventbus.NewAuthReplayDetectedEvent(eventbus.UserActor(userID)))
		// Mark all MongoDB sessions as terminated due to replay detection
		if userUUID, parseErr := uuid.Parse(userID); parseErr == nil {
			if _, termErr := ctrl.sessionRepo.TerminateAllForUser(c.Request.Context(), userUUID, models.TerminationReplayDetected); termErr != nil {
				log.Warn("refresh: failed to terminate sessions on replay", zap.Error(termErr))
			}
		}
		cookies.ClearAuthCookies(c, ctrl.isDev)
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	// Update the MongoDB session: swap token hash and bump activity/expiry
	newTokenHash := auth.HashToken(newRefreshToken)
	if err := ctrl.sessionRepo.UpdateOnRefresh(c.Request.Context(), oldTokenHash, newTokenHash, time.Now().UTC().Add(auth.TTLRefreshToken)); err != nil {
		log.Warn("refresh: failed to update session record", zap.Error(err))
	} else {
		ctrl.eventBus.Publish(eventbus.NewSessionRefreshedEvent(eventbus.UserActor(userID), eventbus.SessionEventPayload{
			UserID: userID,
		}))
	}

	// Look up user for current roles/permissions (may have changed since last login).
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid user_id format"))
		return
	}

	user, err := ctrl.userRepo.FindByID(c.Request.Context(), userUUID)
	if err != nil {
		log.Error("refresh: user not found after token rotation", zap.String("user_id", userID))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	perms := permissions.GetPermissionsForRoles(user.Roles)

	log.Info("refresh: success", zap.String("user_id", userID))
	ctrl.eventBus.Publish(eventbus.NewAuthRefreshEvent(eventbus.UserActor(userID)))

	cookies.SetAuthCookies(c, newAuthToken, newRefreshToken, ctrl.authProvider.AuthTokenTTL(), ctrl.isDev)
	c.JSON(http.StatusOK, responses.SessionResponse{
		UserID:      userID,
		Roles:       user.Roles,
		Username:    user.Username,
		Permissions: perms,
	})
}

// Logout terminates the current session and clears auth cookies.
//
//	@Summary		Logout
//	@Description	Terminate the current session and clear auth cookies.
//	@Tags			Auth
//	@Produce		json
//	@Success		200	{object}	responses.SuccessResponse
//	@Failure		500	{object}	responses.ErrorResponse
//	@Router			/logout [post]
func (ctrl *authController) Logout(c *gin.Context) {
	log := logger.From(c.Request.Context())
	userID := c.GetString("userID")
	currentSessionID := c.GetString("sessionID")

	if currentSessionID != "" {
		// Use the session ID from the JWT to identify and terminate the current session.
		sessionUUID, err := uuid.Parse(currentSessionID)
		if err != nil {
			log.Warn("logout: invalid session ID in token", zap.String("session_id", currentSessionID), zap.Error(err))
		} else {
			sess, err := ctrl.sessionRepo.FindByID(c.Request.Context(), sessionUUID)
			if err != nil {
				log.Warn("logout: session not found", zap.String("session_id", currentSessionID), zap.Error(err))
			} else if sess.Status == models.SessionStatusActive {
				// Delete refresh token from Redis by hash
				if err := ctrl.tokenStore.DeleteByTokenHash(c.Request.Context(), userID, sess.TokenHash); err != nil {
					log.Warn("logout: failed to delete refresh token", zap.Error(err))
				}
				// Mark session as terminated in MongoDB
				if err := ctrl.sessionRepo.Terminate(c.Request.Context(), sessionUUID, models.TerminationLogout); err != nil {
					log.Warn("logout: failed to terminate session", zap.Error(err))
				}
				ctrl.eventBus.Publish(eventbus.NewSessionTerminatedEvent(eventbus.UserActor(userID), eventbus.SessionEventPayload{
					SessionID: currentSessionID, UserID: userID, Reason: string(models.TerminationLogout),
				}))
			}
		}
	} else {
		// No session ID in JWT (legacy token before session support) — invalidate all.
		if err := ctrl.authProvider.InvalidateAllRefreshTokens(c.Request.Context(), userID); err != nil {
			log.Error("logout: failed to invalidate tokens", zap.String("user_id", userID), zap.Error(err))
			c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
			return
		}
		if userUUID, parseErr := uuid.Parse(userID); parseErr == nil {
			if _, err := ctrl.sessionRepo.TerminateAllForUser(c.Request.Context(), userUUID, models.TerminationLogout); err != nil {
				log.Warn("logout: failed to terminate all session records", zap.Error(err))
			}
		}
	}

	log.Info("logout: success", zap.String("user_id", userID))
	ctrl.eventBus.Publish(eventbus.NewAuthLogoutEvent(eventbus.UserActor(userID)))

	cookies.ClearAuthCookies(c, ctrl.isDev)
	c.JSON(http.StatusOK, responses.SuccessResponse{
		Message: "Logout successful.",
	})
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

	perms := permissions.GetPermissionsForRoles(roles)

	c.JSON(http.StatusOK, responses.SessionResponse{
		UserID:      userID,
		Roles:       roles,
		Username:    username,
		Permissions: perms,
	})
}
