package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/cookies"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
)

// JWTAuth returns middleware that validates the access_token cookie
// and sets userID, username, and roles in the gin context.
func JWTAuth(provider auth.IAuthProvider) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr, err := c.Cookie(cookies.AccessTokenCookie)
		if err != nil || tokenStr == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
			return
		}

		claims, err := provider.ValidateAuthToken(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
			return
		}

		c.Set("userID", claims.Subject)
		c.Set("username", claims.PreferredUsername)
		c.Set("roles", claims.Roles)
		c.Next()
	}
}
