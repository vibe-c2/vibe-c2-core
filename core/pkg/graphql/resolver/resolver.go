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

import (
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/resolver"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
)

// Resolver is the root resolver. It delegates to domain-specific entity
// resolvers that hold the actual business logic.
// gqlgen generates mutationResolver and queryResolver structs that
// embed this, so they inherit access to entity resolvers.
//
// EventBus, UserRepo, and OperationRepo are used by subscription resolvers
// to receive real-time events and fetch full entities from the database.
type Resolver struct {
	UserResolver               resolver.IUserResolver
	OperationResolver          resolver.IOperationResolver
	SchemeNetworkPointResolver resolver.ISchemeNetworkPointResolver
	SessionResolver            resolver.ISessionResolver
	WikiDocumentResolver       resolver.IWikiDocumentResolver
	WikiDocumentVisitResolver  resolver.IWikiDocumentVisitResolver
	CredentialResolver         resolver.ICredentialResolver
	TimelineResolver           resolver.ITimelineResolver
	APIKeyResolver             resolver.IAPIKeyResolver

	// Subscription dependencies — event bus for real-time events,
	// repos for fetching full entities to include in event payloads.
	EventBus         eventbus.IEventBus
	UserRepo         repository.IUserRepository
	OperationRepo    repository.IOperationRepository
	SessionRepo      repository.ISessionRepository
	WikiDocumentRepo repository.IWikiDocumentRepository
	CredentialRepo   repository.ICredentialRepository
	PresenceTracker  *wiki.PresenceTracker
}
