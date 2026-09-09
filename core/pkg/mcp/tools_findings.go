package mcp

import (
	"context"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
)

// --- Hosts ---

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
}

type updateHostArgs struct {
	IdempotencyKey
	HostID     string         `json:"host_id"               jsonschema:"The host to update, from find_hosts."`
	Hostname   string         `json:"hostname,omitempty"    jsonschema:"Rename the host."`
	OS         string         `json:"os,omitempty"          jsonschema:"Set or correct the OS fingerprint."`
	Interfaces []interfaceArg `json:"interfaces,omitempty"  jsonschema:"REPLACES the interface list. Call get_host first and send the full set, including any you are not changing."`
	Routes     []routeArg     `json:"routes,omitempty"      jsonschema:"REPLACES the route list. Send the full set."`
	Logins     []loginArg     `json:"logins,omitempty"      jsonschema:"REPLACES the login list. Send the full set."`
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

	host, err := s.deps.Hosts.CreateHost(ctx, opID.String(), model.CreateHostInput{
		Hostname:   args.Hostname,
		Os:         optionalString(args.OS),
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
		SubjectID:   host.HostID,
		SubjectKind: models.SubjectKindHost,
		SubjectName: host.Hostname,
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

	input := model.UpdateHostInput{
		Hostname: optionalString(args.Hostname),
		Os:       optionalString(args.OS),
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
		SubjectID:   host.HostID,
		SubjectKind: models.SubjectKindHost,
		SubjectName: updated.Hostname,
		Summary:     fmt.Sprintf("updated host %s", updated.Hostname),
	}, nil
}

// --- Credentials ---

type findCredentialsArgs struct {
	OperationID string   `json:"operation_id,omitempty" jsonschema:"Operation to search. Defaults to whatever the operator currently has open."`
	Search      string   `json:"search,omitempty"       jsonschema:"Free-text match against name and username."`
	Tags        []string `json:"tags,omitempty"         jsonschema:"Only credentials carrying all of these tags."`
	ValidOnly   bool     `json:"valid_only,omitempty"   jsonschema:"Only credentials currently marked valid."`
	Limit       int      `json:"limit,omitempty"        jsonschema:"Maximum credentials to return (default 25, maximum 50)."`
	Cursor      string   `json:"cursor,omitempty"       jsonschema:"Continue a previous page using its nextCursor."`
}

type createCredentialArgs struct {
	IdempotencyKey
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation to record the credential in. Defaults to whatever the operator currently has open."`
	Name        string `json:"name"                   jsonschema:"What this credential is, e.g. 'web-01 local admin'."`
	Type        string `json:"type"                   jsonschema:"One of PASSWORD, SSH_KEY, API_KEY, TOKEN, HASH, OTHER."`
	Username    string `json:"username,omitempty"     jsonschema:"Account the credential belongs to."`
	Password    string `json:"password,omitempty"     jsonschema:"The secret, for PASSWORD and similar types."`
	Keys        []struct {
		Name    string `json:"name"    jsonschema:"Label for this key, e.g. 'id_rsa'."`
		Content string `json:"content" jsonschema:"The key material."`
	} `json:"keys,omitempty" jsonschema:"Key material, for SSH_KEY and API_KEY credentials."`
	Properties []struct {
		Name  string `json:"name"  jsonschema:"Field name, e.g. 'domain' or 'port'."`
		Value string `json:"value" jsonschema:"Field value."`
	} `json:"properties,omitempty" jsonschema:"Anything else worth recording alongside the credential."`
	Tags    []string `json:"tags,omitempty"     jsonschema:"Tags, e.g. the host it came from."`
	IsValid *bool    `json:"is_valid,omitempty" jsonschema:"Whether the credential is known to work. Omit if untested."`
}

type getCredentialArgs struct {
	CredentialID string `json:"credential_id" jsonschema:"The credential's id, from find_credentials."`
}

type addCredentialCommentArgs struct {
	IdempotencyKey
	CredentialID string `json:"credential_id" jsonschema:"The credential's id, from find_credentials."`
	Text         string `json:"text"          jsonschema:"The comment to add."`
}

func registerCredentialTools(s *Server) {
	register(s, &mcp.Tool{
		Name: "find_credentials",
		Description: "Search credentials harvested during the engagement. Secret material is " +
			"included in the results.",
	}, readTool, handleFindCredentials)

	register(s, &mcp.Tool{
		Name: "create_credential",
		Description: "Record a credential recovered during the engagement — a password, an SSH " +
			"key, a token. Use this after cracking a hash or finding a secret on a host, so the " +
			"credential is linked into findings rather than living only in the conversation.",
	}, writeTool, handleCreateCredential)

	register(s, &mcp.Tool{
		Name: "get_credential",
		Description: "One credential in full, including its keys, custom properties and the " +
			"comment history explaining where it came from and what it opens.",
	}, readTool, handleGetCredential)

	register(s, &mcp.Tool{
		Name: "add_credential_comment",
		Description: "Append a comment to a credential — where it was found, what it opens, " +
			"whether it still works.",
	}, writeTool, handleAddCredentialComment)
}

func handleFindCredentials(ctx context.Context, s *Server, args findCredentialsArgs) (toolResult, error) {
	opID, err := s.resolveOperation(ctx, args.OperationID)
	if err != nil {
		return toolResult{}, err
	}
	if _, err := s.authorizeOperation(ctx, opID, models.OperationRoleViewer); err != nil {
		return toolResult{}, err
	}

	limit := clampPageSize(args.Limit)
	var validOnly *bool
	if args.ValidOnly {
		validOnly = &args.ValidOnly
	}

	conn, err := s.deps.Credentials.Credentials(ctx, opID.String(), optionalString(args.Search),
		nil, nil, args.Tags, validOnly, nil, nil, &limit, optionalString(args.Cursor), nil, nil)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to search credentials: %w", err)
	}

	views := make([]credentialView, 0, len(conn.Edges))
	for _, edge := range conn.Edges {
		views = append(views, toCredentialView(edge.Node))
	}

	result, err := newPage(views, endCursor(conn.PageInfo), totalNote(conn.TotalCount, len(views))...)
	if err != nil {
		return toolResult{}, err
	}
	return toolResult{
		Payload:     result,
		OperationID: &opID,
		Summary:     fmt.Sprintf("searched credentials (%d shown of %d)", len(views), conn.TotalCount),
	}, nil
}

func handleCreateCredential(ctx context.Context, s *Server, args createCredentialArgs) (toolResult, error) {
	opID, err := s.resolveOperation(ctx, args.OperationID)
	if err != nil {
		return toolResult{}, err
	}
	if _, err := s.authorizeOperation(ctx, opID, models.OperationRoleOperator); err != nil {
		return toolResult{}, err
	}

	credType := models.CredentialType(strings.ToUpper(strings.TrimSpace(args.Type)))
	if !credType.IsValid() {
		return toolResult{}, fmt.Errorf(
			"type %q is not one of PASSWORD, SSH_KEY, API_KEY, TOKEN, HASH, OTHER", args.Type)
	}

	input := model.CreateCredentialInput{
		Name:     args.Name,
		Type:     credType,
		Username: optionalString(args.Username),
		Password: optionalString(args.Password),
		Tags:     args.Tags,
		IsValid:  args.IsValid,
	}
	for _, k := range args.Keys {
		input.Keys = append(input.Keys, &model.CredentialKeyInput{Name: k.Name, Content: k.Content})
	}
	for _, prop := range args.Properties {
		input.Properties = append(input.Properties, &model.CredentialPropertyInput{Name: prop.Name, Value: prop.Value})
	}

	cred, err := s.deps.Credentials.CreateCredential(ctx, opID.String(), input)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to create credential: %w", err)
	}

	return toolResult{
		Payload:     toCredentialView(cred),
		OperationID: &opID,
		SubjectID:   cred.CredentialID,
		SubjectKind: models.SubjectKindCredential,
		SubjectName: cred.Name,
		Summary:     fmt.Sprintf("recorded credential %s", cred.Name),
	}, nil
}

func handleGetCredential(ctx context.Context, s *Server, args getCredentialArgs) (toolResult, error) {
	cred, err := s.deps.Credentials.Credential(ctx, args.CredentialID)
	if err != nil {
		return toolResult{}, fmt.Errorf("credential not found")
	}
	if _, err := s.authorizeOperation(ctx, cred.OperationID, models.OperationRoleViewer); err != nil {
		return toolResult{}, err
	}

	view := struct {
		credentialView
		Keys       []credentialKeyView      `json:"keys,omitempty"`
		Properties []credentialPropertyView `json:"properties,omitempty"`
		Comments   []credentialCommentView  `json:"comments,omitempty"`
	}{credentialView: toCredentialView(cred)}

	for _, k := range cred.Keys {
		view.Keys = append(view.Keys, credentialKeyView{Name: k.Name, Content: k.Content})
	}
	for _, prop := range cred.Properties {
		view.Properties = append(view.Properties, credentialPropertyView{Name: prop.Name, Value: prop.Value})
	}
	for _, c := range cred.Comments {
		view.Comments = append(view.Comments, credentialCommentView{
			Text: c.Text, CreatedAt: formatTime(c.CreatedAt),
		})
	}

	return toolResult{
		Payload:     view,
		OperationID: &cred.OperationID,
		Summary:     fmt.Sprintf("read credential %s", cred.Name),
	}, nil
}

func handleAddCredentialComment(ctx context.Context, s *Server, args addCredentialCommentArgs) (toolResult, error) {
	cred, err := s.deps.Credentials.Credential(ctx, args.CredentialID)
	if err != nil {
		return toolResult{}, fmt.Errorf("credential not found")
	}
	if _, err := s.authorizeOperation(ctx, cred.OperationID, models.OperationRoleOperator); err != nil {
		return toolResult{}, err
	}

	updated, err := s.deps.Credentials.AddCredentialComment(ctx, args.CredentialID, args.Text)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to add comment: %w", err)
	}
	return toolResult{
		Payload:     toCredentialView(updated),
		OperationID: &cred.OperationID,
		SubjectID:   cred.CredentialID,
		SubjectKind: models.SubjectKindCredential,
		SubjectName: cred.Name,
		Summary:     fmt.Sprintf("commented on credential %s", cred.Name),
	}, nil
}

// --- Hashes ---

type findHashesArgs struct {
	OperationID string   `json:"operation_id,omitempty" jsonschema:"Operation to search. Defaults to whatever the operator currently has open."`
	Search      string   `json:"search,omitempty"       jsonschema:"Free-text match against the hash value."`
	Tags        []string `json:"tags,omitempty"         jsonschema:"Only hashes carrying all of these tags."`
	Limit       int      `json:"limit,omitempty"        jsonschema:"Maximum hashes to return (default 25, maximum 50)."`
	Cursor      string   `json:"cursor,omitempty"       jsonschema:"Continue a previous page using its nextCursor."`
}

func registerHashTools(s *Server) {
	register(s, &mcp.Tool{
		Name: "find_hashes",
		Description: "Search captured hashes. Cracked hashes carry the id of the credential " +
			"they produced.",
	}, readTool, handleFindHashes)
}

func handleFindHashes(ctx context.Context, s *Server, args findHashesArgs) (toolResult, error) {
	opID, err := s.resolveOperation(ctx, args.OperationID)
	if err != nil {
		return toolResult{}, err
	}
	if _, err := s.authorizeOperation(ctx, opID, models.OperationRoleViewer); err != nil {
		return toolResult{}, err
	}

	limit := clampPageSize(args.Limit)
	conn, err := s.deps.Hashes.Hashes(ctx, opID.String(), optionalString(args.Search), nil,
		args.Tags, nil, &limit, optionalString(args.Cursor), nil, nil)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to search hashes: %w", err)
	}

	views := make([]hashView, 0, len(conn.Edges))
	for _, edge := range conn.Edges {
		views = append(views, toHashView(edge.Node))
	}

	result, err := newPage(views, endCursor(conn.PageInfo), totalNote(conn.TotalCount, len(views))...)
	if err != nil {
		return toolResult{}, err
	}
	return toolResult{
		Payload:     result,
		OperationID: &opID,
		Summary:     fmt.Sprintf("searched hashes (%d shown of %d)", len(views), conn.TotalCount),
	}, nil
}

// --- Shared helpers ---

// optionalString maps the empty string to nil, because the resolver layer
// treats a non-nil empty filter as "match the empty string" rather than
// "no filter".
func optionalString(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

func endCursor(info *pagination.PageInfo) string {
	if info == nil || !info.HasNextPage || info.EndCursor == nil {
		return ""
	}
	return *info.EndCursor
}

// totalNote tells the agent when there is more behind the page it got. Without
// it a model reads 25 of 400 credentials and concludes it has seen them all.
func totalNote(total, shown int) []string {
	if total > shown {
		return []string{fmt.Sprintf(
			"%d of %d results shown. Use the cursor to page, or narrow the search.", shown, total)}
	}
	return nil
}
