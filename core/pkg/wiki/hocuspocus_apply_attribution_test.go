package wiki

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"go.uber.org/zap"
)

// Reported: a document an agent edited never appeared in the wiki's
// recently-updated list. The sidecar stamps last_updated_at only when it knows
// who made the save, and that list both sorts on and filters by that field —
// so an unattributed edit is not merely mis-ordered, it is excluded.
//
// Both write paths must therefore carry the operator the agent acts for.
func TestApplyMarkdown_CarriesTheEditingOperator(t *testing.T) {
	for _, mode := range []ApplyMode{ApplyReplace, ApplyAppend, ApplyPrepend} {
		t.Run(string(mode), func(t *testing.T) {
			var got applyMarkdownRequest
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_ = json.NewDecoder(r.Body).Decode(&got)
				w.WriteHeader(http.StatusOK)
				_ = json.NewEncoder(w).Encode(map[string]any{"nodes": 1, "watchers": 0})
			}))
			defer srv.Close()

			c := NewHocuspocusClient(srv.URL, "secret", zap.NewNop())
			if _, err := c.ApplyMarkdown(context.Background(), "doc-1", "# hi", mode, "user-1"); err != nil {
				t.Fatalf("ApplyMarkdown returned %v", err)
			}
			if got.UserID != "user-1" {
				t.Errorf("userId = %q, want the editing operator", got.UserID)
			}
		})
	}
}

// An empty user is sent as absent rather than as an empty string, so the
// sidecar's "do I know who edited this" check stays a simple truthiness test.
func TestApplyMarkdown_OmitsAnUnknownOperator(t *testing.T) {
	var raw map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&raw)
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{"nodes": 1, "watchers": 0})
	}))
	defer srv.Close()

	c := NewHocuspocusClient(srv.URL, "secret", zap.NewNop())
	if _, err := c.ApplyMarkdown(context.Background(), "doc-1", "# hi", ApplyReplace, ""); err != nil {
		t.Fatalf("ApplyMarkdown returned %v", err)
	}
	if _, present := raw["userId"]; present {
		t.Error("an unknown operator should be omitted, not sent empty")
	}
}
