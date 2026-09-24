package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
)

// OperationMemo attaches a request-scoped operation memo to the request
// context so handlers below it can authorize through gqlctx.LoadOperation and
// share a single fetch. Without a memo on the context LoadOperation falls
// through to an uncached FindByID, so this middleware is what lets the REST
// surface participate at all.
//
// Mount this only on groups whose requests are short-lived. The memo lives
// exactly as long as the context it is attached to, so a long-lived
// connection (the GraphQL WebSocket transport, an SSE stream) would keep
// serving whatever membership it observed at connect time. The GraphQL
// handler deliberately does not use this middleware — it scopes the same memo
// per operation via AroundOperations instead. See gqlctx.opmemo.
func OperationMemo() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request = c.Request.WithContext(gqlctx.WithOperationMemo(c.Request.Context()))
		c.Next()
	}
}
