package oidc

import (
	"net/http"
	"net/url"
	"strings"
)

// CallbackPath is where the provider sends the browser back. Fixed, so the
// only thing that varies per deployment is the public origin, and that is
// derived from the request instead of configured.
const CallbackPath = "/api/v1/auth/oidc/callback"

// PublicOrigin reconstructs the scheme://host the client used to reach us,
// honouring the reverse-proxy headers nginx and the ingress set. It is what
// redirect_uri is built from. A forged Host can only yield a redirect_uri the
// provider has not registered, which the provider rejects.
func PublicOrigin(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if p := firstHeaderValue(r, "X-Forwarded-Proto"); p == "http" || p == "https" {
		scheme = p
	}
	host := firstHeaderValue(r, "X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	return scheme + "://" + host
}

// RedirectURI is the provider callback for a request's public origin.
func RedirectURI(r *http.Request) string {
	return PublicOrigin(r) + CallbackPath
}

// SPAOrigin decides where the browser should land after login. The SPA
// starts the flow with a top-level navigation, so its origin arrives in the
// Referer; it is honoured only when it is one of the configured front-end
// origins (the CORS allowlist), so a link from elsewhere cannot turn the
// callback into a redirect to an arbitrary site. Otherwise the API's own
// origin is used, which is the single-origin production layout.
func SPAOrigin(r *http.Request, allowedOrigins []string) string {
	if ref, err := url.Parse(r.Header.Get("Referer")); err == nil && ref.Scheme != "" && ref.Host != "" {
		origin := ref.Scheme + "://" + ref.Host
		for _, allowed := range allowedOrigins {
			if canonical := strings.TrimRight(allowed, "/"); strings.EqualFold(canonical, origin) {
				return canonical
			}
		}
	}
	return PublicOrigin(r)
}

func firstHeaderValue(r *http.Request, name string) string {
	v := r.Header.Get(name)
	if i := strings.IndexByte(v, ','); i >= 0 {
		v = v[:i]
	}
	return strings.TrimSpace(v)
}
