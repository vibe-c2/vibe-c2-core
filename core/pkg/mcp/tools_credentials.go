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
		Summary:     fmt.Sprintf("commented on credential %s", cred.Name),
	}, nil
}
