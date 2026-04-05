package wiki

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"go.uber.org/zap"
)

// WebhookHandler processes webhook callbacks from the Hocuspocus sidecar.
// Events: onChange (content persisted), onConnect/onDisconnect (presence changes).
// Validates HMAC-SHA256 signature on each request.
type WebhookHandler struct {
	presenceTracker *PresenceTracker
	eventBus        eventbus.IEventBus
	webhookSecret   string
	logger          *zap.Logger
}

// NewWebhookHandler creates a new webhook handler.
func NewWebhookHandler(
	presenceTracker *PresenceTracker,
	eventBus eventbus.IEventBus,
	webhookSecret string,
	logger *zap.Logger,
) *WebhookHandler {
	return &WebhookHandler{
		presenceTracker: presenceTracker,
		eventBus:        eventBus,
		webhookSecret:   webhookSecret,
		logger:          logger,
	}
}

// webhookPayload is the JSON payload sent by Hocuspocus webhooks.
type webhookPayload struct {
	Event       string `json:"event"`
	DocumentID  string `json:"documentId"`
	OperationID string `json:"operationId"`
	UserID      string `json:"userId"`
	Username    string `json:"username"`
}

// Handle is the Gin handler for POST /api/v1/internal/wiki/webhook.
func (h *WebhookHandler) Handle(c *gin.Context) {
	// Read body for HMAC validation
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.ErrorResponse{Error: "failed to read body"})
		return
	}

	// Validate HMAC-SHA256 signature
	if h.webhookSecret != "" {
		signature := c.GetHeader("X-Hocuspocus-Signature-256")
		if !h.verifySignature(body, signature) {
			c.JSON(http.StatusUnauthorized, responses.ErrorResponse{Error: "invalid signature"})
			return
		}
	}

	// Parse payload
	var payload webhookPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		// Re-bind from the raw body since we already consumed the reader
		// Use gin's built-in binding which reads from the body buffer
		c.JSON(http.StatusBadRequest, responses.ErrorResponse{Error: "invalid payload"})
		return
	}

	switch payload.Event {
	case "onChange":
		h.handleOnChange(payload)
	case "onConnect":
		h.handleOnConnect(payload)
	case "onDisconnect":
		h.handleOnDisconnect(payload)
	default:
		h.logger.Debug("Unknown webhook event", zap.String("event", payload.Event))
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *WebhookHandler) handleOnChange(p webhookPayload) {
	h.eventBus.Publish(eventbus.NewWikiDocumentUpdatedEvent(
		eventbus.ServiceActor("hocuspocus"),
		eventbus.WikiDocumentEventPayload{
			DocumentID:  p.DocumentID,
			OperationID: p.OperationID,
		},
	))
}

func (h *WebhookHandler) handleOnConnect(p webhookPayload) {
	docUID, err := uuid.Parse(p.DocumentID)
	if err != nil {
		return
	}
	userUID, err := uuid.Parse(p.UserID)
	if err != nil {
		return
	}

	h.presenceTracker.AddEditor(docUID, userUID, p.Username)

	h.eventBus.Publish(eventbus.NewWikiPresenceJoinedEvent(
		eventbus.ServiceActor("hocuspocus"),
		eventbus.WikiPresencePayload{
			DocumentID:  p.DocumentID,
			OperationID: p.OperationID,
			UserID:      p.UserID,
			Username:    p.Username,
		},
	))
}

func (h *WebhookHandler) handleOnDisconnect(p webhookPayload) {
	docUID, err := uuid.Parse(p.DocumentID)
	if err != nil {
		return
	}
	userUID, err := uuid.Parse(p.UserID)
	if err != nil {
		return
	}

	h.presenceTracker.RemoveEditor(docUID, userUID)

	h.eventBus.Publish(eventbus.NewWikiPresenceLeftEvent(
		eventbus.ServiceActor("hocuspocus"),
		eventbus.WikiPresencePayload{
			DocumentID:  p.DocumentID,
			OperationID: p.OperationID,
			UserID:      p.UserID,
			Username:    p.Username,
		},
	))
}

func (h *WebhookHandler) verifySignature(body []byte, signature string) bool {
	mac := hmac.New(sha256.New, []byte(h.webhookSecret))
	mac.Write(body)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}
