package wikiimport

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// credentialFenceInfo MUST stay in sync with CREDENTIAL_FENCE_INFO in
// hocuspocus/src/markdown-serializer.ts and wikiexport.credentialFenceInfo.
// Changing the discriminator on one side without the others silently breaks
// round-trip.
const credentialFenceInfo = "vibe-credential"

// credentialFencePattern matches the same ```vibe-credential\n…\n``` shape
// the export orchestrator emits. Multiline-dotall (`(?s)`) lets the body
// span lines; the body itself is captured greedily up to the first closing
// fence on its own line.
var credentialFencePattern = regexp.MustCompile(
	"(?s)```" + credentialFenceInfo + "\\s*\\n(.*?)\\n```",
)

// CredentialReconciler resolves-or-creates credentials referenced from
// imported wiki markdown and returns a map from the in-fence credential id
// (the export-time id) to the final id that lives in the target operation.
//
// The caller rewrites every fence's id field in the markdown body using the
// returned map before handing the markdown to markdownToYjs. Tombstone
// fences (`deleted: true`) are passed through unchanged.
//
// `targetOperationID` is the operation the import is landing into. Per the
// operation-private credential boundary (persistence.ts:35-38), this is the
// ONLY operation we will reuse or create a credential in — a payload that
// happens to have an id matching a credential in some other operation is
// treated as "not found here" and triggers a fresh create.
type CredentialReconciler struct {
	repo            repository.ICredentialRepository
	targetOperation uuid.UUID
}

// NewCredentialReconciler constructs a reconciler scoped to one operation
// and one credential repository. The reconciler is stateless beyond those
// two fields and may be reused across documents within the same import.
func NewCredentialReconciler(
	repo repository.ICredentialRepository,
	targetOperationID uuid.UUID,
) *CredentialReconciler {
	return &CredentialReconciler{
		repo:            repo,
		targetOperation: targetOperationID,
	}
}

// ReconcileResult bundles the outcome of one ReconcileBody call. Counts
// drive the import report; IDMap is consumed by RewriteFenceIDs.
type ReconcileResult struct {
	// IDMap maps fence-id → final-id. For credentials reused in place the
	// two values are equal; for newly-created credentials the final-id is a
	// fresh uuid. Tombstone fences contribute no entries (their id stays
	// verbatim in the markdown).
	IDMap map[string]string

	// Reused counts ids that already existed in the target operation.
	Reused int

	// Created counts credentials minted from a fence payload.
	Created int

	// Tombstoned counts fences whose payload is {deleted:true}.
	Tombstoned int

	// Skipped counts fences whose payload couldn't be parsed or whose id
	// was unusable. The fence is left as-is in the body — the importer
	// downstream will treat it as a code block (information preserved,
	// chip lost).
	Skipped int
}

// ReconcileBody scans `body` for every credential fence, runs the
// resolve-or-create policy for each unique id, and returns the body with
// every fence's `id` field rewritten to its final value. Failures (parse
// errors, repository Create errors) are absorbed into the result counters
// rather than aborting the import — a missing chip is far less destructive
// than a half-imported doc.
//
// Caller is responsible for the public-operation guard: when the target
// operation is the synthetic Public op, call StripFences instead of
// ReconcileBody so no credentials are created and no chips persist.
func (r *CredentialReconciler) ReconcileBody(
	ctx context.Context,
	body string,
	callerID uuid.UUID,
) (string, ReconcileResult) {
	result := ReconcileResult{IDMap: map[string]string{}}
	if r == nil || r.repo == nil || !strings.Contains(body, "```"+credentialFenceInfo) {
		return body, result
	}

	// Process each unique fence id once. Same-id fences within a single doc
	// (or across docs in the same import) share the resolve-or-create call
	// and the same final-id.
	seen := map[string]struct{}{}
	for _, match := range credentialFencePattern.FindAllStringSubmatch(body, -1) {
		fenceBody := match[1]
		var p fenceInPayload
		if err := json.Unmarshal([]byte(fenceBody), &p); err != nil {
			result.Skipped++
			continue
		}
		if p.ID == "" {
			result.Skipped++
			continue
		}
		if p.Deleted {
			result.Tombstoned++
			continue
		}
		if _, dup := seen[p.ID]; dup {
			continue
		}
		seen[p.ID] = struct{}{}

		finalID, kind := r.resolveOne(ctx, p, callerID)
		switch kind {
		case resolveReused:
			result.Reused++
			result.IDMap[p.ID] = finalID
		case resolveCreated:
			result.Created++
			result.IDMap[p.ID] = finalID
		case resolveSkipped:
			result.Skipped++
		}
	}

	return RewriteFenceIDs(body, result.IDMap), result
}

// StripFences removes every credential fence from body. Used when the
// target operation is the synthetic Public operation, where credential
// chips are forbidden (persistence.ts:185-188 zeroes the inverse index;
// creating credentials there would have no parent operation to scope them
// to anyway).
//
// The body's surrounding paragraphs are kept intact — only the fence runs
// and the single newline that followed each one are excised. Plain
// markdown readers see the doc minus the credential markers.
func StripFences(body string) string {
	return credentialFencePattern.ReplaceAllString(body, "")
}

// RewriteFenceIDs walks every credential fence and rewrites the `id`
// field in the JSON body using idMap. Fences whose id isn't in the map are
// left unchanged (tombstones and skipped payloads fall through this way).
//
// Exported separately from ReconcileBody so the import orchestrator can
// run the lookup-or-create on the unioned set of fences across all docs
// once, then rewrite each doc body in turn. v1 keeps the per-doc
// granularity; the helper stays exported for that future shape.
func RewriteFenceIDs(body string, idMap map[string]string) string {
	if len(idMap) == 0 {
		return body
	}
	return credentialFencePattern.ReplaceAllStringFunc(body, func(match string) string {
		sub := credentialFencePattern.FindStringSubmatch(match)
		if len(sub) < 2 {
			return match
		}
		var p map[string]json.RawMessage
		if err := json.Unmarshal([]byte(sub[1]), &p); err != nil {
			return match
		}
		oldIDRaw, ok := p["id"]
		if !ok {
			return match
		}
		var oldID string
		if err := json.Unmarshal(oldIDRaw, &oldID); err != nil {
			return match
		}
		newID, ok := idMap[oldID]
		if !ok {
			return match
		}
		newRaw, err := json.Marshal(newID)
		if err != nil {
			return match
		}
		p["id"] = newRaw

		// Re-serialise preserving the key order is non-trivial with a map;
		// the importer only needs the resulting markdown to round-trip
		// through the parser, and the parser keys only on the JSON shape
		// (not key order). So a stable MarshalIndent is fine.
		rewritten, err := json.MarshalIndent(p, "", "  ")
		if err != nil {
			return match
		}
		return "```" + credentialFenceInfo + "\n" + string(rewritten) + "\n```"
	})
}

// --- internals ---

type fenceInPayload struct {
	ID         string                 `json:"id"`
	Name       string                 `json:"name"`
	Type       string                 `json:"type"`
	Username   string                 `json:"username"`
	Password   string                 `json:"password"`
	Keys       []fenceInKey           `json:"keys"`
	Properties []fenceInProperty      `json:"properties"`
	IsValid    bool                   `json:"isValid"`
	Tags       []string               `json:"tags"`
	Deleted    bool                   `json:"deleted"`
}

type fenceInKey struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type fenceInProperty struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type resolveKind int

const (
	resolveSkipped resolveKind = iota
	resolveReused
	resolveCreated
)

// resolveOne implements the per-fence policy:
//
//   - id is parseable AND credential exists in target operation → reuse
//   - id is parseable AND credential exists in a different operation → create
//   - id is parseable AND credential does not exist anywhere    → create
//   - id is unparseable / payload incomplete                    → skip
//
// "Skip" leaves the fence in the markdown unchanged; the import surfaces it
// as a code block to the reader so they can see what was referenced.
func (r *CredentialReconciler) resolveOne(
	ctx context.Context,
	p fenceInPayload,
	callerID uuid.UUID,
) (string, resolveKind) {
	credID, err := uuid.Parse(p.ID)
	if err != nil {
		return "", resolveSkipped
	}

	existing, err := r.repo.FindByID(ctx, credID)
	if err == nil && existing.OperationID == r.targetOperation {
		// Same operation — reuse in place. Don't update fields from the
		// payload; the credential might have legitimate edits since the
		// export was generated.
		return existing.CredentialID.String(), resolveReused
	}

	// Either not found anywhere, or found in a different operation. Either
	// way the fence's id is unusable in the target operation; mint a fresh
	// credential from the payload.
	newCred := buildCredentialFromPayload(p, r.targetOperation, callerID)
	if err := r.repo.Create(ctx, newCred); err != nil {
		return "", resolveSkipped
	}
	return newCred.CredentialID.String(), resolveCreated
}

// buildCredentialFromPayload produces a fresh Credential struct ready for
// insertion. Fields that don't make sense across instances (Comments,
// timestamps) are left to their zero values; the repo layer fills in the
// qmgo DefaultField timestamps automatically.
func buildCredentialFromPayload(
	p fenceInPayload,
	operationID, callerID uuid.UUID,
) *models.Credential {
	t := models.CredentialType(p.Type)
	if !t.IsValid() {
		t = models.CredentialTypeOther
	}
	keys := make([]models.CredentialKey, len(p.Keys))
	for i, k := range p.Keys {
		keys[i] = models.CredentialKey{Name: k.Name, Content: k.Content}
	}
	props := make([]models.CredentialProperty, len(p.Properties))
	for i, prop := range p.Properties {
		props[i] = models.CredentialProperty{Name: prop.Name, Value: prop.Value}
	}
	tags := append([]string(nil), p.Tags...)

	return &models.Credential{
		CredentialID: uuid.New(),
		OperationID:  operationID,
		Name:         p.Name,
		Type:         t,
		Username:     p.Username,
		Password:     p.Password,
		Keys:         keys,
		Properties:   props,
		IsValid:      p.IsValid,
		Tags:         tags,
		CreatedByID:  callerID,
	}
}

