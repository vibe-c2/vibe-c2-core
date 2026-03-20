package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/logger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"go.uber.org/zap"
)

type IStatusController interface {
	Status(c *gin.Context)
}

type statusController struct {
	userRepo repository.IUserRepository
	log      *zap.Logger
}

func NewStatusController(
	userRepo repository.IUserRepository,
	log *zap.Logger,
) IStatusController {
	return &statusController{
		userRepo: userRepo,
		log:      log,
	}
}

// Status returns the current system state.
//
//	@Summary		System status
//	@Description	Returns system state including whether initial enrollment has been completed.
//	@Tags			Status
//	@Produce		json
//	@Success		200	{object}	responses.StatusResponse
//	@Failure		500	{object}	responses.ErrorResponse
//	@Router			/status [get]
func (ctrl *statusController) Status(c *gin.Context) {
	log := logger.From(c.Request.Context())

	count, err := ctrl.userRepo.Count(c.Request.Context(), "")
	if err != nil {
		log.Error("status: failed to count users", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrInternalError)
		return
	}

	c.JSON(http.StatusOK, responses.StatusResponse{
		Enrolled: count > 0,
	})
}
