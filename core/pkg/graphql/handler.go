// Package graphql provides the HTTP handler that connects Gin (our HTTP
// framework) to gqlgen (our GraphQL engine).
//
// The handler does three things:
//  1. Extracts authentication info from Gin's context (set by JWTAuth middleware)
//  2. Injects it into Go's context.Context (so resolvers can read it)
//  3. Delegates to gqlgen's HTTP handler for actual GraphQL execution
//
// This is the "bridge" between the REST world (Gin, HTTP, JWT) and the
// GraphQL world (resolvers, directives, schema).
package graphql

import (
	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/gin-gonic/gin"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/generated"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/resolver"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// NewHandler creates a Gin handler that serves GraphQL requests.
//
// The flow for each request:
//  1. Gin middleware (JWTAuth) already ran and set userID/username/roles
//  2. This handler reads those values from gin.Context
//  3. It injects them into context.Context as AuthInfo
//  4. gqlgen takes over: parses the query, runs directives, calls resolvers
//  5. The response (JSON) is written back through Gin
func NewHandler(userRepo repository.IUserRepository) gin.HandlerFunc {
	// Create the resolver root with all dependencies injected.
	// The resolver holds the repository directly (same as controllers do).
	resolverRoot := &resolver.Resolver{
		UserRepo: userRepo,
	}

	// Build the gqlgen server with our schema, resolvers, and directive.
	//
	// Config ties everything together:
	//   - Resolvers: our implementations for each query/mutation
	//   - Directives: our @hasPermission handler
	srv := handler.New(generated.NewExecutableSchema(generated.Config{
		Resolvers: resolverRoot,
		Directives: generated.DirectiveRoot{
			// Wire up the @hasPermission directive to our handler function.
			// Every time gqlgen encounters @hasPermission in the schema,
			// it calls this function before the resolver.
			HasPermission: resolver.HasPermission,
		},
	}))

	// --- Transport configuration ---
	// Transports define how GraphQL requests are sent over HTTP.
	// POST is the standard (JSON body with query + variables).
	// GET is used for simple queries (query string parameters).
	srv.AddTransport(transport.Options{})
	srv.AddTransport(transport.GET{})
	srv.AddTransport(transport.POST{})

	// --- Query caching ---
	// gqlgen parses the GraphQL query string into an AST on every request.
	// This cache stores parsed queries so repeated identical queries skip parsing.
	// The LRU (Least Recently Used) cache holds the 100 most recent queries.
	srv.SetQueryCache(lru.New[*ast.QueryDocument](100))

	// --- Introspection ---
	// Introspection lets clients (like GraphQL Playground) discover the schema
	// by sending special queries like { __schema { types { name } } }.
	// This is essential for development tools but can be disabled in production.
	srv.Use(extension.Introspection{})

	// --- Automatic Persisted Queries (APQ) ---
	// APQ is an optimization where the client sends a hash of the query
	// instead of the full query string. If the server has seen the query before
	// (cached), it executes the cached version. If not, the client re-sends
	// the full query. This reduces bandwidth for repeated queries.
	srv.Use(extension.AutomaticPersistedQuery{
		Cache: lru.New[string](100),
	})

	// Return a Gin handler that bridges auth context and delegates to gqlgen.
	return func(c *gin.Context) {
		// Extract auth info from Gin's context (set by JWTAuth middleware)
		// and inject it into the standard context.Context for resolvers.
		roles, _ := c.Get("roles")
		rolesSlice, _ := roles.([]string)

		ctx := resolver.WithAuthInfo(c.Request.Context(), resolver.AuthInfo{
			UserID:   c.GetString("userID"),
			Username: c.GetString("username"),
			Roles:    rolesSlice,
		})

		// Replace the request context with our auth-enriched context.
		c.Request = c.Request.WithContext(ctx)

		// Let gqlgen handle the actual GraphQL execution.
		srv.ServeHTTP(c.Writer, c.Request)
	}
}

// NewPlaygroundHandler creates a Gin handler that serves the GraphQL Playground UI.
//
// GraphQL Playground is a browser-based IDE for writing and testing queries.
// It's like Swagger UI, but for GraphQL. You open it in your browser, write
// queries on the left, and see results on the right.
//
// The "title" is shown in the browser tab, and "endpoint" is where
// Playground sends its GraphQL requests.
func NewPlaygroundHandler(endpoint string) gin.HandlerFunc {
	// playground.Handler returns a standard http.HandlerFunc that serves
	// the Playground HTML/JS application.
	h := playground.Handler("Vibe C2 — GraphQL Playground", endpoint)

	return func(c *gin.Context) {
		h.ServeHTTP(c.Writer, c.Request)
	}
}
