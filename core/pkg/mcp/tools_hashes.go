package mcp

import (
	"context"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

type findHashesArgs struct {
	OperationID string   `json:"operation_id,omitempty" jsonschema:"Operation id; omit for the operator's current one."`
	Search      string   `json:"search,omitempty"       jsonschema:"Free-text match against the hash value."`
	Status      string   `json:"status,omitempty"       jsonschema:"Only this status: NOT_PROCESSED, QUEUED, CRACKING, CRACKED or FAILED."`
	Tags        []string `json:"tags,omitempty"         jsonschema:"Only hashes carrying all of these tags."`
	Limit       int      `json:"limit,omitempty"        jsonschema:"Page size, max 50."`
	Cursor      string   `json:"cursor,omitempty"       jsonschema:"nextCursor from the previous page."`
}

type getHashArgs struct {
	HashID string `json:"hash_id" jsonschema:"Hash id."`
}

type createHashArgs struct {
	IdempotencyKey
	OperationID string   `json:"operation_id,omitempty" jsonschema:"Operation id; omit for the operator's current one."`
	Value       string   `json:"value"                  jsonschema:"The hash, as the tooling produced it."`
	Status      string   `json:"status,omitempty"       jsonschema:"NOT_PROCESSED (default), QUEUED, CRACKING, CRACKED or FAILED."`
	Comment     string   `json:"comment,omitempty"      jsonschema:"Where it came from."`
	Tags        []string `json:"tags,omitempty"         jsonschema:"Tags, e.g. the source host."`
}

type importHashesArgs struct {
	IdempotencyKey
	OperationID string   `json:"operation_id,omitempty" jsonschema:"Operation id; omit for the operator's current one."`
	Text        string   `json:"text"                   jsonschema:"Dump text, one hash per line; known ones are skipped."`
	Comment     string   `json:"comment,omitempty"      jsonschema:"Applied to every imported hash."`
	Tags        []string `json:"tags,omitempty"         jsonschema:"Applied to every imported hash."`
}

type updateHashArgs struct {
	IdempotencyKey
	HashID  string   `json:"hash_id"           jsonschema:"Hash id."`
	Status  string   `json:"status,omitempty"  jsonschema:"NOT_PROCESSED, QUEUED, CRACKING, CRACKED or FAILED. For a successful crack use mark_hash_cracked."`
	Comment string   `json:"comment,omitempty" jsonschema:"New comment."`
	Tags    []string `json:"tags,omitempty"    jsonschema:"REPLACES the tag list."`
}

type markHashCrackedArgs struct {
	IdempotencyKey
	HashID string `json:"hash_id"                 jsonschema:"Hash id."`
	// Either link an existing credential or create one. Creating is the usual
	// case: a crack normally produces a secret nothing has recorded yet.
	CredentialID string   `json:"credential_id,omitempty" jsonschema:"Link an existing credential instead of creating one."`
	Name         string   `json:"name,omitempty"          jsonschema:"Name for the new credential; required without credential_id."`
	Username     string   `json:"username,omitempty"      jsonschema:"Account name."`
	Password     string   `json:"password,omitempty"      jsonschema:"Recovered plaintext."`
	Tags         []string `json:"tags,omitempty"          jsonschema:"Tags for the new credential."`
}

func registerHashTools(s *Server) {
	register(s, &mcp.Tool{
		Name: "find_hashes",
		Description: "Search captured hashes. Long values are clipped in listings; get_hash " +
			"returns one whole. Cracked hashes carry the id of the credential they produced.",
	}, readTool, handleFindHashes)

	register(s, &mcp.Tool{
		Name:        "get_hash",
		Description: "One hash with its full value and, if cracked, its credential.",
	}, readTool, handleGetHash)

	register(s, &mcp.Tool{
		Name:        "create_hash",
		Description: "Record a single captured hash. For a dump of many, use import_hashes.",
	}, writeTool, handleCreateHash)

	register(s, &mcp.Tool{
		Name:        "import_hashes",
		Description: "Import a dump, one hash per line. Known hashes are skipped, so re-importing is safe.",
	}, writeTool, handleImportHashes)

	register(s, &mcp.Tool{
		Name:        "update_hash",
		Description: "Change a hash's status, comment or tags.",
	}, writeTool, handleUpdateHash)

	register(s, &mcp.Tool{
		Name: "mark_hash_cracked",
		Description: "Record a crack: creates (or links) the credential and marks the hash " +
			"CRACKED. Prefer it over update_hash, which leaves the plaintext nowhere.",
	}, writeTool, handleMarkHashCracked)
}

func handleGetHash(ctx context.Context, s *Server, args getHashArgs) (toolResult, error) {
	hash, err := s.loadHash(ctx, args.HashID, models.OperationRoleViewer)
	if err != nil {
		return toolResult{}, err
	}
	return toolResult{
		Payload:     toHashView(hash),
		OperationID: &hash.OperationID,
		Summary:     fmt.Sprintf("read hash %s", hashLabel(hash)),
	}, nil
}

// parseHashStatus maps the caller's string, defaulting to nil so the resolver
// applies its own default rather than this layer guessing one.
func parseHashStatus(raw string) (*models.HashStatus, error) {
	if raw == "" {
		return nil, nil
	}
	status := models.HashStatus(strings.ToUpper(strings.TrimSpace(raw)))
	if !status.IsValid() {
		return nil, fmt.Errorf(
			"status %q is not one of NOT_PROCESSED, QUEUED, CRACKING, CRACKED, FAILED", raw)
	}
	return &status, nil
}

func handleCreateHash(ctx context.Context, s *Server, args createHashArgs) (toolResult, error) {
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}
	status, err := parseHashStatus(args.Status)
	if err != nil {
		return toolResult{}, err
	}

	hash, err := s.deps.Hashes.CreateHash(ctx, opID.String(), model.CreateHashInput{
		Value:   args.Value,
		Status:  status,
		Comment: optionalString(args.Comment),
		Tags:    args.Tags,
	})
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to create hash: %w", err)
	}

	return toolResult{
		Payload:     toHashView(hash),
		OperationID: &opID,
		Summary:     fmt.Sprintf("recorded hash %s", hashLabel(hash)),
	}, nil
}

func handleImportHashes(ctx context.Context, s *Server, args importHashesArgs) (toolResult, error) {
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}

	res, err := s.deps.Hashes.BulkImportHashes(ctx, opID.String(), model.BulkImportHashesInput{
		Text:    args.Text,
		Tags:    args.Tags,
		Comment: optionalString(args.Comment),
	})
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to import hashes: %w", err)
	}

	// The full hash list is deliberately not returned: a dump is routinely
	// thousands of lines, and the agent asked to import them, not to read them
	// back. find_hashes is there when it wants them.
	payload := struct {
		Added   int      `json:"added"`
		Skipped int      `json:"skipped"`
		Notes   []string `json:"notes,omitempty"`
	}{Added: res.Added, Skipped: res.Skipped}
	if res.Skipped > 0 {
		payload.Notes = append(payload.Notes,
			fmt.Sprintf("%d were already recorded in this operation and were not added again.", res.Skipped))
	}

	return toolResult{
		Payload:     payload,
		OperationID: &opID,
		Summary:     fmt.Sprintf("imported %d hashes (%d already known)", res.Added, res.Skipped),
	}, nil
}

func handleUpdateHash(ctx context.Context, s *Server, args updateHashArgs) (toolResult, error) {
	hash, err := s.loadHash(ctx, args.HashID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}
	status, err := parseHashStatus(args.Status)
	if err != nil {
		return toolResult{}, err
	}

	updated, err := s.deps.Hashes.UpdateHash(ctx, args.HashID, model.UpdateHashInput{
		Status:  status,
		Comment: optionalString(args.Comment),
		Tags:    args.Tags,
	})
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to update hash: %w", err)
	}

	return toolResult{
		Payload:     toHashView(updated),
		OperationID: &hash.OperationID,
		Summary:     fmt.Sprintf("updated hash %s", hashLabel(updated)),
	}, nil
}

func handleMarkHashCracked(ctx context.Context, s *Server, args markHashCrackedArgs) (toolResult, error) {
	hash, err := s.loadHash(ctx, args.HashID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}

	crackedValidity := models.CredentialValidityValid
	input := model.MarkHashCrackedInput{}
	switch {
	case args.CredentialID != "":
		input.CredentialID = &args.CredentialID
	case args.Name != "":
		input.NewCredential = &model.CreateCredentialInput{
			Name:     args.Name,
			Type:     models.CredentialTypePassword,
			Username: optionalString(args.Username),
			Password: optionalString(args.Password),
			Tags:     args.Tags,
			// A cracked hash is a working secret by definition, so record it
			// as valid rather than leaving the operator to confirm it.
			Validity: &crackedValidity,
		}
	default:
		return toolResult{}, fmt.Errorf(
			"give either credential_id to link an existing credential, or name (and usually password) to create one")
	}

	updated, err := s.deps.Hashes.MarkHashCracked(ctx, args.HashID, input)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to mark the hash cracked: %w", err)
	}

	return toolResult{
		Payload:     toHashView(updated),
		OperationID: &hash.OperationID,
		Summary:     fmt.Sprintf("marked hash %s cracked and recorded its credential", hashLabel(updated)),
	}, nil
}

// hashLabel is how a hash is named on the activity rail. Hash values are long and
// meaningless at a glance, so it matches how the rest of the app names them:
// truncated, never the whole thing.
func hashLabel(h *models.Hash) string {
	const max = 24
	if len(h.Value) <= max {
		return h.Value
	}
	return h.Value[:max] + "…"
}

func handleFindHashes(ctx context.Context, s *Server, args findHashesArgs) (toolResult, error) {
	opID, err := s.scopedOperation(ctx, args.OperationID, models.OperationRoleViewer)
	if err != nil {
		return toolResult{}, err
	}

	status, err := parseHashStatus(args.Status)
	if err != nil {
		return toolResult{}, err
	}
	var statuses []models.HashStatus
	if status != nil {
		statuses = []models.HashStatus{*status}
	}

	limit := clampPageSize(args.Limit)
	conn, err := s.deps.Hashes.Hashes(ctx, opID.String(), optionalString(args.Search), statuses,
		args.Tags, nil, &limit, optionalString(args.Cursor), nil, nil)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to search hashes: %w", err)
	}

	views := make([]hashView, 0, len(conn.Edges))
	for _, edge := range conn.Edges {
		views = append(views, toHashListView(edge.Node))
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
