// Package oidc implements the relying-party side of an OpenID Connect
// Authorization Code + PKCE login. It knows nothing about Gin, Mongo or
// sessions: the controller drives it and hands the resulting Identity to the
// ordinary session-issuance path.
package oidc

import (
	"errors"
	"fmt"
)

var (
	// ErrHandshakeInvalid means the sealed handshake cookie could not be
	// opened (tampered, wrong key, malformed) or has expired.
	ErrHandshakeInvalid = errors.New("oidc: handshake invalid or expired")
	// ErrHandshakeExpired wraps ErrHandshakeInvalid for a cookie that opened
	// fine but is older than HandshakeTTL. OpenHandshake still returns the
	// decoded value so the caller can send the browser back where it came
	// from.
	ErrHandshakeExpired = fmt.Errorf("%w: expired", ErrHandshakeInvalid)
	// ErrStateMismatch means the state echoed by the provider does not match
	// the one sealed into the handshake cookie.
	ErrStateMismatch = errors.New("oidc: state mismatch")
	// ErrNonceMismatch means the ID token's nonce is not the one we sent.
	ErrNonceMismatch = errors.New("oidc: nonce mismatch")
	// ErrProvider covers token exchange, ID token verification and userinfo
	// failures — anything where the provider side did not cooperate.
	ErrProvider = errors.New("oidc: provider error")
	// ErrNoRoles means neither the role mapping nor the default roles
	// produced a vibe role for this user.
	ErrNoRoles = errors.New("oidc: no role granted")
	// ErrMissingClaim means a required claim (subject, username) is absent.
	ErrMissingClaim = errors.New("oidc: required claim missing")
	// ErrUsernameTaken means an unlinked local user already owns the
	// username and linking by username is disabled.
	ErrUsernameTaken = errors.New("oidc: username already taken by a local account")
	// ErrUserInactive means the resolved local user is deactivated.
	ErrUserInactive = errors.New("oidc: user inactive")
	// ErrUnavailable means discovery has not succeeded (yet) so no login can
	// be started.
	ErrUnavailable = errors.New("oidc: provider unavailable")
)
