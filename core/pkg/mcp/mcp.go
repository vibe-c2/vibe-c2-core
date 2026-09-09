// Package mcp exposes Vibe C2's knowledge layer to AI agents over the Model
// Context Protocol, at POST /api/v1/mcp.
//
// # Shape
//
// The tool surface is hand-written, not generated from the GraphQL schema.
// The schema has ~570 fields; turning those into ~200 tools would wreck a
// model's ability to pick the right one and would freeze internal resolver
// names as a public agent contract. Instead there are roughly twenty
// task-shaped tools ("find_hosts", "append_wiki_section") that call the same
// resolver interfaces the GraphQL layer calls, in-process. No HTTP hop, no
// token forwarding, and authorization stays exactly where it already lives.
//
// # Boundaries
//
// Two properties are enforced structurally rather than by remembering:
//
//   - Agent keys authenticate only here. Every other route under /api/v1 sits
//     below middleware.RequireHuman and refuses them, so the agent cannot
//     reach past the tools in this package even though its key resolves to a
//     real user.
//   - Authority only narrows. The context this package builds carries the
//     owner's identity plus the key's ceiling, and
//     authorization.AuthorizeOperationRole intersects the two on every call.
//
// # Scope
//
// Knowledge layer only: wiki, tasks, hosts, credentials, hashes and the
// timeline. Nothing here touches implant tasking, sessions, channels or the
// module registry. Channels are deliberately plaintext-blind; this package
// must not become the way around that.
package mcp

import (
	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/resolver"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
	"go.uber.org/zap"
)

// serverName and serverVersion identify this server to MCP clients.
const (
	serverName    = "vibe-c2"
	serverVersion = "0.1.0"
)

// Deps is everything the tool layer needs. Resolvers rather than repositories
// wherever one exists: they already carry the authorization checks, input
// validation and event publishing that the GraphQL surface relies on, and
// duplicating that here is how the two surfaces would drift apart.
type Deps struct {
	Operations  resolver.IOperationResolver
	Hosts       resolver.IHostResolver
	Credentials resolver.ICredentialResolver
	Hashes      resolver.IHashResolver
	Tasks       resolver.ITaskResolver
	WikiDocs    resolver.IWikiDocumentResolver
	Timeline    resolver.ITimelineResolver

	// Repositories used where no resolver method fits — chiefly listing the
	// operations a user belongs to, and the wiki write path, which has to go
	// through Hocuspocus rather than a plain document update.
	OperationRepo    repository.IOperationRepository
	WikiDocumentRepo repository.IWikiDocumentRepository
	AgentActionRepo  repository.IAgentActionRepository
	// OperationEventRepo is the timeline. Agent WRITES land here alongside
	// human activity; reads do not — they go only to agent_actions.
	OperationEventRepo repository.IOperationEventRepository

	Cache cache.Cache
	// Hocuspocus is the write path for wiki bodies, not just a converter —
	// edits are applied as Y.js transactions on the live document so they
	// merge with whatever the operator is doing rather than overwriting it.
	Hocuspocus *wiki.HocuspocusClient
	Bus        eventbus.IEventBus
	Logger     *zap.Logger
}
