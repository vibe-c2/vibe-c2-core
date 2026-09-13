package wikitransfer

import (
	"context"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// CredentialReconciler resolves-or-creates the credentials a plan carries
// and returns the map from source id to the id that lives in the target
// operation.
//
// Credentials are operation-private, so the target operation is the ONLY
// place a credential is reused or created. A payload whose id happens to
// match a credential in some other operation is "not found here" and gets
// a fresh create.
type CredentialReconciler struct {
	repo            repository.ICredentialRepository
	targetOperation uuid.UUID
}

// NewCredentialReconciler scopes a reconciler to one operation.
func NewCredentialReconciler(repo repository.ICredentialRepository, targetOperationID uuid.UUID) *CredentialReconciler {
	return &CredentialReconciler{repo: repo, targetOperation: targetOperationID}
}

// CredentialOutcome tallies what Reconcile did.
type CredentialOutcome struct {
	// IDMap maps source id → target id for every usable payload.
	IDMap   map[uuid.UUID]uuid.UUID
	Reused  int
	Created int
	// Skipped counts payloads that could not be used (bad id, create
	// failure). Their chips are dropped by the caller.
	Skipped []uuid.UUID
}

// Reconcile runs the resolve-or-create policy over every payload:
//
//   - credential exists in the target operation        → reuse, identity map
//   - exists elsewhere, or nowhere                       → create from payload
//   - payload marked deleted or otherwise unusable       → skip
//
// Repository failures are absorbed into Skipped rather than aborting the
// import; a missing chip is far less destructive than a half-imported tree.
func (r *CredentialReconciler) Reconcile(
	ctx context.Context,
	payloads map[uuid.UUID]CredentialPayload,
	callerID uuid.UUID,
) CredentialOutcome {
	out := CredentialOutcome{IDMap: map[uuid.UUID]uuid.UUID{}}
	if r == nil || r.repo == nil {
		for id := range payloads {
			out.Skipped = append(out.Skipped, id)
		}
		return out
	}
	for id, p := range payloads {
		if p.Deleted {
			out.Skipped = append(out.Skipped, id)
			continue
		}
		existing, err := r.repo.FindByID(ctx, id)
		if err == nil && existing.OperationID == r.targetOperation {
			// Same operation: reuse in place. The payload is not applied —
			// the credential may have legitimate edits since the export.
			out.IDMap[id] = existing.CredentialID
			out.Reused++
			continue
		}
		created := buildCredential(p, r.targetOperation, callerID)
		if err := r.repo.Create(ctx, created); err != nil {
			out.Skipped = append(out.Skipped, id)
			continue
		}
		out.IDMap[id] = created.CredentialID
		out.Created++
	}
	return out
}

// buildCredential produces a fresh Credential from a payload. Comments and
// timestamps do not travel; the repository fills in DefaultField.
func buildCredential(p CredentialPayload, operationID, callerID uuid.UUID) *models.Credential {
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
		Tags:         append([]string(nil), p.Tags...),
		CreatedByID:  callerID,
	}
}

// PayloadFromCredential is the export-side inverse of buildCredential.
func PayloadFromCredential(c models.Credential) CredentialPayload {
	keys := make([]CredentialKey, len(c.Keys))
	for i, k := range c.Keys {
		keys[i] = CredentialKey{Name: k.Name, Content: k.Content}
	}
	props := make([]CredentialProperty, len(c.Properties))
	for i, p := range c.Properties {
		props[i] = CredentialProperty{Name: p.Name, Value: p.Value}
	}
	return CredentialPayload{
		ID:         c.CredentialID.String(),
		Name:       c.Name,
		Type:       string(c.Type),
		Username:   c.Username,
		Password:   c.Password,
		Keys:       keys,
		Properties: props,
		IsValid:    c.IsValid,
		Tags:       append([]string(nil), c.Tags...),
	}
}
