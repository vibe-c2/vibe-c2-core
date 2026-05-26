package resolver

import (
	"strconv"
	"strings"
	"testing"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
)

// Exercises normalizeCredentialProperties — the single chokepoint that
// validates the operator-defined metadata bag before it hits the DB. The
// rules under test are:
//   - blank rows (name AND value empty after trim) are silently dropped
//   - rows with a value but no name are rejected (a value alone has no key)
//   - names beyond maxCredentialPropertyNameLen are rejected
//   - values beyond maxCredentialPropertyValueLen are rejected
//   - duplicate names (case-sensitive after trim) are rejected
//   - more than maxCredentialProperties total entries is rejected
//   - nil entries inside the slice are skipped, not crashed on
//
// Each case names the violated rule in `wantErr` so a future failure points
// straight at the broken branch.

func ptrProp(name, value string) *model.CredentialPropertyInput {
	return &model.CredentialPropertyInput{Name: name, Value: value}
}

func TestNormalizeCredentialProperties(t *testing.T) {
	cases := []struct {
		name    string
		in      []*model.CredentialPropertyInput
		wantLen int
		wantErr string // substring; "" means no error expected
	}{
		{
			name:    "nil input",
			in:      nil,
			wantLen: 0,
		},
		{
			name:    "empty input",
			in:      []*model.CredentialPropertyInput{},
			wantLen: 0,
		},
		{
			name: "trims and keeps",
			in: []*model.CredentialPropertyInput{
				ptrProp("  port  ", "  2222  "),
			},
			wantLen: 1,
		},
		{
			name: "drops fully blank rows",
			in: []*model.CredentialPropertyInput{
				ptrProp("port", "2222"),
				ptrProp("   ", "   "),
				ptrProp("mfa", "yes"),
			},
			wantLen: 2,
		},
		{
			name: "rejects value without name",
			in: []*model.CredentialPropertyInput{
				ptrProp("", "lonely-value"),
			},
			wantErr: "property name is required",
		},
		{
			name: "rejects oversized name",
			in: []*model.CredentialPropertyInput{
				ptrProp(strings.Repeat("n", maxCredentialPropertyNameLen+1), "x"),
			},
			wantErr: "exceeds",
		},
		{
			name: "rejects oversized value",
			in: []*model.CredentialPropertyInput{
				ptrProp("k", strings.Repeat("v", maxCredentialPropertyValueLen+1)),
			},
			wantErr: "exceeds",
		},
		{
			name: "rejects duplicate name (case-sensitive after trim)",
			in: []*model.CredentialPropertyInput{
				ptrProp("port", "22"),
				ptrProp("port ", "2222"),
			},
			wantErr: "duplicate property name",
		},
		{
			name: "allows case-distinct names",
			in: []*model.CredentialPropertyInput{
				ptrProp("Port", "22"),
				ptrProp("port", "2222"),
			},
			wantLen: 2,
		},
		{
			name:    "rejects over-cap count",
			in:      makePropInputs(maxCredentialProperties + 1),
			wantErr: "too many properties",
		},
		{
			name:    "accepts exact-cap count",
			in:      makePropInputs(maxCredentialProperties),
			wantLen: maxCredentialProperties,
		},
		{
			name: "skips nil entries",
			in: []*model.CredentialPropertyInput{
				ptrProp("a", "1"),
				nil,
				ptrProp("b", "2"),
			},
			wantLen: 2,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			out, err := normalizeCredentialProperties(tc.in)
			if tc.wantErr != "" {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tc.wantErr)
				}
				if !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("expected error containing %q, got %q", tc.wantErr, err.Error())
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(out) != tc.wantLen {
				t.Fatalf("expected %d properties, got %d", tc.wantLen, len(out))
			}
		})
	}
}

func makePropInputs(n int) []*model.CredentialPropertyInput {
	out := make([]*model.CredentialPropertyInput, n)
	for i := 0; i < n; i++ {
		out[i] = ptrProp("k"+strconv.Itoa(i), "v")
	}
	return out
}
