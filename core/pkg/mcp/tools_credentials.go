package mcp

import (
	"context"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

type findCredentialsArgs struct {
	OperationID string   `json:"operation_id,omitempty" jsonschema:"Operation id; omit for the operator's current one."`
	Search      string   `json:"search,omitempty"       jsonschema:"Free-text match against name and username."`
	Tags        []string `json:"tags,omitempty"         jsonschema:"Only credentials carrying all of these tags."`
	ValidOnly   bool     `json:"valid_only,omitempty"   jsonschema:"Only credentials marked valid."`
	Limit       int      `json:"limit,omitempty"        jsonschema:"Page size, max 50."`
	Cursor      string   `json:"cursor,omitempty"       jsonschema:"nextCursor from the previous page."`
}

type createCredentialArgs struct {
	IdempotencyKey
	OperationID string `json:"operation_id,omitempty" jsonschema:"Operation id; omit for the operator's current one."`
	Name        string `json:"name"                   jsonschema:"e.g. 'web-01 local admin'"`
	Type        string `json:"type"                   jsonschema:"PASSWORD, SSH_KEY, API_KEY, TOKEN, HASH or OTHER."`
	Username    string `json:"username,omitempty"     jsonschema:"Account name."`
	Password    string `json:"password,omitempty"     jsonschema:"The secret."`
	Keys        []struct {
		Name    string `json:"name"    jsonschema:"e.g. id_rsa"`
		Content string `json:"content" jsonschema:"Key material."`
	} `json:"keys,omitempty" jsonschema:"Key material for SSH_KEY and API_KEY."`
	Properties []struct {
		Name  string `json:"name"  jsonschema:"e.g. domain, port"`
		Value string `json:"value"`
	} `json:"properties,omitempty" jsonschema:"Extra fields."`
	Tags    []string `json:"tags,omitempty"     jsonschema:"Tags, e.g. the source host."`
	IsValid *bool    `json:"is_valid,omitempty" jsonschema:"Known to work; omit if untested."`
}

type getCredentialArgs struct {
	CredentialID string `json:"credential_id" jsonschema:"Credential id."`
}

type addCredentialCommentArgs struct {
	IdempotencyKey
	CredentialID string `json:"credential_id" jsonschema:"Credential id."`
	Text         string `json:"text"          jsonschema:"Comment text."`
}

func registerCredentialTools(s *Server) {
	register(s, &mcp.Tool{
		Name:        "find_credentials",
		Description: "Search harvested credentials. Secret material is included.",
	}, readTool, handleFindCredentials)

	register(s, &mcp.Tool{
		Name:        "create_credential",
		Description: "Record a recovered credential: a password, an SSH key, a token.",
	}, writeTool, handleCreateCredential)

	register(s, &mcp.Tool{
		Name:        "get_credential",
		Description: "One credential in full: keys, properties and comment history.",
	}, readTool, handleGetCredential)

	register(s, &mcp.Tool{
		Name:        "add_credential_comment",
		Description: "Append a comment to a credential: where found, what it opens, if it works.",
	}, writeTool, handleAddCredentialComment)
}

func handleFindCredentials(ctx context.Context, s *Server, args findCredentialsArgs) (toolResult, error) {
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleViewer)
	if err != nil {
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
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleOperator)
	if err != nil {
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
		Summary:     fmt.Sprintf("recorded credential %s", cred.Name),
	}, nil
}

func handleGetCredential(ctx context.Context, s *Server, args getCredentialArgs) (toolResult, error) {
	cred, err := s.loadCredential(ctx, args.CredentialID, models.OperationRoleViewer)
	if err != nil {
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
	cred, err := s.loadCredential(ctx, args.CredentialID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}

	updated, err := s.deps.Credentials.AddCredentialComment(ctx, args.CredentialID, args.Text)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to add comment: %w", err)
	}
	return toolResult{
		Payload:     toCredentialView(updated),
		OperationID: &cred.OperationID,
		Summary:     fmt.Sprintf("commented on credential %s", cred.Name),
	}, nil
}
