package mcp

import (
	"fmt"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
)

// The network shape of a host, as an agent supplies it.
//
// These are the fields the topology view is built from, so a host recorded
// without them is an isolated dot: interfaces place it on a subnet, routes
// draw the reachability edges, and logins draw the users lens. An agent that
// can only set a hostname cannot describe a network, which is most of what it
// would be recording hosts for.

type interfaceArg struct {
	Name      string   `json:"name"                jsonschema:"Interface name, e.g. 'eth0'."`
	MAC       string   `json:"mac,omitempty"       jsonschema:"Hardware address, if known."`
	Addresses []string `json:"addresses,omitempty" jsonschema:"Addresses in CIDR form, e.g. '10.0.5.12/24'. The mask is what places the host on a subnet in the topology view, so include it."`
}

type routeArg struct {
	Destination string `json:"destination"         jsonschema:"Destination network in CIDR form. '0.0.0.0/0' is the default route."`
	Gateway     string `json:"gateway,omitempty"   jsonschema:"Next-hop address."`
	Interface   string `json:"interface,omitempty" jsonschema:"Interface the traffic leaves by."`
}

type loginArg struct {
	User string `json:"user"                jsonschema:"Account name, e.g. 'root' or 'alice'."`
	From string `json:"from,omitempty"      jsonschema:"Host or IP the session came from. Empty means a local login. This is the edge the topology users lens draws, so fill it in for remote sessions."`
	TTY  string `json:"tty,omitempty"       jsonschema:"Terminal, e.g. 'pts/0'."`
	// LastSeen is free text because that is how `last` reports it and how the
	// model stores it — parsing it into a timestamp would lose information the
	// operator may want to read verbatim.
	LastSeen string `json:"last_seen,omitempty" jsonschema:"When the session was seen, as reported by 'last'."`
	Count    int    `json:"count,omitempty"     jsonschema:"How many sessions this (user, from) pair stands for."`
}

func toInterfaceInputs(in []interfaceArg) []*model.NetworkInterfaceInput {
	out := make([]*model.NetworkInterfaceInput, 0, len(in))
	for _, iface := range in {
		out = append(out, &model.NetworkInterfaceInput{
			Name:      iface.Name,
			Mac:       optionalString(iface.MAC),
			Addresses: iface.Addresses,
		})
	}
	return out
}

func toRouteInputs(in []routeArg) []*model.RouteInput {
	out := make([]*model.RouteInput, 0, len(in))
	for _, route := range in {
		out = append(out, &model.RouteInput{
			Destination: route.Destination,
			Gateway:     optionalString(route.Gateway),
			Interface:   optionalString(route.Interface),
		})
	}
	return out
}

func toLoginInputs(in []loginArg) []*model.LoginInput {
	out := make([]*model.LoginInput, 0, len(in))
	for _, login := range in {
		entry := &model.LoginInput{
			User:     login.User,
			From:     optionalString(login.From),
			Tty:      optionalString(login.TTY),
			LastSeen: optionalString(login.LastSeen),
		}
		if login.Count > 0 {
			entry.Count = &login.Count
		}
		out = append(out, entry)
	}
	return out
}

// optionalInt mirrors optionalString for the score fields, where zero is a
// legitimate value and "not supplied" has to be distinguishable from it.
func optionalInt(v, sentinel int) *int {
	if v == sentinel {
		return nil
	}
	return &v
}

func validateScore(name string, v int) error {
	if v < 0 || v > 10 {
		return fmt.Errorf("%s must be between 0 and 10", name)
	}
	return nil
}
