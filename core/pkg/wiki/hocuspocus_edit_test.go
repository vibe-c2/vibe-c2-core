package wiki

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"go.uber.org/zap"
)

// The sidecar answers an edit with 200, a 409 refusal, or 413. Each has to
// come back as the typed error the tool layer switches on; a refusal that
// surfaced as a generic error would reach the agent as "the platform is
// broken" instead of "your snippet is wrong".
func TestEditMarkdown_MapsSidecarAnswers(t *testing.T) {
	cases := []struct {
		name   string
		status int
		body   any
		check  func(t *testing.T, res EditMarkdownResult, err error)
	}{
		{
			name:   "success",
			status: http.StatusOK,
			body:   map[string]any{"ok": true, "nodes": 3, "watchers": 1, "matches": 1, "replacements": 1},
			check: func(t *testing.T, res EditMarkdownResult, err error) {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res.Replacements != 1 || res.Watchers != 1 {
					t.Fatalf("result not decoded: %+v", res)
				}
			},
		},
		{
			name:   "no match carries the diagnosis",
			status: http.StatusConflict,
			body:   map[string]any{"error": "no_match", "matches": 0, "diagnosis": "The page is empty."},
			check: func(t *testing.T, _ EditMarkdownResult, err error) {
				var noMatch *EditNoMatchError
				if !errors.As(err, &noMatch) {
					t.Fatalf("got %T (%v), want *EditNoMatchError", err, err)
				}
				if noMatch.Diagnosis != "The page is empty." {
					t.Fatalf("diagnosis lost: %q", noMatch.Diagnosis)
				}
			},
		},
		{
			name:   "ambiguous carries the count",
			status: http.StatusConflict,
			body:   map[string]any{"error": "ambiguous", "matches": 3},
			check: func(t *testing.T, _ EditMarkdownResult, err error) {
				var ambiguous *EditAmbiguousError
				if !errors.As(err, &ambiguous) || ambiguous.Matches != 3 {
					t.Fatalf("got %T (%v), want *EditAmbiguousError with 3 matches", err, err)
				}
			},
		},
		{
			name:   "too large",
			status: http.StatusRequestEntityTooLarge,
			body:   map[string]any{"error": "markdown exceeds 1 MB"},
			check: func(t *testing.T, _ EditMarkdownResult, err error) {
				if !errors.Is(err, ErrMarkdownTooLarge) {
					t.Fatalf("got %v, want ErrMarkdownTooLarge", err)
				}
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var got editMarkdownRequest
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/internal/apply-markdown" {
					t.Errorf("wrong path %s", r.URL.Path)
				}
				if r.Header.Get("X-Internal-Signature-256") == "" {
					t.Error("request is unsigned")
				}
				_ = json.NewDecoder(r.Body).Decode(&got)
				w.WriteHeader(tc.status)
				_ = json.NewEncoder(w).Encode(tc.body)
			}))
			defer srv.Close()

			c := NewHocuspocusClient(srv.URL, "secret", zap.NewNop())
			res, err := c.EditMarkdown(context.Background(), "doc-1", "old", "new", true)
			tc.check(t, res, err)

			if got.Mode != applyEdit || got.OldText != "old" || got.NewText != "new" || !got.ReplaceAll {
				t.Errorf("request body not as sent: %+v", got)
			}
		})
	}
}
