package wiki

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"go.uber.org/zap"
)

// HocuspocusClient is an HTTP client for the Hocuspocus sidecar's internal API.
// Used to force-disconnect users when their operation membership is revoked
// or their role is demoted below operator, and to convert markdown into Y.js
// document updates during the Outline import flow.
type HocuspocusClient struct {
	baseURL        string
	internalSecret string
	httpClient     *http.Client
	logger         *zap.Logger
}

// NewHocuspocusClient creates a new client for the Hocuspocus internal API.
//
// internalSecret is shared with the sidecar's HOCUSPOCUS_WEBHOOK_SECRET (the
// same secret signs both the sidecar→backend webhook and the backend→sidecar
// internal route; the header name disambiguates direction). Pass an empty
// string when only the disconnect API is needed — markdown-to-yjs requests
// will then fail with a clear error.
func NewHocuspocusClient(baseURL, internalSecret string, logger *zap.Logger) *HocuspocusClient {
	return &HocuspocusClient{
		baseURL:        baseURL,
		internalSecret: internalSecret,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
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

// markdownToYjsRequest is the body shape the sidecar's
// /internal/markdown-to-yjs route consumes.
type markdownToYjsRequest struct {
	Markdown string `json:"markdown"`
}

// MarkdownToYjs sends the markdown body to the Hocuspocus sidecar and
// returns the encoded Y.js document update bytes. The bytes are suitable
// for direct insertion into wiki_documents.content_state; the editor's
// collab extension reads them back via the same Y.XmlFragment field name
// ("default") that the sidecar's persistence layer uses.
//
// Used by the Outline importer to seed every imported document with a
// fully-populated content_state so the first user edit doesn't overwrite
// the imported body with an empty Y.Doc.
func (c *HocuspocusClient) MarkdownToYjs(ctx context.Context, markdown string) ([]byte, error) {
	if c.internalSecret == "" {
		return nil, fmt.Errorf("markdown-to-yjs: no internal secret configured")
	}

	body, err := json.Marshal(markdownToYjsRequest{Markdown: markdown})
	if err != nil {
		return nil, fmt.Errorf("marshal markdown payload: %w", err)
	}

	mac := hmac.New(sha256.New, []byte(c.internalSecret))
	mac.Write(body)
	signature := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	url := c.baseURL + "/internal/markdown-to-yjs"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build markdown-to-yjs request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Signature-256", signature)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call hocuspocus markdown-to-yjs: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Surface the sidecar's error body so callers can log a useful
		// reason without re-parsing the response.
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("markdown-to-yjs returned %d: %s",
			resp.StatusCode, string(errBody))
	}

	bytesOut, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read markdown-to-yjs response: %w", err)
	}
	return bytesOut, nil
}

// YjsToMarkdown is the inverse of MarkdownToYjs: it sends a document's Y.js
// content_state to the Hocuspocus sidecar and returns the Outline-flavored
// markdown that round-trips back through MarkdownToYjs.
//
// Used by the wiki export flow to render each document's stored binary
// state into a .md file. Empty input bytes return an empty string without
// calling the sidecar — an unopened document has no content to render.
func (c *HocuspocusClient) YjsToMarkdown(ctx context.Context, contentState []byte) (string, error) {
	if len(contentState) == 0 {
		return "", nil
	}
	if c.internalSecret == "" {
		return "", fmt.Errorf("yjs-to-markdown: no internal secret configured")
	}

	mac := hmac.New(sha256.New, []byte(c.internalSecret))
	mac.Write(contentState)
	signature := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	url := c.baseURL + "/internal/yjs-to-markdown"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(contentState))
	if err != nil {
		return "", fmt.Errorf("build yjs-to-markdown request: %w", err)
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("X-Internal-Signature-256", signature)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("call hocuspocus yjs-to-markdown: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("yjs-to-markdown returned %d: %s",
			resp.StatusCode, string(errBody))
	}

	bytesOut, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read yjs-to-markdown response: %w", err)
	}
	return string(bytesOut), nil
}
