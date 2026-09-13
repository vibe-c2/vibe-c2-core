package oidc

import "time"

// Config is the subset of environment.OIDCSettings the package needs. It is
// a separate struct so the package stays importable from tests without the
// environment package's init-time validation.
type Config struct {
	IssuerURL    string
	ClientID     string
	ClientSecret string
	Scopes       []string

	UsernameClaim string
	RolesClaim    string
	RoleMapping   map[string]string
	DefaultRoles  []string

	UseUserInfo bool
	HTTPTimeout time.Duration
}

// HandshakeTTL bounds how long a login may sit between the redirect to the
// provider and the callback. Ten minutes covers a slow MFA prompt without
// leaving sealed handshakes usable for long.
const HandshakeTTL = 10 * time.Minute
