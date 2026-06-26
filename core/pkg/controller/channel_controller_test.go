package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"go.uber.org/zap"
)

// fakeCache is an in-memory Cache used to exercise the SetNX dedup path without
// a live Redis. Only SetNX is meaningful here; the rest satisfy the interface.
type fakeCache struct {
	seen map[string]struct{}
}

func newFakeCache() *fakeCache { return &fakeCache{seen: map[string]struct{}{}} }

func (f *fakeCache) Get(ctx context.Context, key string) (string, error) { return "", nil }
func (f *fakeCache) Set(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
	return nil
}
func (f *fakeCache) SetNX(ctx context.Context, key string, value interface{}, ttl time.Duration) (bool, error) {
	if _, ok := f.seen[key]; ok {
		return false, nil
	}
	f.seen[key] = struct{}{}
	return true, nil
}
func (f *fakeCache) SetWithTags(ctx context.Context, key string, value interface{}, tags []string, ttl time.Duration) error {
	return nil
}
func (f *fakeCache) Del(ctx context.Context, keys ...string) error                  { return nil }
func (f *fakeCache) InvalidateCache(ctx context.Context, e string, id string) error { return nil }
func (f *fakeCache) Close() error                                                   { return nil }
func (f *fakeCache) IsEnabled() bool                                                { return true }

func newSyncRequest(body string) (*httptest.ResponseRecorder, *gin.Context) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/channel/sync", bytes.NewBufferString(body))
	c.Request.Header.Set("Content-Type", "application/json")
	return w, c
}

const validInbound = `{
  "message_id": "01JNX6R8VQ2H3CN4K9EJ1T2Z7M",
  "type": "inbound.minion_message",
  "version": "1.0",
  "timestamp": "2026-03-09T21:05:12.481Z",
  "id": "s-2b77df",
  "encrypted_data": "QkM4V1R=",
  "meta": {"trace_id": "tr-6fd92d8b"}
}`

func TestChannelSync_Valid(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := NewChannelController(newFakeCache(), zap.NewNop())

	w, c := newSyncRequest(validInbound)
	ctrl.Sync(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", w.Code, w.Body.String())
	}

	var out responses.OutboundMinionMessage
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if out.Type != responses.TypeOutboundMinionMessage {
		t.Errorf("type = %q, want %q", out.Type, responses.TypeOutboundMinionMessage)
	}
	if out.Version != responses.ChannelContractVersion {
		t.Errorf("version = %q, want %q", out.Version, responses.ChannelContractVersion)
	}
	if out.ID != "s-2b77df" {
		t.Errorf("id = %q, want echoed s-2b77df", out.ID)
	}
	if out.EncryptedData != "" {
		t.Errorf("encrypted_data = %q, want empty no-op", out.EncryptedData)
	}
	if out.Meta.Status != "ok" {
		t.Errorf("meta.status = %q, want ok", out.Meta.Status)
	}
	if out.Meta.TraceID != "tr-6fd92d8b" {
		t.Errorf("meta.trace_id = %q, want propagated", out.Meta.TraceID)
	}
	if out.MessageID == "" {
		t.Error("message_id should be set")
	}
	if _, err := time.Parse(time.RFC3339, out.Timestamp); err != nil {
		t.Errorf("timestamp %q not RFC3339: %v", out.Timestamp, err)
	}
}

func TestChannelSync_ValidationErrors(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name string
		body string
	}{
		{"missing id", `{"message_id":"m1","type":"inbound.minion_message","timestamp":"2026-03-09T21:05:12.481Z","encrypted_data":"x"}`},
		{"missing encrypted_data", `{"message_id":"m1","type":"inbound.minion_message","timestamp":"2026-03-09T21:05:12.481Z","id":"s-1"}`},
		{"wrong type", `{"message_id":"m1","type":"outbound.minion_message","timestamp":"2026-03-09T21:05:12.481Z","id":"s-1","encrypted_data":"x"}`},
		{"bad timestamp", `{"message_id":"m1","type":"inbound.minion_message","timestamp":"not-a-time","id":"s-1","encrypted_data":"x"}`},
		{"malformed json", `{`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctrl := NewChannelController(newFakeCache(), zap.NewNop())
			w, c := newSyncRequest(tt.body)
			ctrl.Sync(c)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d (%s)", w.Code, w.Body.String())
			}
		})
	}
}

func TestChannelSync_DuplicateMessageIDReturnsNoOp(t *testing.T) {
	gin.SetMode(gin.TestMode)
	// Shared cache across both calls so the second SetNX reports a duplicate.
	ctrl := NewChannelController(newFakeCache(), zap.NewNop())

	w1, c1 := newSyncRequest(validInbound)
	ctrl.Sync(c1)
	if w1.Code != http.StatusOK {
		t.Fatalf("first call: expected 200, got %d", w1.Code)
	}

	w2, c2 := newSyncRequest(validInbound)
	ctrl.Sync(c2)
	if w2.Code != http.StatusOK {
		t.Fatalf("duplicate call: expected 200 no-op, got %d (%s)", w2.Code, w2.Body.String())
	}

	var out responses.OutboundMinionMessage
	if err := json.Unmarshal(w2.Body.Bytes(), &out); err != nil {
		t.Fatalf("unmarshal duplicate response: %v", err)
	}
	if out.ID != "s-2b77df" || out.Meta.Status != "ok" {
		t.Errorf("duplicate response not a valid no-op outbound: %+v", out)
	}
}

// Compile-time assurance the fake satisfies the interface.
var _ cache.Cache = (*fakeCache)(nil)
