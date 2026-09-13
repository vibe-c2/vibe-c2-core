package oidc

import (
	"errors"
	"testing"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
)

func TestHandshakeSealOpenRoundTrip(t *testing.T) {
	key := auth.DeriveKey("secret", "oidc-handshake")
	now := time.Date(2026, 9, 13, 12, 0, 0, 0, time.UTC)

	h, err := NewHandshake("/wiki/abc", "http://api.test/cb", "http://spa.test", now)
	if err != nil {
		t.Fatal(err)
	}
	if h.State == "" || h.Nonce == "" || h.Verifier == "" || h.State == h.Nonce {
		t.Fatalf("handshake fields must be distinct random values: %+v", h)
	}

	sealed, err := h.Seal(key)
	if err != nil {
		t.Fatal(err)
	}

	got, err := OpenHandshake(key, sealed, now.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if got.State != h.State || got.Nonce != h.Nonce || got.Verifier != h.Verifier || got.ReturnTo != "/wiki/abc" ||
		got.RedirectURI != "http://api.test/cb" || got.SPAOrigin != "http://spa.test" {
		t.Fatalf("round trip mismatch: %+v vs %+v", got, h)
	}
	if err := got.CheckState(h.State); err != nil {
		t.Fatal(err)
	}
	if err := got.CheckState(h.State + "x"); !errors.Is(err, ErrStateMismatch) {
		t.Fatalf("err = %v, want ErrStateMismatch", err)
	}
}

func TestOpenHandshakeExpiredStillReturnsOrigin(t *testing.T) {
	key := auth.DeriveKey("secret", "oidc-handshake")
	now := time.Now()
	h, _ := NewHandshake("/", "http://api.test/cb", "http://spa.test", now)
	sealed, _ := h.Seal(key)
	got, err := OpenHandshake(key, sealed, now.Add(HandshakeTTL+time.Second))
	if !errors.Is(err, ErrHandshakeExpired) || !errors.Is(err, ErrHandshakeInvalid) {
		t.Fatalf("err = %v, want ErrHandshakeExpired wrapping ErrHandshakeInvalid", err)
	}
	if got.SPAOrigin != "http://spa.test" {
		t.Fatalf("expired handshake must still expose its origin, got %+v", got)
	}
}

func TestOpenHandshakeRejects(t *testing.T) {
	key := auth.DeriveKey("secret", "oidc-handshake")
	otherKey := auth.DeriveKey("other", "oidc-handshake")
	now := time.Now()
	h, _ := NewHandshake("/", "http://api.test/cb", "http://spa.test", now)
	sealed, _ := h.Seal(key)

	tests := []struct {
		name   string
		key    []byte
		sealed string
		at     time.Time
	}{
		{"empty", key, "", now},
		{"garbage", key, "not-base64!!", now},
		{"wrong key", otherKey, sealed, now},
		{"tampered", key, sealed[:len(sealed)-2] + "AA", now},
		{"expired", key, sealed, now.Add(HandshakeTTL + time.Second)},
		{"from the future", key, sealed, now.Add(-time.Minute)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := OpenHandshake(tt.key, tt.sealed, tt.at); !errors.Is(err, ErrHandshakeInvalid) {
				t.Fatalf("err = %v, want ErrHandshakeInvalid", err)
			}
		})
	}
}

func TestSanitizeReturnTo(t *testing.T) {
	tests := map[string]string{
		"":                       "/",
		"/":                      "/",
		"/wiki/abc?x=1":          "/wiki/abc?x=1",
		"  /tasks ":              "/tasks",
		"https://evil.example":   "/",
		"//evil.example/path":    "/",
		"/\\evil.example":        "/",
		"wiki":                   "/",
		"/ok\r\nSet-Cookie: x=y": "/",
	}
	for in, want := range tests {
		if got := SanitizeReturnTo(in); got != want {
			t.Errorf("SanitizeReturnTo(%q) = %q, want %q", in, got, want)
		}
	}
}
