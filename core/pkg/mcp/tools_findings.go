package mcp

import (
	"context"
	"fmt"

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
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation to create the host in. Defaults to whatever the operator currently has open."`
	Hostname    string `json:"hostname"               jsonschema:"The host's name."`
	OS          string `json:"os,omitempty"           jsonschema:"Free-text OS fingerprint, e.g. 'Windows Server 2019'."`
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
		Name:        "create_host",
		Description: "Record a newly discovered host.",
	}, writeTool, handleCreateHost)
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
		Hostname: args.Hostname,
		Os:       optionalString(args.OS),
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

// --- Credentials ---

type findCredentialsArgs struct {
	OperationID string   `json:"operation_id,omitempty" jsonschema:"Operation to search. Defaults to whatever the operator currently has open."`
	Search      string   `json:"search,omitempty"       jsonschema:"Free-text match against name and username."`
	Tags        []string `json:"tags,omitempty"         jsonschema:"Only credentials carrying all of these tags."`
	ValidOnly   bool     `json:"valid_only,omitempty"   jsonschema:"Only credentials currently marked valid."`
	Limit       int      `json:"limit,omitempty"        jsonschema:"Maximum credentials to return (default 25, maximum 50)."`
	Cursor      string   `json:"cursor,omitempty"       jsonschema:"Continue a previous page using its nextCursor."`
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
