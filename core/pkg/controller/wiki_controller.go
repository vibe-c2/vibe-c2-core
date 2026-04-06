package controller

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/authorization"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"go.uber.org/zap"
)

// WikiController handles wiki REST endpoints (collab ticket issuance).
type WikiController struct {
	docRepo       repository.IWikiDocumentRepository
	operationRepo repository.IOperationRepository
	ticketSecret  string
	logger        *zap.Logger
}

// NewWikiController creates a new wiki controller.
func NewWikiController(
	docRepo repository.IWikiDocumentRepository,
	operationRepo repository.IOperationRepository,
	ticketSecret string,
	logger *zap.Logger,
) *WikiController {
	return &WikiController{
		docRepo:       docRepo,
		operationRepo: operationRepo,
		ticketSecret:  ticketSecret,
		logger:        logger,
	}
}

type collabTicketRequest struct {
	DocumentID string `json:"documentId" binding:"required"`
}

type collabTicketResponse struct {
	Ticket string `json:"ticket"`
}

// CollabTicket issues a short-lived collab ticket for Hocuspocus WebSocket authentication.
// The ticket is a JWT signed with HOCUSPOCUS_TICKET_SECRET containing the user's identity
// and authorization context. Hocuspocus verifies the signature — no DB query needed.
//
//	@Summary		Get collaboration ticket
//	@Description	Issue a short-lived JWT for Hocuspocus WebSocket authentication
//	@Tags			Wiki
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			request body collabTicketRequest true "Document to collaborate on"
//	@Router			/wiki/collab-ticket [post]
func (wc *WikiController) CollabTicket(c *gin.Context) {
	var req collabTicketRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, responses.ErrorResponse{Error: "documentId is required"})
		return
	}

	docUID, err := uuid.Parse(req.DocumentID)
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.ErrorResponse{Error: "invalid document ID"})
		return
	}

	// Load the document
	doc, err := wc.docRepo.FindByID(c.Request.Context(), docUID)
	if err != nil {
		c.JSON(http.StatusNotFound, responses.ErrorResponse{Error: "document not found"})
		return
	}

	if doc.DeletedAt != nil {
		c.JSON(http.StatusForbidden, responses.ErrorResponse{Error: "cannot edit a deleted document"})
		return
	}

	// Check operation membership (role >= operator)
	op, err := wc.operationRepo.FindByID(c.Request.Context(), doc.OperationID)
	if err != nil {
		c.JSON(http.StatusNotFound, responses.ErrorResponse{Error: "operation not found"})
		return
	}

	// Build auth info from Gin context (set by JWTAuth middleware)
	roles, _ := c.Get("roles")
	rolesSlice, _ := roles.([]string)
	ctx := gqlctx.WithAuthInfo(c.Request.Context(), gqlctx.AuthInfo{
		UserID:   c.GetString("userID"),
		Username: c.GetString("username"),
		Roles:    rolesSlice,
	})

	// Viewers are allowed to connect (they see live updates) but their
	// connection is flagged read-only via the ticket claim below.
	if err := authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleViewer); err != nil {
		c.JSON(http.StatusForbidden, responses.ErrorResponse{Error: "not a member of this operation"})
		return
	}

	// Determine write capability: operator+ in the operation, or app-admin.
	// App-admins always get write access regardless of membership.
	canWrite := false
	for _, r := range rolesSlice {
		if r == "admin" {
			canWrite = true
			break
		}
	}
	if !canWrite {
		callerUID, err := uuid.Parse(c.GetString("userID"))
		if err == nil {
			for _, m := range op.Members {
				if m.UserID == callerUID {
					if m.Role.HasAtLeast(models.OperationRoleOperator) {
						canWrite = true
					}
					break
				}
			}
		}
	}

	// Sign a short-lived collab ticket. The readOnly claim is read by
	// Hocuspocus onAuthenticate to set connection.readOnly, so even a
	// tampered client cannot produce Y.js updates when not authorized.
	now := time.Now().UTC()
	claims := jwt.MapClaims{
		"userId":      c.GetString("userID"),
		"username":    c.GetString("username"),
		"operationId": doc.OperationID.String(),
		"documentId":  doc.DocumentID.String(),
		"readOnly":    !canWrite,
		"iat":         now.Unix(),
		"exp":         now.Add(30 * time.Second).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	ticket, err := token.SignedString([]byte(wc.ticketSecret))
	if err != nil {
		wc.logger.Error("Failed to sign collab ticket", zap.Error(err))
		c.JSON(http.StatusInternalServerError, responses.ErrorResponse{Error: "failed to issue ticket"})
		return
	}

	c.JSON(http.StatusOK, collabTicketResponse{Ticket: ticket})
}
