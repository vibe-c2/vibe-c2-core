package mcp

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

type findHostsArgs struct {
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation to search. Defaults to whatever the operator currently has open."`
	Search      string `json:"search,omitempty"       jsonschema:"Free-text match against hostname and OS."`
	Limit       int    `json:"limit,omitempty"        jsonschema:"Maximum hosts to return (default 25, maximum 50)."`
	Cursor      string `json:"cursor,omitempty"       jsonschema:"Continue a previous page using its nextCursor."`
}

type getHostArgs struct {
	HostID string `json:"host_id" jsonschema:"The host's id, from find_hosts."`
}

type createHostArgs struct {
	IdempotencyKey
	OperationID string         `json:"operation_id,omitempty" jsonschema:"Operation to create the host in. Defaults to whatever the operator currently has open."`
	Hostname    string         `json:"hostname"               jsonschema:"The host's name."`
	OS          string         `json:"os,omitempty"           jsonschema:"Free-text OS fingerprint, e.g. 'Windows Server 2019'."`
	Interfaces  []interfaceArg `json:"interfaces,omitempty"   jsonschema:"Network interfaces. Without these the host cannot be placed on a subnet in the topology view."`
	Routes      []routeArg     `json:"routes,omitempty"       jsonschema:"Routing table entries."`
	Logins      []loginArg     `json:"logins,omitempty"       jsonschema:"Observed logins. These draw the edges in the topology users lens."`
	visualIdentity
}

type updateHostArgs struct {
	IdempotencyKey
	HostID     string         `json:"host_id"               jsonschema:"The host to update, from find_hosts."`
	Hostname   string         `json:"hostname,omitempty"    jsonschema:"Rename the host."`
	OS         string         `json:"os,omitempty"          jsonschema:"Set or correct the OS fingerprint."`
	Interfaces []interfaceArg `json:"interfaces,omitempty"  jsonschema:"REPLACES the interface list. Call get_host first and send the full set, including any you are not changing."`
	Routes     []routeArg     `json:"routes,omitempty"      jsonschema:"REPLACES the route list. Send the full set."`
	Logins     []loginArg     `json:"logins,omitempty"      jsonschema:"REPLACES the login list. Send the full set."`
	visualIdentity
}

func registerHostTools(s *Server) {
	register(s, &mcp.Tool{
		Name: "find_hosts",
		Description: "Search hosts in an operation. Returns a compact view; call get_host for " +
			"one host's interfaces, routes and login history.",
	}, readTool, handleFindHosts)

	register(s, &mcp.Tool{
		Name: "get_host",
		Description: "One host in full: network interfaces, routes, and the login footprints " +
			"that the topology view draws its edges from.",
	}, readTool, handleGetHost)

	register(s, &mcp.Tool{
		Name: "create_host",
		Description: "Record a newly discovered host. Supply interfaces, routes and logins " +
			"where you know them — they are what the topology view draws the network from, " +
			"so a host without them appears as an isolated node.",
	}, writeTool, handleCreateHost)

	register(s, &mcp.Tool{
		Name: "update_host",
		Description: "Change a host, typically to fill in network detail discovered later. " +
			"The interface, route and login lists REPLACE what is stored rather than merging, " +
			"so read the host first and send back the complete set.",
	}, writeTool, handleUpdateHost)
}

func handleFindHosts(ctx context.Context, s *Server, args findHostsArgs) (toolResult, error) {
	opID, err := s.resolveOperation(ctx, args.OperationID)
	if err != nil {
		return toolResult{}, err
	}
	if _, err := s.authorizeOperation(ctx, opID, models.OperationRoleViewer); err != nil {
		return toolResult{}, err
	}

	limit := clampPageSize(args.Limit)
	conn, err := s.deps.Hosts.Hosts(ctx, opID.String(), optionalString(args.Search), nil, nil,
		&limit, optionalString(args.Cursor), nil, nil)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to search hosts: %w", err)
	}

	views := make([]hostView, 0, len(conn.Edges))
	for _, edge := range conn.Edges {
		views = append(views, toHostView(edge.Node))
	}

	result, err := newPage(views, endCursor(conn.PageInfo), totalNote(conn.TotalCount, len(views))...)
	if err != nil {
		return toolResult{}, err
	}
	return toolResult{
		Payload:     result,
		OperationID: &opID,
		Summary:     fmt.Sprintf("searched hosts (%d shown of %d)", len(views), conn.TotalCount),
	}, nil
}

func handleGetHost(ctx context.Context, s *Server, args getHostArgs) (toolResult, error) {
	host, err := s.deps.Hosts.Host(ctx, args.HostID)
	if err != nil {
		return toolResult{}, fmt.Errorf("host not found")
	}
	// The resolver's own authorization runs on the operation the host belongs
	// to, but it does not know about the key's scope list, so re-check here.
	if _, err := s.authorizeOperation(ctx, host.OperationID, models.OperationRoleViewer); err != nil {
		return toolResult{}, err
	}
	return toolResult{
		Payload:     toHostDetailView(host),
		OperationID: &host.OperationID,
		Summary:     fmt.Sprintf("read host %s", host.Hostname),
	}, nil
}

func handleCreateHost(ctx context.Context, s *Server, args createHostArgs) (toolResult, error) {
	opID, err := s.resolveOperation(ctx, args.OperationID)
	if err != nil {
		return toolResult{}, err
	}
	if _, err := s.authorizeOperation(ctx, opID, models.OperationRoleOperator); err != nil {
		return toolResult{}, err
	}

	if err := args.validate(); err != nil {
		return toolResult{}, err
	}
	emoji, icon, color := args.apply()

	host, err := s.deps.Hosts.CreateHost(ctx, opID.String(), model.CreateHostInput{
		Hostname:   args.Hostname,
		Os:         optionalString(args.OS),
		Emoji:      emoji,
		Icon:       icon,
		Color:      color,
		Interfaces: toInterfaceInputs(args.Interfaces),
		Routes:     toRouteInputs(args.Routes),
		Logins:     toLoginInputs(args.Logins),
	})
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to create host: %w", err)
	}
	return toolResult{
		Payload:     toHostView(host),
		OperationID: &opID,
		Summary:     fmt.Sprintf("created host %s", host.Hostname),
	}, nil
}

func handleUpdateHost(ctx context.Context, s *Server, args updateHostArgs) (toolResult, error) {
	host, err := s.deps.Hosts.Host(ctx, args.HostID)
	if err != nil {
		return toolResult{}, fmt.Errorf("host not found")
	}
	if _, err := s.authorizeOperation(ctx, host.OperationID, models.OperationRoleOperator); err != nil {
		return toolResult{}, err
	}

	if err := args.validate(); err != nil {
		return toolResult{}, err
	}
	emoji, icon, color := args.apply()

	input := model.UpdateHostInput{
		Hostname: optionalString(args.Hostname),
		Os:       optionalString(args.OS),
		Emoji:    emoji,
		Icon:     icon,
		Color:    color,
	}
	// Nil and empty mean different things to the resolver: nil leaves the list
	// alone, empty clears it. Only send a list the caller actually supplied.
	if args.Interfaces != nil {
		input.Interfaces = toInterfaceInputs(args.Interfaces)
	}
	if args.Routes != nil {
		input.Routes = toRouteInputs(args.Routes)
	}
	if args.Logins != nil {
		input.Logins = toLoginInputs(args.Logins)
	}

	updated, err := s.deps.Hosts.UpdateHost(ctx, args.HostID, input)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to update host: %w", err)
	}

	return toolResult{
		Payload:     toHostDetailView(updated),
		OperationID: &host.OperationID,
		Summary:     fmt.Sprintf("updated host %s", updated.Hostname),
	}, nil
}
