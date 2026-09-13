package oidc_test

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/oidc"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/oidc/oidctest"
)

func newProvider(t *testing.T, idp *oidctest.Server, useUserInfo bool) *oidc.LazyProvider {
	t.Helper()
	p, err := oidc.NewLazyProvider(context.Background(), oidc.Config{
		IssuerURL:    idp.Issuer(),
		ClientID:     idp.ClientID,
		ClientSecret: idp.ClientSecret,
		Scopes:       []string{"profile"},
		UseUserInfo:  useUserInfo,
		HTTPTimeout:  5 * time.Second,
	})
	if err != nil {
		t.Fatalf("discovery: %v", err)
	}
	if err := p.Status(); err != nil {
		t.Fatalf("status: %v", err)
	}
	return p
}

func TestAuthCodeURLCarriesPKCEAndNonce(t *testing.T) {
	idp := oidctest.New()
	defer idp.Close()
	p := newProvider(t, idp, false)

	h, _ := oidc.NewHandshake("/", "http://app.test/api/v1/auth/oidc/callback", "http://app.test", time.Now())
	u, err := url.Parse(p.AuthCodeURL(h))
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	if q.Get("state") != h.State || q.Get("nonce") != h.Nonce {
		t.Fatalf("state/nonce not propagated: %s", u)
	}
	if q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" {
		t.Fatalf("PKCE missing: %s", u)
	}
	if !strings.Contains(q.Get("scope"), "openid") {
		t.Fatalf("openid scope must be forced: %q", q.Get("scope"))
	}
	if q.Get("redirect_uri") != "http://app.test/api/v1/auth/oidc/callback" {
		t.Fatalf("redirect_uri = %q", q.Get("redirect_uri"))
	}
}

func TestAuthenticate(t *testing.T) {
	idp := oidctest.New()
	defer idp.Close()

	t.Run("happy path merges userinfo over id token", func(t *testing.T) {
		p := newProvider(t, idp, true)
		h, _ := oidc.NewHandshake("/", "http://app.test/api/v1/auth/oidc/callback", "http://app.test", time.Now())
		idp.IssueCode("c1", map[string]any{"sub": "u1", "nonce": h.Nonce, "preferred_username": "alice"})
		idp.UserInfo = map[string]any{"sub": "u1", "realm_access": map[string]any{"roles": []any{"vibec2-admin"}}}

		claims, err := p.Authenticate(context.Background(), h, "c1")
		if err != nil {
			t.Fatal(err)
		}
		if claims["sub"] != "u1" || claims["preferred_username"] != "alice" {
			t.Fatalf("id token claims lost: %v", claims)
		}
		if _, ok := claims["realm_access"]; !ok {
			t.Fatalf("userinfo claims not merged: %v", claims)
		}
		if got := idp.LastTokenForm.Get("code_verifier"); got != h.Verifier {
			t.Fatalf("code_verifier = %q, want handshake verifier", got)
		}
		if got := idp.LastTokenForm.Get("redirect_uri"); got != h.RedirectURI {
			t.Fatalf("token exchange redirect_uri = %q, want %q", got, h.RedirectURI)
		}
	})

	t.Run("nonce mismatch", func(t *testing.T) {
		p := newProvider(t, idp, false)
		h, _ := oidc.NewHandshake("/", "http://app.test/api/v1/auth/oidc/callback", "http://app.test", time.Now())
		idp.IssueCode("c2", map[string]any{"sub": "u1", "nonce": "someone-elses"})
		if _, err := p.Authenticate(context.Background(), h, "c2"); !errors.Is(err, oidc.ErrNonceMismatch) {
			t.Fatalf("err = %v, want ErrNonceMismatch", err)
		}
	})

	t.Run("unknown code", func(t *testing.T) {
		p := newProvider(t, idp, false)
		h, _ := oidc.NewHandshake("/", "http://app.test/api/v1/auth/oidc/callback", "http://app.test", time.Now())
		if _, err := p.Authenticate(context.Background(), h, "nope"); !errors.Is(err, oidc.ErrProvider) {
			t.Fatalf("err = %v, want ErrProvider", err)
		}
	})

	t.Run("missing id_token", func(t *testing.T) {
		p := newProvider(t, idp, false)
		h, _ := oidc.NewHandshake("/", "http://app.test/api/v1/auth/oidc/callback", "http://app.test", time.Now())
		idp.OmitIDToken = true
		defer func() { idp.OmitIDToken = false }()
		idp.IssueCode("c3", map[string]any{"sub": "u1", "nonce": h.Nonce})
		if _, err := p.Authenticate(context.Background(), h, "c3"); !errors.Is(err, oidc.ErrProvider) {
			t.Fatalf("err = %v, want ErrProvider", err)
		}
	})

	t.Run("userinfo for a different subject is refused", func(t *testing.T) {
		p := newProvider(t, idp, true)
		h, _ := oidc.NewHandshake("/", "http://app.test/api/v1/auth/oidc/callback", "http://app.test", time.Now())
		idp.IssueCode("c4", map[string]any{"sub": "u1", "nonce": h.Nonce})
		idp.UserInfo = map[string]any{"sub": "u2"}
		defer func() { idp.UserInfo = map[string]any{} }()
		if _, err := p.Authenticate(context.Background(), h, "c4"); !errors.Is(err, oidc.ErrProvider) {
			t.Fatalf("err = %v, want ErrProvider", err)
		}
	})
}

func TestLazyProviderRecoversAfterDiscoveryFailure(t *testing.T) {
	// Point at a closed server first: discovery fails but the wrapper exists.
	dead := oidctest.New()
	deadURL := dead.Issuer()
	dead.Close()

	p, err := oidc.NewLazyProvider(context.Background(), oidc.Config{
		IssuerURL: deadURL, ClientID: "x", ClientSecret: "y", HTTPTimeout: time.Second,
	})
	if err == nil || p.Status() == nil {
		t.Fatalf("expected discovery failure, got err=%v status=%v", err, p.Status())
	}
	h, _ := oidc.NewHandshake("/", "http://app.test/api/v1/auth/oidc/callback", "http://app.test", time.Now())
	if p.AuthCodeURL(h) != "" {
		t.Fatal("AuthCodeURL must be empty while unavailable")
	}
	if _, err := p.Authenticate(context.Background(), h, "c"); !errors.Is(err, oidc.ErrUnavailable) {
		t.Fatalf("err = %v, want ErrUnavailable", err)
	}
}
