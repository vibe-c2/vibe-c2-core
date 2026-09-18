package wikitransfer

import (
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// A bundle carries validity as of the three-state field, but bundles exported
// before it existed carry only the boolean it replaced. Both have to land on
// a sensible state, and the legacy false must not become INVALID: it meant
// "not marked working", which was overwhelmingly untested rather than tried
// and rejected. The startup backfill reads legacy rows the same way.
func TestBuildCredential_Validity(t *testing.T) {
	tests := []struct {
		name    string
		payload CredentialPayload
		want    models.CredentialValidity
	}{
		{"an explicit state is carried through", CredentialPayload{Validity: "INVALID"}, models.CredentialValidityInvalid},
		{"as is UNKNOWN", CredentialPayload{Validity: "UNKNOWN"}, models.CredentialValidityUnknown},
		{"a legacy true becomes VALID", CredentialPayload{LegacyIsValid: true}, models.CredentialValidityValid},
		{"a legacy false becomes UNKNOWN, not INVALID", CredentialPayload{LegacyIsValid: false}, models.CredentialValidityUnknown},
		{"and so does an unrecognised state", CredentialPayload{Validity: "MAYBE"}, models.CredentialValidityUnknown},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := buildCredential(tc.payload, uuid.New(), uuid.New())
			if got.Validity != tc.want {
				t.Fatalf("validity = %q, want %q", got.Validity, tc.want)
			}
		})
	}
}

// Export writes the new field and nothing else, so a bundle round-trips
// through the three-state form rather than collapsing back to a boolean.
func TestPayloadFromCredential_CarriesValidity(t *testing.T) {
	p := PayloadFromCredential(models.Credential{
		CredentialID: uuid.New(),
		Validity:     models.CredentialValidityInvalid,
	})
	if p.Validity != string(models.CredentialValidityInvalid) {
		t.Fatalf("validity = %q, want INVALID", p.Validity)
	}
	if p.LegacyIsValid {
		t.Fatal("export must not write the retired boolean")
	}
}
