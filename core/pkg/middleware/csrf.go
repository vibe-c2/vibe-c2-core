package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/cookies"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
)

// CSRFHeader is the HTTP header the SPA echoes the CSRF token in.
const CSRFHeader = "X-CSRF-Token"

// CSRF returns middleware enforcing the double-submit CSRF check on
// state-changing methods. Safe methods (GET / HEAD / OPTIONS) pass through
// unconditionally. /login and /enroll have no session yet, so the caller
// must mount this middleware after the public-route registrations or
// exempt those paths through routing.
//
// The cookie value is set on login/refresh and read by the SPA via
// document.cookie; the SPA then echoes it back in the X-CSRF-Token header.
// Both must be present and equal (constant-time compare). Either missing
// → 403.
//
// Pass enabled=false to no-op the middleware (useful for tests / dev).
func CSRF(enabled bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !enabled {
			c.Next()
			return
		}
		switch c.Request.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			c.Next()
			return
		}

		cookieVal, err := c.Cookie(cookies.CSRFCookie)
		if err != nil || cookieVal == "" {
			c.AbortWithStatusJSON(http.StatusForbidden, responses.ErrForbidden)
			return
		}
		header := c.GetHeader(CSRFHeader)
		if !auth.CSRFEqual(cookieVal, header) {
			c.AbortWithStatusJSON(http.StatusForbidden, responses.ErrForbidden)
			return
		}
		c.Next()
	}
}
