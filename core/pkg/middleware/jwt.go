package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
)

// JWTAuth returns middleware that validates the Bearer token from the
// Authorization header and sets userID, username, and role in the gin context.
func JWTAuth(provider auth.IAuthProvider) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
			return
		}

		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
			return
		}

		claims, err := provider.ValidateAuthToken(parts[1])
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
