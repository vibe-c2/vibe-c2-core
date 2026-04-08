package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
)

// GenerateCSRFToken returns a 32-byte random token, URL-safe base64
// encoded without padding. URL-safe encoding is required because Gin's
// c.Cookie() URL-unescapes values, so a standard-base64 token containing
// '+' would be mangled (decoded to space) on the cookie side while the
// header is read raw — making the double-submit compare fail. Raw URL
// encoding uses only [A-Za-z0-9_-], all of which survive URL-unescape
// unchanged and are legal cookie octets.
func GenerateCSRFToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate csrf token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// CSRFEqual is a constant-time string comparison for CSRF token validation.
// Returns false on length mismatch (no early-exit timing leak).
func CSRFEqual(a, b string) bool {
	if len(a) == 0 || len(b) == 0 {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
