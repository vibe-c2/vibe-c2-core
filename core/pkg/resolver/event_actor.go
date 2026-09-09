package resolver

import (
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
)

// eventActor builds the bus actor for whoever is making the current request.
//
// Every domain event has to go through this rather than calling
// eventbus.UserActor directly, because an AI agent acting for a user is not
// the same as that user. Attributing its work to the human would make the
// timeline claim someone did something they did not do — which is the exact
// property the agent feature was supposed to provide, not erase.
//
// The agent actor still carries the owner's id, so filters and avatars keyed
// on the human keep working; what it adds is that the row can say a delegate
// did it, and which one.
func eventActor(auth gqlctx.AuthInfo) eventbus.Actor {
	if auth.Agent != nil {
		return eventbus.AgentActor(auth.Agent.AgentKeyID, auth.Agent.Name, auth.UserID)
	}
	return eventbus.UserActor(auth.UserID)
}
