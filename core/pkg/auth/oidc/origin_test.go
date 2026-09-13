package oidc

import (
	"crypto/tls"
	"net/http/httptest"
	"testing"
)

func TestPublicOriginAndRedirectURI(t *testing.T) {
	tests := []struct {
		name    string
		host    string
		tls     bool
		headers map[string]string
		want    string
	}{
		{"plain http", "localhost:8002", false, nil, "http://localhost:8002"},
		{"direct tls", "c2.example.com", true, nil, "https://c2.example.com"},
		{"behind proxy", "core:8002", false, map[string]string{"X-Forwarded-Proto": "https", "X-Forwarded-Host": "c2.example.com"}, "https://c2.example.com"},
		{"proxy chain takes first", "core:8002", false, map[string]string{"X-Forwarded-Proto": "https, http", "X-Forwarded-Host": "c2.example.com, internal"}, "https://c2.example.com"},
		{"bogus proto ignored", "localhost:8002", false, map[string]string{"X-Forwarded-Proto": "gopher"}, "http://localhost:8002"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/api/v1/auth/oidc/login", nil)
			r.Host = tt.host
			if tt.tls {
				r.TLS = &tls.ConnectionState{}
			}
			for k, v := range tt.headers {
				r.Header.Set(k, v)
			}
			if got := PublicOrigin(r); got != tt.want {
				t.Fatalf("PublicOrigin = %q, want %q", got, tt.want)
			}
			if got := RedirectURI(r); got != tt.want+CallbackPath {
				t.Fatalf("RedirectURI = %q", got)
			}
		})
	}
}

func TestSPAOrigin(t *testing.T) {
	allowed := []string{"http://localhost:5173", "https://app.example.com/"}
	tests := []struct {
		name    string
		referer string
		want    string
	}{
		{"allowed referer wins", "http://localhost:5173/login", "http://localhost:5173"},
		{"allowed with trailing slash in config", "https://app.example.com/", "https://app.example.com"},
		{"unlisted referer falls back to api origin", "https://evil.test/", "http://api.test"},
		{"no referer falls back", "", "http://api.test"},
		{"garbage referer falls back", "not a url", "http://api.test"},
		{"case-insensitive match returns configured form", "HTTP://LOCALHOST:5173/x", "http://localhost:5173"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/api/v1/auth/oidc/login", nil)
			r.Host = "api.test"
			if tt.referer != "" {
				r.Header.Set("Referer", tt.referer)
			}
			if got := SPAOrigin(r, allowed); got != tt.want {
				t.Fatalf("SPAOrigin = %q, want %q", got, tt.want)
			}
		})
	}
}
