package oidc

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	gooidc "github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// Provider is the relying-party surface the controller uses. The interface
// exists so controller tests can drive the callback with a fake instead of a
// discovery-backed provider.
type Provider interface {
	// AuthCodeURL builds the provider redirect for the given handshake.
	AuthCodeURL(h Handshake) string
	// Authenticate exchanges the code, verifies the ID token against the
	// handshake nonce, optionally merges userinfo, and returns the merged
	// claims. Errors wrap ErrProvider or ErrNonceMismatch.
	Authenticate(ctx context.Context, h Handshake, code string) (map[string]any, error)
	// Issuer returns the verified issuer URL identities are keyed by.
	Issuer() string
}

// LazyProvider wraps discovery so an unreachable IdP at boot does not take
// core down: the first call that needs the provider retries discovery, and
// Status reports the last failure for /status.
type LazyProvider struct {
	cfg  Config
	http *http.Client

	mu      sync.Mutex
	inner   *provider
	lastErr error
}

// NewLazyProvider attempts discovery once (bounded by cfg.HTTPTimeout) and
// returns the wrapper regardless of the outcome. The error is informational
// — the caller should log it, not fail startup.
func NewLazyProvider(ctx context.Context, cfg Config) (*LazyProvider, error) {
	timeout := cfg.HTTPTimeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	lp := &LazyProvider{cfg: cfg, http: &http.Client{Timeout: timeout}}
	_, err := lp.get(ctx)
	return lp, err
}

// Status returns nil when discovery has succeeded, else the last error.
func (lp *LazyProvider) Status() error {
	lp.mu.Lock()
	defer lp.mu.Unlock()
	if lp.inner != nil {
		return nil
	}
	return lp.lastErr
}

func (lp *LazyProvider) get(ctx context.Context) (*provider, error) {
	lp.mu.Lock()
	defer lp.mu.Unlock()
	if lp.inner != nil {
		return lp.inner, nil
	}
	p, err := newProvider(gooidc.ClientContext(ctx, lp.http), lp.cfg)
	if err != nil {
		lp.lastErr = err
		return nil, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	lp.inner, lp.lastErr = p, nil
	return p, nil
}

// AuthCodeURL implements Provider. It returns "" when discovery has not
// succeeded; the controller checks Status first so this is a belt-and-braces
// guard.
func (lp *LazyProvider) AuthCodeURL(h Handshake) string {
	p, err := lp.get(context.Background())
	if err != nil {
		return ""
	}
	return p.AuthCodeURL(h)
}

// Authenticate implements Provider.
func (lp *LazyProvider) Authenticate(ctx context.Context, h Handshake, code string) (map[string]any, error) {
	p, err := lp.get(ctx)
	if err != nil {
		return nil, err
	}
	return p.Authenticate(gooidc.ClientContext(ctx, lp.http), h, code)
}

// Issuer implements Provider.
func (lp *LazyProvider) Issuer() string { return lp.cfg.IssuerURL }

// provider is the discovery-backed implementation.
type provider struct {
	cfg      Config
	oauth    oauth2.Config
	verifier *gooidc.IDTokenVerifier
	remote   *gooidc.Provider
}

func newProvider(ctx context.Context, cfg Config) (*provider, error) {
	remote, err := gooidc.NewProvider(ctx, cfg.IssuerURL)
	if err != nil {
		return nil, fmt.Errorf("discovery %s: %w", cfg.IssuerURL, err)
	}
	scopes := cfg.Scopes
	if !contains(scopes, gooidc.ScopeOpenID) {
		scopes = append([]string{gooidc.ScopeOpenID}, scopes...)
	}
	return &provider{
		cfg: cfg,
		oauth: oauth2.Config{
			ClientID:     cfg.ClientID,
			ClientSecret: cfg.ClientSecret,
			// RedirectURL is deliberately empty: it is supplied per request
			// from the handshake (see redirectParam).
			Endpoint: remote.Endpoint(),
			Scopes:   scopes,
		},
		verifier: remote.Verifier(&gooidc.Config{ClientID: cfg.ClientID}),
		remote:   remote,
	}, nil
}

func (p *provider) Issuer() string { return p.cfg.IssuerURL }

func (p *provider) AuthCodeURL(h Handshake) string {
	return p.oauth.AuthCodeURL(h.State,
		redirectParam(h),
		gooidc.Nonce(h.Nonce),
		oauth2.S256ChallengeOption(h.Verifier),
	)
}

// redirectParam sets redirect_uri from the handshake on both the
// authorization request and the token exchange, as RFC 6749 requires the
// two to match.
func redirectParam(h Handshake) oauth2.AuthCodeOption {
	return oauth2.SetAuthURLParam("redirect_uri", h.RedirectURI)
}

func (p *provider) Authenticate(ctx context.Context, h Handshake, code string) (map[string]any, error) {
	token, err := p.oauth.Exchange(ctx, code, redirectParam(h), oauth2.VerifierOption(h.Verifier))
	if err != nil {
		return nil, fmt.Errorf("%w: exchange: %v", ErrProvider, err)
	}
	rawID, ok := token.Extra("id_token").(string)
	if !ok || rawID == "" {
		return nil, fmt.Errorf("%w: token response has no id_token", ErrProvider)
	}
	idToken, err := p.verifier.Verify(ctx, rawID)
	if err != nil {
		return nil, fmt.Errorf("%w: verify id_token: %v", ErrProvider, err)
	}
	if idToken.Nonce != h.Nonce {
		return nil, ErrNonceMismatch
	}
	var idClaims map[string]any
	if err := idToken.Claims(&idClaims); err != nil {
		return nil, fmt.Errorf("%w: decode id_token claims: %v", ErrProvider, err)
	}
	if !p.cfg.UseUserInfo {
		return idClaims, nil
	}
	info, err := p.remote.UserInfo(ctx, oauth2.StaticTokenSource(token))
	if err != nil {
		return nil, fmt.Errorf("%w: userinfo: %v", ErrProvider, err)
	}
	var infoClaims map[string]any
	if err := info.Claims(&infoClaims); err != nil {
		return nil, fmt.Errorf("%w: decode userinfo claims: %v", ErrProvider, err)
	}
	// userinfo must describe the same end user as the ID token (OIDC Core
	// §5.3.2); a mismatch means the provider is broken or the token was
	// swapped, so refuse rather than merge.
	if infoSub, _ := infoClaims["sub"].(string); infoSub != "" && infoSub != idToken.Subject {
		return nil, fmt.Errorf("%w: userinfo sub does not match id_token sub", ErrProvider)
	}
	return MergeClaims(idClaims, infoClaims), nil
}

func contains(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}
