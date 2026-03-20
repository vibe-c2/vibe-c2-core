package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/permissions"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/logger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/requests"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"go.uber.org/zap"
)

type IEnrollController interface {
	Enroll(c *gin.Context)
}

type enrollController struct {
	userRepo     repository.IUserRepository
	authProvider auth.IAuthProvider
	log          *zap.Logger
}

func NewEnrollController(
	userRepo repository.IUserRepository,
	authProvider auth.IAuthProvider,
	log *zap.Logger,
) IEnrollController {
	return &enrollController{
		userRepo:     userRepo,
		authProvider: authProvider,
		log:          log,
	}
}

// Enroll creates the first admin user on a fresh system with no existing users.
//
//	@Summary		Enroll first admin
//	@Description	Create the initial admin account. Only works when no users exist (cold startup).
//	@Tags			Enrollment
//	@Accept			json
//	@Produce		json
//	@Param			body	body		requests.EnrollRequest	true	"Admin credentials"
//	@Success		200		{object}	responses.AuthResponse
//	@Failure		400		{object}	responses.ErrorResponse
//	@Failure		409		{object}	responses.ErrorResponse
//	@Failure		500		{object}	responses.ErrorResponse
//	@Router			/enroll [post]
func (ctrl *enrollController) Enroll(c *gin.Context) {
	log := logger.From(c.Request.Context())

	count, err := ctrl.userRepo.Count(c.Request.Context(), "")
	if err != nil {
		log.Error("enroll: failed to count users", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	if count > 0 {
		c.JSON(http.StatusConflict, responses.NewErrorResponse("enrollment already completed"))
		return
	}

	var req requests.EnrollRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, responses.ErrInvalidInput)
		return
	}

	hashedPassword, err := auth.HashPassword(req.Password)
	if err != nil {
		log.Error("enroll: failed to hash password", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	user := &models.User{
		UserID:   uuid.New(),
		Username: req.Username,
		Password: hashedPassword,
		Roles:    []string{"admin"},
		Active:   true,
	}

	if err := ctrl.userRepo.Create(c.Request.Context(), user); err != nil {
		log.Error("enroll: failed to create admin user", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	userID := user.UserID.String()

	authToken, err := ctrl.authProvider.GenerateAuthToken(userID, user.Username, user.Roles)
	if err != nil {
		log.Error("enroll: failed to generate auth token", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	refreshToken, err := ctrl.authProvider.GenerateRefreshToken(c.Request.Context(), userID, user.Username, user.Roles)
	if err != nil {
		log.Error("enroll: failed to generate refresh token", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	perms := permissions.GetPermissionsForRoles(user.Roles)

	log.Info("enroll: first admin created", zap.String("username", user.Username))

	c.JSON(http.StatusOK, responses.AuthResponse{
		AuthToken:    authToken,
		RefreshToken: refreshToken,
		Roles:        user.Roles,
		Username:     user.Username,
		Permissions:  perms,
	})
}
