package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/cookies"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/permissions"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/logger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/requests"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
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
	userRepo     repository.IUserRepository
	authProvider auth.IAuthProvider
	eventBus     eventbus.IEventBus
	log          *zap.Logger
	isDev        bool
}

func NewAuthController(
	userRepo repository.IUserRepository,
	authProvider auth.IAuthProvider,
	eventBus eventbus.IEventBus,
	log *zap.Logger,
	isDev bool,
) IAuthController {
	return &authController{
		userRepo:     userRepo,
		authProvider: authProvider,
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

	authToken, err := ctrl.authProvider.GenerateAuthToken(userID, user.Username, user.Roles)
	if err != nil {
		log.Error("login: failed to generate auth token", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	refreshToken, err := ctrl.authProvider.GenerateRefreshToken(c.Request.Context(), userID, user.Username, user.Roles)
	if err != nil {
		log.Error("login: failed to generate refresh token", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
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

	// RotateRefreshToken atomically validates the old token, generates a new
	// pair, and deletes the old token. If the old token is invalid (possible
	// replay attack), it invalidates ALL sessions for the user.
	newAuthToken, newRefreshToken, err := ctrl.authProvider.RotateRefreshToken(c.Request.Context(), userID, refreshTokenStr)
	if err != nil {
		log.Warn("refresh: rotation failed", zap.String("user_id", userID), zap.Error(err))
		ctrl.eventBus.Publish(eventbus.NewAuthReplayDetectedEvent(eventbus.UserActor(userID)))
		cookies.ClearAuthCookies(c, ctrl.isDev)
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
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

// Logout invalidates all refresh tokens and clears auth cookies.
//
//	@Summary		Logout
//	@Description	Invalidate all refresh tokens and clear auth cookies.
//	@Tags			Auth
//	@Produce		json
//	@Success		200	{object}	responses.SuccessResponse
//	@Failure		500	{object}	responses.ErrorResponse
//	@Router			/logout [post]
func (ctrl *authController) Logout(c *gin.Context) {
	log := logger.From(c.Request.Context())
	userID := c.GetString("userID")

	if err := ctrl.authProvider.InvalidateAllRefreshTokens(c.Request.Context(), userID); err != nil {
		log.Error("logout: failed to invalidate tokens", zap.String("user_id", userID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	log.Info("logout: success", zap.String("user_id", userID))
	ctrl.eventBus.Publish(eventbus.NewAuthLogoutEvent(eventbus.UserActor(userID)))

	cookies.ClearAuthCookies(c, ctrl.isDev)
	c.JSON(http.StatusOK, responses.SuccessResponse{
		Message: "Logout successful. All sessions have been revoked.",
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
