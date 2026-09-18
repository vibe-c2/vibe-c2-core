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
	Validity    []string `json:"validity,omitempty"     jsonschema:"Only these states: UNKNOWN, VALID, INVALID. Omit for all."`
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
	Tags     []string `json:"tags,omitempty"     jsonschema:"Tags, e.g. the source host."`
	Validity string   `json:"validity,omitempty" jsonschema:"VALID if you have used it, INVALID if it was rejected. Omit for UNKNOWN: recorded, untried."`
}

type getCredentialArgs struct {
	CredentialID string `json:"credential_id" jsonschema:"Credential id."`
}

// updateCredentialArgs is a partial update: every field is a pointer or a
// slice so that "not mentioned" and "set to empty" stay distinguishable.
// Omitting a field leaves it untouched, which is what makes it safe to fix
// one thing about a credential without knowing the rest of it.
type updateCredentialArgs struct {
	IdempotencyKey
	CredentialID string  `json:"credential_id"      jsonschema:"Credential id."`
	Name         *string `json:"name,omitempty"     jsonschema:"New name; omit to leave it."`
	Type         *string `json:"type,omitempty"     jsonschema:"PASSWORD, SSH_KEY, API_KEY, TOKEN, HASH or OTHER."`
	Username     *string `json:"username,omitempty" jsonschema:"New account name; omit to leave it."`
	Password     *string `json:"password,omitempty" jsonschema:"New secret; omit to leave it."`
	Keys         []struct {
		Name    string `json:"name"    jsonschema:"e.g. id_rsa"`
		Content string `json:"content" jsonschema:"Key material."`
	} `json:"keys,omitempty" jsonschema:"Replaces every key. Omit to leave them; send [] to clear them."`
	Properties []struct {
		Name  string `json:"name"  jsonschema:"e.g. domain, port"`
		Value string `json:"value"`
	} `json:"properties,omitempty" jsonschema:"Replaces every property. Omit to leave them; send [] to clear them."`
	Tags     []string `json:"tags,omitempty"     jsonschema:"Replaces every tag. Omit to leave them; send [] to clear them."`
	Validity *string  `json:"validity,omitempty" jsonschema:"VALID once you have used it, INVALID once it has been rejected, UNKNOWN to withdraw a claim."`
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
		Name: "update_credential",
		Description: "Correct a credential you or somebody else recorded. Send only the fields " +
			"that change; anything omitted is left alone. Set validity:\"VALID\" once you have " +
			"actually used it, \"INVALID\" once the target rejected it.",
	}, writeTool, handleUpdateCredential)

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
	validity, err := parseCredentialValidities(args.Validity)
	if err != nil {
		return toolResult{}, err
	}

	conn, err := s.deps.Credentials.Credentials(ctx, opID.String(), optionalString(args.Search),
		nil, nil, args.Tags, validity, nil, nil, &limit, optionalString(args.Cursor), nil, nil)
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
	}
	if args.Validity != "" {
		validity, err := parseCredentialValidity(args.Validity)
		if err != nil {
			return toolResult{}, err
		}
		input.Validity = &validity
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

// buildUpdateCredentialInput turns a partial set of arguments into the
// resolver's input without touching anything the caller did not mention.
//
// The distinction is three-way and only survives if the arguments keep
// pointers and nil slices: a field can be left alone, set to a value, or
// emptied. Collapsing "not mentioned" into "empty" would let an agent
// correcting a password silently delete every key on the credential.
func buildUpdateCredentialInput(args updateCredentialArgs) (model.UpdateCredentialInput, error) {
	input := model.UpdateCredentialInput{
		Name:     args.Name,
		Username: args.Username,
		Password: args.Password,
		Tags:     args.Tags,
	}
	if args.Validity != nil {
		validity, err := parseCredentialValidity(*args.Validity)
		if err != nil {
			return input, err
		}
		input.Validity = &validity
	}
	if args.Type != nil {
		credType := models.CredentialType(upperTrim(*args.Type))
		if !credType.IsValid() {
			return input, refuse(
				"type %q is not one of PASSWORD, SSH_KEY, API_KEY, TOKEN, HASH, OTHER", *args.Type)
		}
		input.Type = &credType
	}
	// Non-nil and empty are different answers: one replaces the list, the
	// other clears it. Both differ from omitting the field.
	if args.Keys != nil {
		input.Keys = make([]*model.CredentialKeyInput, 0, len(args.Keys))
		for _, k := range args.Keys {
			input.Keys = append(input.Keys, &model.CredentialKeyInput{Name: k.Name, Content: k.Content})
		}
	}
	if args.Properties != nil {
		input.Properties = make([]*model.CredentialPropertyInput, 0, len(args.Properties))
		for _, prop := range args.Properties {
			input.Properties = append(input.Properties, &model.CredentialPropertyInput{Name: prop.Name, Value: prop.Value})
		}
	}
	return input, nil
}

// upperTrim normalises an enum the agent typed.
func upperTrim(v string) string { return strings.ToUpper(strings.TrimSpace(v)) }

// parseCredentialValidity accepts the enum in whatever case the agent typed
// and refuses anything else by name, rather than quietly picking a state on
// its behalf — validity is a claim about the target, so a guess is worse than
// a refusal.
func parseCredentialValidity(v string) (models.CredentialValidity, error) {
	validity := models.CredentialValidity(upperTrim(v))
	if !validity.IsValid() {
		return "", refuse("validity %q is not one of UNKNOWN, VALID, INVALID", v)
	}
	return validity, nil
}

func parseCredentialValidities(vs []string) ([]models.CredentialValidity, error) {
	out := make([]models.CredentialValidity, 0, len(vs))
	for _, v := range vs {
		validity, err := parseCredentialValidity(v)
		if err != nil {
			return nil, err
		}
		out = append(out, validity)
	}
	return out, nil
}

// handleUpdateCredential applies a partial change to an existing credential.
//
// The common case is settling validity. A credential is recorded before
// anyone has tried it and stays UNKNOWN until somebody does; this is how an
// agent says which way it went once it has.
func handleUpdateCredential(ctx context.Context, s *Server, args updateCredentialArgs) (toolResult, error) {
	cred, err := s.loadCredential(ctx, args.CredentialID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}

	input, err := buildUpdateCredentialInput(args)
	if err != nil {
		return toolResult{}, err
	}

	updated, err := s.deps.Credentials.UpdateCredential(ctx, cred.CredentialID.String(), input)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to update credential: %w", err)
	}

	return toolResult{
		Payload:     toCredentialView(updated),
		OperationID: &cred.OperationID,
		Summary:     summarizeCredentialUpdate(updated, args),
	}, nil
}

// summarizeCredentialUpdate is the line the operator sees in the activity
// rail. Validity leads when it changed, because that is the fact other people
// act on.
func summarizeCredentialUpdate(cred *models.Credential, args updateCredentialArgs) string {
	if args.Validity != nil {
		switch cred.Validity {
		case models.CredentialValidityValid:
			return fmt.Sprintf("marked the credential %q as working", cred.Name)
		case models.CredentialValidityInvalid:
			return fmt.Sprintf("marked the credential %q as not working", cred.Name)
		default:
			return fmt.Sprintf("marked the credential %q as untested", cred.Name)
		}
	}
	return fmt.Sprintf("updated the credential %q", cred.Name)
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
