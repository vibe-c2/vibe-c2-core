package cookies

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	AccessTokenCookie  = "access_token"
	RefreshTokenCookie = "refresh_token"

	// Path scoping: refresh cookie is only sent to the refresh endpoint.
	accessTokenPath  = "/api/v1"
	refreshTokenPath = "/api/v1/login/refresh"

	refreshTokenMaxAge = 7 * 24 * time.Hour
)

// SetAuthCookies sets httpOnly cookies for both access and refresh tokens.
// In dev mode, Secure is disabled and SameSite is Lax (same-site cross-origin
// between localhost:5173 and localhost:8002). In production, Secure is enabled
// and SameSite is Strict.
func SetAuthCookies(c *gin.Context, accessToken, refreshToken string, accessTTL time.Duration, dev bool) {
	sameSite := http.SameSiteStrictMode
	secure := true
	if dev {
		sameSite = http.SameSiteLaxMode
		secure = false
	}

	http.SetCookie(c.Writer, &http.Cookie{
		Name:     AccessTokenCookie,
		Value:    accessToken,
		Path:     accessTokenPath,
		MaxAge:   int(accessTTL.Seconds()),
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	})

	http.SetCookie(c.Writer, &http.Cookie{
		Name:     RefreshTokenCookie,
		Value:    refreshToken,
		Path:     refreshTokenPath,
		MaxAge:   int(refreshTokenMaxAge.Seconds()),
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	})
}

// ClearAuthCookies removes both auth cookies by setting MaxAge to -1.
func ClearAuthCookies(c *gin.Context, dev bool) {
	sameSite := http.SameSiteStrictMode
	secure := true
	if dev {
		sameSite = http.SameSiteLaxMode
		secure = false
	}

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
}
