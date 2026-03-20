package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/permissions"
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
	log          *zap.Logger
}

func NewAuthController(
	userRepo repository.IUserRepository,
	authProvider auth.IAuthProvider,
	log *zap.Logger,
) IAuthController {
	return &authController{
		userRepo:     userRepo,
		authProvider: authProvider,
		log:          log,
	}
}

// Login authenticates a user with username/password and issues a token pair.
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

	c.JSON(http.StatusOK, responses.AuthResponse{
		AuthToken:    authToken,
		RefreshToken: refreshToken,
		Roles:        user.Roles,
		Username:     user.Username,
		Permissions:  perms,
	})
}

// Refresh rotates the refresh token and issues a new token pair.
func (ctrl *authController) Refresh(c *gin.Context) {
	log := logger.From(c.Request.Context())

	var req requests.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, responses.ErrInvalidInput)
		return
	}

	// RotateRefreshToken atomically validates the old token, generates a new
	// pair, and deletes the old token. If the old token is invalid (possible
	// replay attack), it invalidates ALL sessions for the user.
	newAuthToken, newRefreshToken, err := ctrl.authProvider.RotateRefreshToken(c.Request.Context(), req.UserID, req.RefreshToken)
	if err != nil {
		log.Warn("refresh: rotation failed", zap.String("user_id", req.UserID), zap.Error(err))
		c.JSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	// Look up user for current roles/permissions (may have changed since last login).
	userUUID, err := uuid.Parse(req.UserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.NewErrorResponse("invalid user_id format"))
		return
	}

	user, err := ctrl.userRepo.FindByID(c.Request.Context(), userUUID)
	if err != nil {
		log.Error("refresh: user not found after token rotation", zap.String("user_id", req.UserID))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	perms := permissions.GetPermissionsForRoles(user.Roles)

	log.Info("refresh: success", zap.String("user_id", req.UserID))

	c.JSON(http.StatusOK, responses.AuthResponse{
		AuthToken:    newAuthToken,
		RefreshToken: newRefreshToken,
		Roles:        user.Roles,
		Username:     user.Username,
		Permissions:  perms,
	})
}

// Logout invalidates all refresh tokens for the authenticated user.
func (ctrl *authController) Logout(c *gin.Context) {
	log := logger.From(c.Request.Context())
	userID := c.GetString("userID")

	if err := ctrl.authProvider.InvalidateAllRefreshTokens(c.Request.Context(), userID); err != nil {
		log.Error("logout: failed to invalidate tokens", zap.String("user_id", userID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	log.Info("logout: success", zap.String("user_id", userID))

	c.JSON(http.StatusOK, responses.SuccessResponse{
		Message: "Logout successful. All sessions have been revoked.",
	})
}

// Me returns the current user info with fresh tokens.
func (ctrl *authController) Me(c *gin.Context) {
	log := logger.From(c.Request.Context())

	userID := c.GetString("userID")
	username := c.GetString("username")

	val, _ := c.Get("roles")
	roles, _ := val.([]string)

	authToken, err := ctrl.authProvider.GenerateAuthToken(userID, username, roles)
	if err != nil {
		log.Error("me: failed to generate auth token", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	refreshToken, err := ctrl.authProvider.GenerateRefreshToken(c.Request.Context(), userID, username, roles)
	if err != nil {
		log.Error("me: failed to generate refresh token", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	perms := permissions.GetPermissionsForRoles(roles)

	c.JSON(http.StatusOK, responses.AuthResponse{
		AuthToken:    authToken,
		RefreshToken: refreshToken,
		Roles:        roles,
		Username:     username,
		Permissions:  perms,
	})
}
