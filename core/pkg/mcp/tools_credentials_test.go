package mcp

import (
	"strings"
	"testing"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

func strPtr(s string) *string { return &s }

// The reported case: an agent recorded credentials that read as Invalid and
// had no way to say otherwise. Settling validity must not disturb anything.
func TestUpdateCredential_MarkingValidTouchesNothingElse(t *testing.T) {
	input, err := buildUpdateCredentialInput(updateCredentialArgs{
		CredentialID: "id",
		Validity:     strPtr("VALID"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if input.Validity == nil || *input.Validity != models.CredentialValidityValid {
		t.Fatal("validity should have been set to VALID")
	}
	if input.Name != nil || input.Username != nil || input.Password != nil {
		t.Error("omitted scalars must stay nil so the resolver leaves them alone")
	}
	if input.Keys != nil || input.Properties != nil || input.Tags != nil {
		t.Error("omitted lists must stay nil; a non-nil empty list would clear them")
	}
	if input.Type != nil {
		t.Error("omitted type must stay nil")
	}
}

func TestUpdateCredential_DistinguishesOmittedFromCleared(t *testing.T) {
	tests := []struct {
		name    string
		args    updateCredentialArgs
		wantNil bool
		wantLen int
	}{
		{
			name:    "omitted tags are left alone",
			args:    updateCredentialArgs{CredentialID: "id"},
			wantNil: true,
		},
		{
			name:    "an empty list clears them",
			args:    updateCredentialArgs{CredentialID: "id", Tags: []string{}},
			wantNil: false,
			wantLen: 0,
		},
		{
			name:    "a populated list replaces them",
			args:    updateCredentialArgs{CredentialID: "id", Tags: []string{"web-01"}},
			wantNil: false,
			wantLen: 1,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			input, err := buildUpdateCredentialInput(tc.args)
			if err != nil {
				t.Fatal(err)
			}
			if tc.wantNil {
				if input.Tags != nil {
					t.Fatalf("tags = %v, want nil", input.Tags)
				}
				return
			}
			if input.Tags == nil {
				t.Fatal("tags should be non-nil so the resolver writes them")
			}
			if len(input.Tags) != tc.wantLen {
				t.Fatalf("len(tags) = %d, want %d", len(input.Tags), tc.wantLen)
			}
		})
	}
}

// An empty keys list is how a credential's key material is deliberately
// removed, which must remain possible and distinct from silence.
func TestUpdateCredential_KeysAndPropertiesFollowTheSameRule(t *testing.T) {
	input, err := buildUpdateCredentialInput(updateCredentialArgs{
		CredentialID: "id",
		Keys: []struct {
			Name    string `json:"name"    jsonschema:"e.g. id_rsa"`
			Content string `json:"content" jsonschema:"Key material."`
		}{},
	})
	if err != nil {
		t.Fatal(err)
	}
	if input.Keys == nil {
		t.Fatal("an explicit empty keys list must reach the resolver to clear them")
	}
	if len(input.Keys) != 0 {
		t.Fatalf("len(keys) = %d, want 0", len(input.Keys))
	}
	if input.Properties != nil {
		t.Error("properties were not mentioned and must stay nil")
	}
}

func TestUpdateCredential_RejectsAnUnknownType(t *testing.T) {
	_, err := buildUpdateCredentialInput(updateCredentialArgs{
		CredentialID: "id",
		Type:         strPtr("PASSPHRASE"),
	})
	if err == nil {
		t.Fatal("an unknown type should be refused")
	}
	if !isRefusal(err) {
		t.Error("a bad enum is a refusal the agent can correct, not a fault")
	}
}

func TestUpdateCredential_NormalisesTheType(t *testing.T) {
	input, err := buildUpdateCredentialInput(updateCredentialArgs{
		CredentialID: "id",
		Type:         strPtr("  ssh_key "),
	})
	if err != nil {
		t.Fatal(err)
	}
	if input.Type == nil || *input.Type != models.CredentialTypeSSHKey {
		t.Fatalf("type = %v, want SSH_KEY", input.Type)
	}
}

func TestSummarizeCredentialUpdate(t *testing.T) {
	tests := []struct {
		name     string
		validity models.CredentialValidity
		args     updateCredentialArgs
		want     string
	}{
		{"validity leads when it changed", models.CredentialValidityValid, updateCredentialArgs{Validity: strPtr("VALID")}, "marked the credential \"web-01 local admin\" as working"},
		{"and says so when it did not work", models.CredentialValidityInvalid, updateCredentialArgs{Validity: strPtr("INVALID")}, "marked the credential \"web-01 local admin\" as not working"},
		{"untested is its own answer, not a failure", models.CredentialValidityUnknown, updateCredentialArgs{Validity: strPtr("UNKNOWN")}, "marked the credential \"web-01 local admin\" as untested"},
		{"otherwise it is a plain update", models.CredentialValidityUnknown, updateCredentialArgs{Name: strPtr("x")}, "updated the credential \"web-01 local admin\""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cred := &models.Credential{Name: "web-01 local admin", Validity: tc.validity}
			if got := summarizeCredentialUpdate(cred, tc.args); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

// An unrecognised state is refused by name rather than silently becoming one
// of the three — a wrong validity is a wrong claim about the target.
func TestUpdateCredential_RefusesAnUnknownValidity(t *testing.T) {
	_, err := buildUpdateCredentialInput(updateCredentialArgs{
		CredentialID: "id",
		Validity:     strPtr("MAYBE"),
	})
	if err == nil {
		t.Fatal("expected a refusal for an unrecognised validity")
	}
	if !isRefusal(err) {
		t.Fatalf("expected a refusal, got %v", err)
	}
	if !strings.Contains(err.Error(), "UNKNOWN, VALID, INVALID") {
		t.Fatalf("refusal should name the three states, got %q", err.Error())
	}
}

// The enum arrives in whatever case the agent typed it.
func TestUpdateCredential_NormalisesTheValidity(t *testing.T) {
	input, err := buildUpdateCredentialInput(updateCredentialArgs{
		CredentialID: "id",
		Validity:     strPtr("  invalid "),
	})
	if err != nil {
		t.Fatal(err)
	}
	if input.Validity == nil || *input.Validity != models.CredentialValidityInvalid {
		t.Fatalf("validity = %v, want INVALID", input.Validity)
	}
}
