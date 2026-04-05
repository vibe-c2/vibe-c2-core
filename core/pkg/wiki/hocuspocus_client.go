package wiki

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"go.uber.org/zap"
)

// HocuspocusClient is an HTTP client for the Hocuspocus sidecar's internal API.
// Used to force-disconnect users when their operation membership is revoked
// or their role is demoted below operator.
type HocuspocusClient struct {
	baseURL    string
	httpClient *http.Client
	logger     *zap.Logger
}

// NewHocuspocusClient creates a new client for the Hocuspocus internal API.
func NewHocuspocusClient(baseURL string, logger *zap.Logger) *HocuspocusClient {
	return &HocuspocusClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		logger: logger,
	}
}

type disconnectRequest struct {
	UserID      string `json:"userId"`
	OperationID string `json:"operationId"`
}

// DisconnectUser calls the Hocuspocus disconnect API to force-close WebSocket
// connections for a user in a specific operation. This is called when a user's
// role is demoted below operator or their membership is revoked.
func (c *HocuspocusClient) DisconnectUser(ctx context.Context, userID, operationID string) error {
	body, err := json.Marshal(disconnectRequest{
		UserID:      userID,
		OperationID: operationID,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal disconnect request: %w", err)
	}

	url := c.baseURL + "/api/disconnect"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create disconnect request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		c.logger.Warn("Failed to call Hocuspocus disconnect API",
			zap.String("user_id", userID),
			zap.String("operation_id", operationID),
			zap.Error(err))
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		c.logger.Warn("Hocuspocus disconnect API returned error",
			zap.String("user_id", userID),
			zap.Int("status", resp.StatusCode))
	}

	return nil
}
