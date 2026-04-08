package cookies

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	AccessTokenCookie  = "access_token"
	RefreshTokenCookie = "refresh_token"
	// CSRFCookie holds the double-submit CSRF token. Unlike the auth
	// cookies, this one is NOT httpOnly so the SPA can read it via
	// document.cookie and echo it back in the X-CSRF-Token header on
	// state-changing requests.
	CSRFCookie = "csrf_token"

	// Path scoping: refresh cookie is only sent to the refresh endpoint.
	accessTokenPath  = "/api/v1"
	refreshTokenPath = "/api/v1/login/refresh"
	// csrfCookiePath must be "/" because the SPA JS (served from /)
	// reads this cookie via document.cookie to echo it as X-CSRF-Token.
	// Browsers only expose cookies to document.cookie whose Path is a
	// prefix of the current page's URL — setting Path=/api/v1 would
	// hide the cookie from the SPA entirely.
	csrfCookiePath = "/"
)

// SetAuthCookies sets httpOnly cookies for both access and refresh tokens.
// In dev mode, Secure is disabled and SameSite is Lax (cross-port between
// localhost:5173 and localhost:8002 still counts as same-site for cookies,
// but Lax is friendlier to dev workflows). In production, Secure is on and
// SameSite is Strict.
//
// MaxAge is driven by the refresh TTL: the cookie outlives the JWT's exp
// claim because the JWT itself is the source of truth for validity, and
// keeping the cookie around lets /login/refresh read it after expiry.
func SetAuthCookies(c *gin.Context, accessToken, refreshToken string, refreshTTL time.Duration, dev bool) {
	sameSite, secure := cookieAttrs(dev)
	maxAge := int(refreshTTL.Seconds())

	http.SetCookie(c.Writer, &http.Cookie{
		Name:     AccessTokenCookie,
		Value:    accessToken,
		Path:     accessTokenPath,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	})

	http.SetCookie(c.Writer, &http.Cookie{
		Name:     RefreshTokenCookie,
		Value:    refreshToken,
		Path:     refreshTokenPath,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	})
}

// SetCSRFCookie sets the double-submit CSRF cookie. The SPA reads it via
// document.cookie and echoes it back in the X-CSRF-Token header on
// state-changing requests. HttpOnly is intentionally false.
//
// Also emits a deletion for the legacy Path=/api/v1 csrf_token cookie an
// earlier version of the code set. Browsers that still carry it would
// otherwise win the most-specific-path match on /api/v1/* requests and
// override the new Path=/ cookie, producing persistent 403s until manual
// cleanup. The deletion is a harmless no-op for clients that never had
// the stale cookie.
func SetCSRFCookie(c *gin.Context, token string, refreshTTL time.Duration, dev bool) {
	sameSite, secure := cookieAttrs(dev)
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     CSRFCookie,
		Value:    "",
		Path:     "/api/v1",
		MaxAge:   -1,
		HttpOnly: false,
		Secure:   secure,
		SameSite: sameSite,
	})
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     CSRFCookie,
		Value:    token,
		Path:     csrfCookiePath,
		MaxAge:   int(refreshTTL.Seconds()),
		HttpOnly: false,
		Secure:   secure,
		SameSite: sameSite,
	})
}

// ClearAuthCookies removes both auth cookies and the CSRF cookie.
func ClearAuthCookies(c *gin.Context, dev bool) {
	sameSite, secure := cookieAttrs(dev)

	http.SetCookie(c.Writer, &http.Cookie{
		Name:     AccessTokenCookie,
		Value:    "",
		Path:     accessTokenPath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	})

	http.SetCookie(c.Writer, &http.Cookie{
		Name:     RefreshTokenCookie,
		Value:    "",
		Path:     refreshTokenPath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	})

	http.SetCookie(c.Writer, &http.Cookie{
		Name:     CSRFCookie,
		Value:    "",
		Path:     csrfCookiePath,
		MaxAge:   -1,
		HttpOnly: false,
		Secure:   secure,
		SameSite: sameSite,
	})
	// Also clear any legacy Path=/api/v1 csrf_token cookie from the
	// previous cookie-path bug — see SetCSRFCookie for context.
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     CSRFCookie,
		Value:    "",
		Path:     "/api/v1",
		MaxAge:   -1,
		HttpOnly: false,
		Secure:   secure,
		SameSite: sameSite,
	})
}

func cookieAttrs(dev bool) (http.SameSite, bool) {
	if dev {
		return http.SameSiteLaxMode, false
	}
	return http.SameSiteStrictMode, true
}
