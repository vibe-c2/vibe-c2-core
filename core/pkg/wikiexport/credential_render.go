package wikiexport

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// credentialFenceInfo is the info-string the hocuspocus serializer uses on
// every credential reference fence. Mirrors CREDENTIAL_FENCE_INFO in
// hocuspocus/src/markdown-serializer.ts — any change here MUST be made in
// both places at once or the export and the importer will silently drift.
const credentialFenceInfo = "vibe-credential"

// credentialFencePattern matches a fenced code block whose info-string is
// exactly `vibe-credential`. The body (group 1) is captured greedily up to
// the first closing fence of equal length on its own line. The hocuspocus
// serializer always emits triple-backtick fences (no language with
// backticks in the JSON), so a tight match on ``` is sufficient.
//
// Multiline `(?s)` flag is set so `.` matches newlines inside the body.
var credentialFencePattern = regexp.MustCompile(
	"(?s)```" + credentialFenceInfo + "\\s*\\n(.*?)\\n```",
)

// CredentialLookup is the read-side dependency the export orchestrator
// uses to hydrate `vibe-credential` fence bodies with the full credential
// payload. Satisfied in production by a thin wrapper around the credential
// repository; tests substitute a map-backed fake.
//
// FindByID must return the credential WITH its operation_id so the caller
// can enforce the per-document operation scope (credentials from a
// different operation must NOT be embedded — see the rewriter for the
// behavior).
type CredentialLookup interface {
	FindByID(ctx context.Context, id uuid.UUID) (models.Credential, error)
}

// hydrateCredentialFences walks every `vibe-credential` fence in body,
// looks up the credential by id via lookup, and rewrites the fence body
// with the full credential payload (or a tombstone for missing /
// cross-operation references). Refs the resolver returns `(false)` for are
// left as tombstones so plain markdown readers see a recognisable "deleted"
// marker rather than a vanished credential id.
//
// docOperationID gates which credentials may be embedded. A chip
// referencing a credential in a different operation is silently lowered
// to a tombstone — chips never carried real cross-op semantics
// (credentials are operation-private; see persistence.ts:35-38) so
// emitting the full record would either leak data or break the
// operation-private boundary.
//
// Returns the rewritten body plus the count of hydrated and tombstoned
// references so the orchestrator can roll them into the export report.
func hydrateCredentialFences(
	ctx context.Context,
	body string,
	docOperationID uuid.UUID,
	lookup CredentialLookup,
) (rewritten string, hydrated int, tombstoned int) {
	if lookup == nil || !strings.Contains(body, credentialFenceInfo) {
		return body, 0, 0
	}

	// Resolve each unique id at most once. A doc that references the same
	// credential five times produces five identical fence bodies; one
	// lookup is enough.
	payloads := map[string]string{}
	tombstones := map[string]string{}

	rewritten = credentialFencePattern.ReplaceAllStringFunc(body, func(match string) string {
		bodyMatch := credentialFencePattern.FindStringSubmatch(match)
		if len(bodyMatch) < 2 {
			return match
		}
		fenceBody := bodyMatch[1]

		// Pull the id out of the fence body. The serializer always emits an
		// `id` field; if it's missing or malformed, leave the fence as-is —
		// we don't want to mangle a fence we don't fully understand.
		var parsed struct {
			ID      string `json:"id"`
			Deleted bool   `json:"deleted"`
		}
		if err := json.Unmarshal([]byte(fenceBody), &parsed); err != nil {
			return match
		}
		if parsed.ID == "" {
			return match
		}

		// Already-tombstoned fences (deleted=true) pass through unchanged.
		// The orchestrator might run a re-export of a previously-exported
		// doc; a tombstone stays a tombstone.
		if parsed.Deleted {
			return match
		}

		// Cached hit — reuse the previously-rendered fence body.
		if cached, ok := payloads[parsed.ID]; ok {
			return cached
		}
		if cached, ok := tombstones[parsed.ID]; ok {
			return cached
		}

		credID, err := uuid.Parse(parsed.ID)
		if err != nil {
			// Unparseable id — emit a tombstone with the raw id so the
			// reader at least sees what was referenced.
			tomb := buildTombstoneFence(parsed.ID)
			tombstones[parsed.ID] = tomb
			tombstoned++
			return tomb
		}

		cred, err := lookup.FindByID(ctx, credID)
		if err != nil || cred.CredentialID == uuid.Nil || cred.OperationID != docOperationID {
			tomb := buildTombstoneFence(parsed.ID)
			tombstones[parsed.ID] = tomb
			tombstoned++
			return tomb
		}

		full := buildCredentialFence(&cred)
		payloads[parsed.ID] = full
		hydrated++
		return full
	})

	return rewritten, hydrated, tombstoned
}

// buildCredentialFence renders a credential as the canonical exported
// fence: triple-backtick `vibe-credential` info-string, a pretty-printed
// JSON body, closing fence. Field order matches the JSON shape every
// downstream consumer expects (import orchestrator, future Vibe instances).
func buildCredentialFence(c *models.Credential) string {
	payload := credentialFencePayload{
		ID:         c.CredentialID.String(),
		Name:       c.Name,
		Type:       string(c.Type),
		Username:   c.Username,
		Password:   c.Password,
		Keys:       toFenceKeys(c.Keys),
		Properties: toFenceProperties(c.Properties),
		IsValid:    c.IsValid,
		Tags:       append([]string(nil), c.Tags...),
	}
	enc, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		// MarshalIndent on the typed payload should not fail; defensive
		// fallback emits a tombstone so the export keeps going.
		return buildTombstoneFence(c.CredentialID.String())
	}
	return "```" + credentialFenceInfo + "\n" + string(enc) + "\n```"
}

// buildTombstoneFence emits the deleted/missing form of the credential
// fence. Same info-string so the importer's lifter still recognises it;
// the `deleted: true` discriminator tells the importer not to attempt a
// resolve-or-create.
func buildTombstoneFence(id string) string {
	payload := struct {
		ID      string `json:"id"`
		Deleted bool   `json:"deleted"`
	}{ID: id, Deleted: true}
	enc, _ := json.MarshalIndent(payload, "", "  ")
	return "```" + credentialFenceInfo + "\n" + string(enc) + "\n```"
}

// credentialFencePayload is the on-the-wire schema for hydrated credential
// fences. Fields are intentionally a subset of models.Credential:
//   - CreatedByID and Comments are skipped (lose meaning across instances).
//   - DefaultField timestamps are skipped (not user-meaningful).
//
// JSON tags use camelCase to match the editor's existing client-side shape.
type credentialFencePayload struct {
	ID         string              `json:"id"`
	Name       string              `json:"name,omitempty"`
	Type       string              `json:"type,omitempty"`
	Username   string              `json:"username,omitempty"`
	Password   string              `json:"password,omitempty"`
	Keys       []fenceKey          `json:"keys,omitempty"`
	Properties []fenceProperty     `json:"properties,omitempty"`
	IsValid    bool                `json:"isValid"`
	Tags       []string            `json:"tags,omitempty"`
}

type fenceKey struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type fenceProperty struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

func toFenceKeys(in []models.CredentialKey) []fenceKey {
	if len(in) == 0 {
		return nil
	}
	out := make([]fenceKey, len(in))
	for i, k := range in {
		out[i] = fenceKey{Name: k.Name, Content: k.Content}
	}
	return out
}

func toFenceProperties(in []models.CredentialProperty) []fenceProperty {
	if len(in) == 0 {
		return nil
	}
	out := make([]fenceProperty, len(in))
	for i, p := range in {
		out[i] = fenceProperty{Name: p.Name, Value: p.Value}
	}
	return out
}

// credentialRepoLookup adapts the credential repository to the
// CredentialLookup interface. Lives here so callers in the app wiring can
// pass a single concrete value to NewOrchestrator without the orchestrator
// taking a dependency on the whole repository.
type credentialRepoLookup struct {
	repo repository.ICredentialRepository
}

// NewCredentialRepoLookup wraps a credential repository in the narrow
// CredentialLookup interface the export orchestrator consumes.
func NewCredentialRepoLookup(repo repository.ICredentialRepository) CredentialLookup {
	if repo == nil {
		return nil
	}
	return &credentialRepoLookup{repo: repo}
}

func (l *credentialRepoLookup) FindByID(ctx context.Context, id uuid.UUID) (models.Credential, error) {
	return l.repo.FindByID(ctx, id)
}
