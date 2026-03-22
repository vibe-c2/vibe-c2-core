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
// The Resolver struct holds entity-specific resolvers (Users, Operations)
// that contain the actual business logic. This file is the dependency
// injection root — gqlgen's generated mutationResolver, queryResolver, etc.
// embed this struct to access the entity resolvers.
package resolver

import "github.com/vibe-c2/vibe-c2-core/core/pkg/resolver"

// Resolver is the root resolver. It delegates to domain-specific entity
// resolvers that hold the actual business logic.
// gqlgen generates mutationResolver and queryResolver structs that
// embed this, so they inherit access to entity resolvers.
type Resolver struct {
	UserResolver      resolver.IUserResolver
	OperationResolver resolver.IOperationResolver
}
