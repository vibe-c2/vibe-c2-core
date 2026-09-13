// Package oidctest is an in-process OpenID Provider for tests. It serves
// discovery, JWKS, the token endpoint and userinfo, and signs RS256 ID
// tokens with a throwaway key. No network beyond httptest.
package oidctest

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/golang-jwt/jwt/v5"
)

// Server is a fake OpenID Provider.
type Server struct {
	*httptest.Server
	ClientID     string
	ClientSecret string
	key          *rsa.PrivateKey

	mu sync.Mutex
	// codes maps an authorization code to the claims the token endpoint
	// should bake into the ID token for it.
	codes map[string]map[string]any
	// UserInfo is returned by /userinfo (nil → 404-free empty object).
	UserInfo map[string]any
	// TokenStatus, when non-zero, forces the token endpoint to fail.
	TokenStatus int
	// OmitIDToken makes the token response carry no id_token.
	OmitIDToken bool
	// LastTokenForm records the last token-endpoint form for assertions.
	LastTokenForm url.Values
}

// New starts the fake provider.
func New() *Server {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	s := &Server{
		ClientID:     "vibe-c2",
		ClientSecret: "secret",
		key:          key,
		codes:        map[string]map[string]any{},
		UserInfo:     map[string]any{},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", s.discovery)
	mux.HandleFunc("/keys", s.jwks)
	mux.HandleFunc("/token", s.token)
	mux.HandleFunc("/userinfo", s.userinfo)
	mux.HandleFunc("/auth", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "interactive auth not served by oidctest", http.StatusNotImplemented)
	})
	s.Server = httptest.NewServer(mux)
	return s
}

// Issuer is the issuer URL the fake advertises.
func (s *Server) Issuer() string { return s.URL }

// IssueCode registers an authorization code that will mint an ID token with
// the given claims. Callers pass the nonce they expect via claims["nonce"].
func (s *Server) IssueCode(code string, claims map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.codes[code] = claims
}

func (s *Server) discovery(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]any{
		"issuer":                                s.URL,
		"authorization_endpoint":                s.URL + "/auth",
		"token_endpoint":                        s.URL + "/token",
		"userinfo_endpoint":                     s.URL + "/userinfo",
		"jwks_uri":                              s.URL + "/keys",
		"id_token_signing_alg_values_supported": []string{"RS256"},
		"code_challenge_methods_supported":      []string{"S256"},
	})
}

func (s *Server) jwks(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{
		Key: &s.key.PublicKey, KeyID: "test", Algorithm: "RS256", Use: "sig",
	}}})
}

func (s *Server) token(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	s.LastTokenForm = r.PostForm
	status, omit := s.TokenStatus, s.OmitIDToken
	claims, ok := s.codes[r.PostForm.Get("code")]
	delete(s.codes, r.PostForm.Get("code"))
	s.mu.Unlock()

	if status != 0 {
		http.Error(w, `{"error":"server_error"}`, status)
		return
	}
	if !ok {
		http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
		return
	}
	id, secret, basic := r.BasicAuth()
	if !basic {
		id, secret = r.PostForm.Get("client_id"), r.PostForm.Get("client_secret")
	}
	if id != s.ClientID || secret != s.ClientSecret {
		http.Error(w, `{"error":"invalid_client"}`, http.StatusUnauthorized)
		return
	}
	resp := map[string]any{
		"access_token": "at-" + r.PostForm.Get("code"),
		"token_type":   "Bearer",
		"expires_in":   300,
	}
	if !omit {
		resp["id_token"] = s.signIDToken(claims)
	}
	writeJSON(w, resp)
}

func (s *Server) userinfo(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") == "" {
		http.Error(w, "missing bearer", http.StatusUnauthorized)
		return
	}
	s.mu.Lock()
	info := s.UserInfo
	s.mu.Unlock()
	if info == nil {
		info = map[string]any{}
	}
	writeJSON(w, info)
}

func (s *Server) signIDToken(extra map[string]any) string {
	now := time.Now()
	claims := jwt.MapClaims{
		"iss": s.URL,
		"aud": s.ClientID,
		"iat": now.Unix(),
		"exp": now.Add(5 * time.Minute).Unix(),
	}
	for k, v := range extra {
		claims[k] = v
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = "test"
	signed, err := tok.SignedString(s.key)
	if err != nil {
		panic(err)
	}
	return signed
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
