package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/permissions"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
)

// RBAC returns middleware that checks whether the authenticated user's roles
// grant at least one of the required permissions.
func RBAC(requiredPermissions ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		val, exists := c.Get("roles")
		if !exists {
			c.AbortWithStatusJSON(http.StatusForbidden, responses.ErrForbidden)
			return
		}

		roles, ok := val.([]string)
		if !ok || len(roles) == 0 {
			c.AbortWithStatusJSON(http.StatusForbidden, responses.ErrForbidden)
			return
		}

		for _, perm := range requiredPermissions {
			if permissions.HasPermissionForRoles(roles, perm) {
				c.Next()
				return
			}
		}

		c.AbortWithStatusJSON(http.StatusForbidden, responses.ErrForbidden)
	}
}
