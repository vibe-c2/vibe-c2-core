package mcp

import (
	"strings"
	"testing"
)

func TestCheckCredentialFences(t *testing.T) {
	tests := []struct {
		name     string
		markdown string
		wantErr  bool
	}{
		{
			name:     "a well formed chip",
			markdown: "intro\n\n```vibe-credential\n{\"id\": \"9f1c\"}\n```\n",
		},
		{
			name:     "pretty-printed, which is what the exporter writes",
			markdown: "```vibe-credential\n{\n  \"id\": \"9f1c\",\n  \"name\": \"svc\"\n}\n```",
		},
		{
			// The mistake the production agent made, and the one the page it
			// copied from already had.
			name:     "a bare uuid instead of JSON",
			markdown: "```vibe-credential\n9f1c-4d2a\n```",
			wantErr:  true,
		},
		{
			name:     "JSON without an id",
			markdown: "```vibe-credential\n{\"name\": \"svc\"}\n```",
			wantErr:  true,
		},
		{
			name:     "an id that is not a string",
			markdown: "```vibe-credential\n{\"id\": 42}\n```",
			wantErr:  true,
		},
		{
			name:     "an empty id",
			markdown: "```vibe-credential\n{\"id\": \"\"}\n```",
			wantErr:  true,
		},
		{
			name:     "an empty body",
			markdown: "```vibe-credential\n```",
			wantErr:  true,
		},
		{
			// How the guides show the syntax: the inner fence is content of
			// the outer one, not a fence of its own.
			name:     "an example wrapped in a longer fence",
			markdown: "````\n```vibe-credential\n{\"id\": \"<uuid>\"}\n```\n````",
		},
		{
			name:     "an ordinary code block that happens to hold a uuid",
			markdown: "```text\n9f1c-4d2a\n```",
		},
		{
			name:     "no fences at all",
			markdown: "just prose about vibe-credential blocks",
		},
		{
			name:     "a fence left unterminated closes at the end",
			markdown: "```vibe-credential\n{\"id\": \"9f1c\"}",
		},
		{
			name:     "inline code is not a fence",
			markdown: "use the ```vibe-credential``` info-string",
		},
		{
			name:     "a second fence after a good one is still checked",
			markdown: "```vibe-credential\n{\"id\": \"a\"}\n```\n\n```vibe-credential\nb\n```",
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := checkCredentialFences(tt.markdown)
			if tt.wantErr && err == nil {
				t.Fatal("expected a refusal; the block would have rendered as a code block")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected refusal: %v", err)
			}
			if err != nil && !isRefusal(err) {
				t.Errorf("should be a refusal the agent can act on, not a fault: %v", err)
			}
		})
	}
}

// The refusal has to carry the working shape, or an agent that has just been
// told "no" has nothing to try next — which is how the bare-uuid form and the
// nonexistent vibe://credential/ link got tried in production.
func TestCheckCredentialFences_RefusalShowsTheShape(t *testing.T) {
	err := checkCredentialFences("```vibe-credential\n9f1c\n```")
	if err == nil {
		t.Fatal("expected a refusal")
	}
	for _, want := range []string{"vibe-credential", "\"id\""} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("refusal does not show %q: %v", want, err)
		}
	}
}
