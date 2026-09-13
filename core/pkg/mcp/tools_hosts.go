package mcp

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

type findHostsArgs struct {
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation id; omit for the operator's current one."`
	Search      string `json:"search,omitempty"       jsonschema:"Free-text match against hostname and OS."`
	Limit       int    `json:"limit,omitempty"        jsonschema:"Page size, max 50."`
	Cursor      string `json:"cursor,omitempty"       jsonschema:"nextCursor from the previous page."`
}

type getHostArgs struct {
	HostID string `json:"host_id" jsonschema:"Host id."`
}

type createHostArgs struct {
	IdempotencyKey
	OperationID string         `json:"operation_id,omitempty" jsonschema:"Operation id; omit for the operator's current one."`
	Hostname    string         `json:"hostname"               jsonschema:"Host name."`
	OS          string         `json:"os,omitempty"           jsonschema:"OS fingerprint, e.g. 'Windows Server 2019'."`
	Interfaces  []interfaceArg `json:"interfaces,omitempty"   jsonschema:"Interfaces; they place the host on a subnet."`
	Routes      []routeArg     `json:"routes,omitempty"       jsonschema:"Routing table."`
	Logins      []loginArg     `json:"logins,omitempty"       jsonschema:"Observed logins; they draw the users lens."`
	visualIdentity
}

type updateHostArgs struct {
	IdempotencyKey
	HostID     string         `json:"host_id"               jsonschema:"Host id."`
	Hostname   string         `json:"hostname,omitempty"    jsonschema:"New name."`
	OS         string         `json:"os,omitempty"          jsonschema:"New OS fingerprint."`
	Interfaces []interfaceArg `json:"interfaces,omitempty"  jsonschema:"REPLACES the interface list; send the full set."`
	Routes     []routeArg     `json:"routes,omitempty"      jsonschema:"REPLACES the route list; send the full set."`
	Logins     []loginArg     `json:"logins,omitempty"      jsonschema:"REPLACES the login list; send the full set."`
	visualIdentity
}

func registerHostTools(s *Server) {
	register(s, &mcp.Tool{
		Name:        "find_hosts",
		Description: "Search hosts. Compact rows; get_host has interfaces, routes and logins.",
	}, readTool, handleFindHosts)

	register(s, &mcp.Tool{
		Name:        "get_host",
		Description: "One host in full: interfaces, routes and login footprints.",
	}, readTool, handleGetHost)

	register(s, &mcp.Tool{
		Name: "create_host",
		Description: "Record a discovered host. Interfaces, routes and logins are what the " +
			"topology view draws from; without them the host is an isolated node.",
	}, writeTool, handleCreateHost)

	register(s, &mcp.Tool{
		Name: "update_host",
		Description: "Change a host. The interface, route and login lists REPLACE what is " +
			"stored, so read the host first and send the complete set.",
	}, writeTool, handleUpdateHost)
}

func handleFindHosts(ctx context.Context, s *Server, args findHostsArgs) (toolResult, error) {
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleViewer)
	if err != nil {
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
	// The resolver's own authorization runs on the operation the host belongs
	// to, but it does not know about the key's scope list, so re-check here.
	host, err := s.loadHost(ctx, args.HostID, models.OperationRoleViewer)
	if err != nil {
		return toolResult{}, err
	}
	return toolResult{
		Payload:     toHostDetailView(host),
		OperationID: &host.OperationID,
		Summary:     fmt.Sprintf("read host %s", host.Hostname),
	}, nil
}

func handleCreateHost(ctx context.Context, s *Server, args createHostArgs) (toolResult, error) {
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleOperator)
	if err != nil {
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
	host, err := s.loadHost(ctx, args.HostID, models.OperationRoleOperator)
	if err != nil {
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
