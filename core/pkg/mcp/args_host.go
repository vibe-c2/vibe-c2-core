package mcp

import (
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
	Name      string   `json:"name"                jsonschema:"e.g. eth0"`
	MAC       string   `json:"mac,omitempty"       jsonschema:"Hardware address."`
	Addresses []string `json:"addresses,omitempty" jsonschema:"CIDR form, e.g. 10.0.5.12/24; the mask places the host on a subnet."`
}

type routeArg struct {
	Destination string `json:"destination"         jsonschema:"CIDR; 0.0.0.0/0 is the default route."`
	Gateway     string `json:"gateway,omitempty"   jsonschema:"Next hop."`
	Interface   string `json:"interface,omitempty" jsonschema:"Egress interface."`
}

type loginArg struct {
	User string `json:"user"                jsonschema:"Account name."`
	From string `json:"from,omitempty"      jsonschema:"Source host or IP; empty means local. This is the edge the users lens draws."`
	TTY  string `json:"tty,omitempty"       jsonschema:"e.g. pts/0"`
	// LastSeen is free text because that is how `last` reports it and how the
	// model stores it — parsing it into a timestamp would lose information the
	// operator may want to read verbatim.
	LastSeen string `json:"last_seen,omitempty" jsonschema:"As reported by 'last'."`
	Count    int    `json:"count,omitempty"     jsonschema:"Sessions this (user, from) pair stands for."`
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
