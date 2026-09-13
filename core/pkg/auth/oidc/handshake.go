package oidc

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"golang.org/x/oauth2"
)

// Handshake is the per-login state that must survive the round trip through
// the provider. It travels in an encrypted httpOnly cookie rather than Redis
// so the callback can land on any pod and no server-side row can leak.
type Handshake struct {
	State    string `json:"s"`
	Nonce    string `json:"n"`
	Verifier string `json:"v"` // PKCE code_verifier
	ReturnTo string `json:"r"` // SPA-relative path, already validated
	// RedirectURI is the callback sent to the provider, derived from the
	// request that started the flow. Sealed so the token exchange repeats
	// the identical string whichever replica handles the callback.
	RedirectURI string `json:"u"`
	// SPAOrigin is where the browser lands after login (see SPAOrigin()).
	SPAOrigin string    `json:"o"`
	IssuedAt  time.Time `json:"t"`
}

// NewHandshake mints fresh random state, nonce and PKCE verifier.
func NewHandshake(returnTo, redirectURI, spaOrigin string, now time.Time) (Handshake, error) {
	state, err := auth.GenerateRandomKey()
	if err != nil {
		return Handshake{}, fmt.Errorf("oidc: state: %w", err)
	}
	nonce, err := auth.GenerateRandomKey()
	if err != nil {
		return Handshake{}, fmt.Errorf("oidc: nonce: %w", err)
	}
	return Handshake{
		State:       state,
		Nonce:       nonce,
		Verifier:    oauth2.GenerateVerifier(),
		ReturnTo:    returnTo,
		RedirectURI: redirectURI,
		SPAOrigin:   spaOrigin,
		IssuedAt:    now.UTC(),
	}, nil
}

// Seal encrypts the handshake with AES-256-GCM into a cookie-safe string.
func (h Handshake) Seal(key []byte) (string, error) {
	raw, err := json.Marshal(h)
	if err != nil {
		return "", fmt.Errorf("oidc: seal handshake: %w", err)
	}
	sealed, err := auth.EncryptGrace(key, raw)
	if err != nil {
		return "", fmt.Errorf("oidc: seal handshake: %w", err)
	}
	return sealed, nil
}

// OpenHandshake decrypts a sealed handshake and enforces its age. A cookie
// that cannot be opened yields ErrHandshakeInvalid and a zero value; one
// that opened but is too old yields ErrHandshakeExpired together with the
// decoded value (its SPAOrigin is still trustworthy — it was sealed by us).
func OpenHandshake(key []byte, sealed string, now time.Time) (Handshake, error) {
	if sealed == "" {
		return Handshake{}, ErrHandshakeInvalid
	}
	raw, err := auth.DecryptGrace(key, sealed)
	if err != nil {
		return Handshake{}, ErrHandshakeInvalid
	}
	var h Handshake
	if err := json.Unmarshal(raw, &h); err != nil {
		return Handshake{}, ErrHandshakeInvalid
	}
	if h.State == "" || h.Nonce == "" || h.Verifier == "" || h.RedirectURI == "" || h.SPAOrigin == "" {
		return Handshake{}, ErrHandshakeInvalid
	}
	age := now.Sub(h.IssuedAt)
	if age < 0 || age > HandshakeTTL {
		return h, ErrHandshakeExpired
	}
	return h, nil
}

// CheckState compares the provider-echoed state with the sealed one in
// constant time.
func (h Handshake) CheckState(echoed string) error {
	if subtle.ConstantTimeCompare([]byte(h.State), []byte(echoed)) != 1 {
		return ErrStateMismatch
	}
	return nil
}

// SanitizeReturnTo keeps only same-origin relative paths so the callback can
// never be turned into an open redirect. Anything else collapses to "/".
func SanitizeReturnTo(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || !strings.HasPrefix(raw, "/") {
		return "/"
	}
	// "//evil.example" and "/\evil" are scheme-relative in browsers.
	if strings.HasPrefix(raw, "//") || strings.HasPrefix(raw, "/\\") {
		return "/"
	}
	if strings.ContainsAny(raw, "\r\n") {
		return "/"
	}
	return raw
}
