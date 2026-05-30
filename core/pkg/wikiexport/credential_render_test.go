package wikiexport

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// fakeCredLookup is a map-backed CredentialLookup. Returning the zero
// Credential with no error signals "missing"; setting a credential with a
// non-target operation id exercises the cross-op tombstone path.
type fakeCredLookup struct {
	by map[uuid.UUID]models.Credential
}

func (f *fakeCredLookup) FindByID(_ context.Context, id uuid.UUID) (models.Credential, error) {
	if f == nil || f.by == nil {
		return models.Credential{}, nil
	}
	if c, ok := f.by[id]; ok {
		return c, nil
	}
	return models.Credential{}, nil
}

func TestHydrateCredentialFences_NoLookup_NoChange(t *testing.T) {
	body := "```vibe-credential\n{\n  \"id\": \"abc\"\n}\n```"
	out, hyd, tomb := hydrateCredentialFences(context.Background(), body, uuid.New(), nil)
	if out != body {
		t.Fatalf("body changed without a lookup; got %q", out)
	}
	if hyd != 0 || tomb != 0 {
		t.Fatalf("counters incremented without a lookup: hyd=%d tomb=%d", hyd, tomb)
	}
}

func TestHydrateCredentialFences_HydratesSameOpCredential(t *testing.T) {
	opID := uuid.New()
	credID := uuid.New()
	lookup := &fakeCredLookup{by: map[uuid.UUID]models.Credential{
		credID: {
			CredentialID: credID,
			OperationID:  opID,
			Name:         "prod-db",
			Type:         models.CredentialTypePassword,
			Username:     "admin",
			Password:     "hunter2",
			IsValid:      true,
		},
	}}
	body := "```vibe-credential\n{\n  \"id\": \"" + credID.String() + "\"\n}\n```"

	out, hyd, tomb := hydrateCredentialFences(context.Background(), body, opID, lookup)
	if hyd != 1 {
		t.Fatalf("expected 1 hydrated, got %d", hyd)
	}
	if tomb != 0 {
		t.Fatalf("expected 0 tombstoned, got %d", tomb)
	}
	if !strings.Contains(out, `"name": "prod-db"`) {
		t.Fatalf("hydrated body missing name: %q", out)
	}
	if !strings.Contains(out, `"password": "hunter2"`) {
		t.Fatalf("hydrated body missing password: %q", out)
	}
}

func TestHydrateCredentialFences_TombstonesCrossOpReference(t *testing.T) {
	docOp := uuid.New()
	otherOp := uuid.New()
	credID := uuid.New()
	lookup := &fakeCredLookup{by: map[uuid.UUID]models.Credential{
		credID: {
			CredentialID: credID,
			OperationID:  otherOp, // different from docOp
			Name:         "leaky",
			Password:     "should-not-leak",
		},
	}}
	body := "```vibe-credential\n{\n  \"id\": \"" + credID.String() + "\"\n}\n```"

	out, hyd, tomb := hydrateCredentialFences(context.Background(), body, docOp, lookup)
	if hyd != 0 {
		t.Fatalf("cross-op credential should NOT hydrate; got hyd=%d", hyd)
	}
	if tomb != 1 {
		t.Fatalf("expected 1 tombstoned, got %d", tomb)
	}
	if strings.Contains(out, "should-not-leak") || strings.Contains(out, "leaky") {
		t.Fatalf("cross-op credential metadata leaked into export: %q", out)
	}
	if !strings.Contains(out, `"deleted": true`) {
		t.Fatalf("expected tombstone marker; got %q", out)
	}
}

func TestHydrateCredentialFences_TombstonesMissingCredential(t *testing.T) {
	opID := uuid.New()
	missingID := uuid.New()
	lookup := &fakeCredLookup{by: map[uuid.UUID]models.Credential{}}
	body := "```vibe-credential\n{\n  \"id\": \"" + missingID.String() + "\"\n}\n```"

	out, hyd, tomb := hydrateCredentialFences(context.Background(), body, opID, lookup)
	if hyd != 0 || tomb != 1 {
		t.Fatalf("expected hyd=0 tomb=1, got hyd=%d tomb=%d", hyd, tomb)
	}
	if !strings.Contains(out, `"deleted": true`) {
		t.Fatalf("expected tombstone, got %q", out)
	}
	if !strings.Contains(out, missingID.String()) {
		t.Fatalf("tombstone should preserve the original id, got %q", out)
	}
}

func TestHydrateCredentialFences_RepeatedIDsHydrateOnce(t *testing.T) {
	// Same credential referenced twice should produce two identical fences
	// without two repository round-trips. Counter increments once.
	opID := uuid.New()
	credID := uuid.New()
	calls := 0
	lookup := &countingLookup{
		inner: &fakeCredLookup{by: map[uuid.UUID]models.Credential{
			credID: {CredentialID: credID, OperationID: opID, Name: "n"},
		}},
		calls: &calls,
	}
	idStr := credID.String()
	body := "```vibe-credential\n{\n  \"id\": \"" + idStr + "\"\n}\n```\n\npara\n\n```vibe-credential\n{\n  \"id\": \"" + idStr + "\"\n}\n```"

	_, hyd, tomb := hydrateCredentialFences(context.Background(), body, opID, lookup)
	if hyd != 1 {
		t.Fatalf("counter should increment once for unique ids, got %d", hyd)
	}
	if tomb != 0 {
		t.Fatalf("expected no tombstones, got %d", tomb)
	}
	if calls != 1 {
		t.Fatalf("repository should be hit once per unique id, got %d", calls)
	}
}

func TestHydrateCredentialFences_PreservesExistingTombstone(t *testing.T) {
	opID := uuid.New()
	credID := uuid.New()
	// A re-export of an already-tombstoned fence should leave the deleted
	// marker intact and not increment any counter.
	lookup := &fakeCredLookup{by: map[uuid.UUID]models.Credential{}}
	body := "```vibe-credential\n{\n  \"id\": \"" + credID.String() + "\",\n  \"deleted\": true\n}\n```"

	out, hyd, tomb := hydrateCredentialFences(context.Background(), body, opID, lookup)
	if out != body {
		t.Fatalf("tombstone fence was rewritten: %q", out)
	}
	if hyd != 0 || tomb != 0 {
		t.Fatalf("tombstone re-encountered should not move counters, got hyd=%d tomb=%d", hyd, tomb)
	}
}

// countingLookup counts FindByID invocations to prove memoisation works.
type countingLookup struct {
	inner CredentialLookup
	calls *int
}

func (c *countingLookup) FindByID(ctx context.Context, id uuid.UUID) (models.Credential, error) {
	*c.calls++
	return c.inner.FindByID(ctx, id)
}
