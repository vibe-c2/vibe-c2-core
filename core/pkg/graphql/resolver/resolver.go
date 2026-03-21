// Package resolver contains the GraphQL resolver implementations.
//
// In GraphQL, a "resolver" is a function that fetches the data for a single
// field in the schema. When a client sends a query like:
//
//	query { users(limit: 10) { id username } }
//
// gqlgen calls the Users resolver to get the list, then calls the ID and
// Username resolvers for each user. For simple fields (like Username) that
// map directly to struct fields, gqlgen handles them automatically. For
// complex fields (like ID which needs UUID->string conversion), we write
// custom resolvers.
//
// The Resolver struct holds all dependencies (like the user repository) that
// resolvers need. This is the dependency injection root for GraphQL —
// same pattern as controllers, which also hold the repository directly.
package resolver

import "github.com/vibe-c2/vibe-c2-core/core/pkg/repository"

// Resolver is the root resolver. It holds dependencies that all
// query/mutation resolvers need access to.
// gqlgen generates mutationResolver and queryResolver structs that
// embed this, so they inherit access to UserRepo.
type Resolver struct {
	UserRepo repository.IUserRepository
}
