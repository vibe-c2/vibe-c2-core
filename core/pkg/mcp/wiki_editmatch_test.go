package mcp

import (
	"strings"
	"testing"
)

func TestDiagnoseNoMatch(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		oldText string
		want    string
	}{
		{
			name:    "empty page",
			body:    "",
			oldText: "anything",
			want:    "empty",
		},
		{
			// The commonest real failure: the agent retyped a table row and
			// used one space where the page has two.
			name:    "whitespace differs",
			body:    "| dc-01  |  Windows |",
			oldText: "| dc-01 | Windows |",
			want:    "whitespace",
		},
		{
			name:    "case differs",
			body:    "The Domain Controller is dc-01.",
			oldText: "the domain controller is dc-01.",
			want:    "capitalisation",
		},
		{
			name:    "first line matches, rest diverges",
			body:    "## Hosts\n\nreal content here\n",
			oldText: "## Hosts\n\ninvented content\n",
			want:    "first line",
		},
		{
			name:    "nothing matches",
			body:    "completely unrelated text",
			oldText: "not here at all",
			want:    "wrong one",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := diagnoseNoMatch(tt.body, tt.oldText)
			if !strings.Contains(got, tt.want) {
				t.Errorf("diagnoseNoMatch() = %q, want it to mention %q", got, tt.want)
			}
			// The caller concatenates this after its own sentence.
			if got != "" && !strings.HasPrefix(got, " ") {
				t.Errorf("diagnosis should start with a space for concatenation: %q", got)
			}
		})
	}
}

// A snippet retyped from memory usually gets both the spacing and the
// capitalisation slightly wrong. Testing the two separately missed exactly
// that case and fell through to "you are on the wrong page", which is both
// wrong and the least actionable thing the tool can say.
func TestDiagnoseNoMatchReportsBothDifferences(t *testing.T) {
	got := diagnoseNoMatch("The  Domain Controller", "the domain controller")
	if !strings.Contains(got, "whitespace") || !strings.Contains(got, "capitalisation") {
		t.Errorf("got %q, want both differences named", got)
	}
}

// Each difference on its own still gets its own specific message rather than
// being swallowed by the combined one.
func TestDiagnoseNoMatchPrefersTheSpecificCause(t *testing.T) {
	if got := diagnoseNoMatch("The  Domain", "The Domain"); !strings.Contains(got, "whitespace") {
		t.Errorf("spacing-only: got %q", got)
	}
	if got := diagnoseNoMatch("The Domain", "the domain"); !strings.Contains(got, "capitalisation") {
		t.Errorf("case-only: got %q", got)
	}
}

func TestFirstContentLine(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"first\nsecond", "first"},
		{"\n\n  indented  \nsecond", "indented"},
		{"", ""},
		{"\n\n\n", ""},
	}
	for _, tt := range tests {
		if got := firstContentLine(tt.in); got != tt.want {
			t.Errorf("firstContentLine(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
