package mcp

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/middleware"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.uber.org/zap"
)

// uploadRouter fronts UploadHandler with the auth context AuthN would set:
// an agent key when key is non-nil, a plain human session otherwise.
func uploadRouter(t *testing.T, key *models.AgentKey) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	s := &Server{
		server: mcp.NewServer(&mcp.Implementation{Name: serverName, Version: serverVersion}, nil),
		deps:   Deps{Logger: zap.NewNop()},
	}
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("userID", uuid.New().String())
		c.Set("username", "alice")
		c.Set("roles", []string{"user"})
		if key != nil {
			c.Set(middleware.AgentAuthFlag, true)
			c.Set(middleware.AgentInfoKey, key)
		}
		c.Next()
	})
	r.POST("/mcp/upload", s.UploadHandler())
	return r
}

func multipartBody(t *testing.T, fields map[string]string, filename string, content []byte) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for k, v := range fields {
		if err := w.WriteField(k, v); err != nil {
			t.Fatal(err)
		}
	}
	if filename != "" {
		part, err := w.CreateFormFile("file", filename)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(content); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return &buf, w.FormDataContentType()
}

func postUpload(t *testing.T, r *gin.Engine, body *bytes.Buffer, contentType string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/mcp/upload", body)
	req.Header.Set("Content-Type", contentType)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// The endpoint is agent-only, exactly like /mcp: a human session or API key
// must not be able to upload through it.
func TestUploadHandler_RefusesNonAgentCallers(t *testing.T) {
	r := uploadRouter(t, nil)
	body, ct := multipartBody(t, map[string]string{"documentId": uuid.New().String()}, "a.png", []byte("x"))
	if w := postUpload(t, r, body, ct); w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

// Malformed requests are answered before any tool machinery runs, with the
// field that is missing named.
func TestUploadHandler_ValidatesTheForm(t *testing.T) {
	key := &models.AgentKey{AgentKeyID: uuid.New(), KeyID: "vca_test", UserID: uuid.New(), Name: "bot", MaxRole: models.OperationRoleOperator, AllowWrites: true}
	r := uploadRouter(t, key)

	tests := []struct {
		name     string
		fields   map[string]string
		filename string
		want     string
	}{
		{"no document id", map[string]string{}, "a.png", "documentId is required"},
		{"no file", map[string]string{"documentId": uuid.New().String()}, "", "file is required"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, ct := multipartBody(t, tt.fields, tt.filename, []byte("x"))
			w := postUpload(t, r, body, ct)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
			}
			if !bytes.Contains(w.Body.Bytes(), []byte(tt.want)) {
				t.Fatalf("expected %q in body, got %s", tt.want, w.Body.String())
			}
		})
	}

	// A non-multipart body is refused up front rather than parsed as an
	// empty form.
	req := httptest.NewRequest(http.MethodPost, "/mcp/upload", bytes.NewBufferString(`{"documentId":"x"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for JSON body, got %d", w.Code)
	}
}
