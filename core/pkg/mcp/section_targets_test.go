package mcp

import (
	"fmt"
	"strings"
	"testing"
)

func TestSectionWriteTargets(t *testing.T) {
	tests := []struct {
		name string
		args sectionWriteArgs
		want []string
	}{
		{
			name: "single id",
			args: sectionWriteArgs{DocumentID: "a"},
			want: []string{"a"},
		},
		{
			name: "several ids",
			args: sectionWriteArgs{DocumentIDs: []string{"a", "b"}},
			want: []string{"a", "b"},
		},
		{
			// Both forms are a union rather than a conflict: refusing would
			// cost a round trip to say something the agent already meant.
			name: "both forms merge",
			args: sectionWriteArgs{DocumentID: "a", DocumentIDs: []string{"b"}},
			want: []string{"a", "b"},
		},
		{
			name: "duplicates collapse",
			args: sectionWriteArgs{DocumentID: "a", DocumentIDs: []string{"a", "b", "b"}},
			want: []string{"a", "b"},
		},
		{
			name: "blank entries are dropped",
			args: sectionWriteArgs{DocumentIDs: []string{"a", "", "  ", "b"}},
			want: []string{"a", "b"},
		},
		{
			name: "surrounding space is trimmed",
			args: sectionWriteArgs{DocumentIDs: []string{" a ", "b"}},
			want: []string{"a", "b"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tt.args.targets()
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if strings.Join(got, ",") != strings.Join(tt.want, ",") {
				t.Errorf("targets() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSectionWriteTargetsRefusesEmpty(t *testing.T) {
	_, err := sectionWriteArgs{}.targets()
	if err == nil {
		t.Fatal("expected a refusal when no page was named")
	}
	if !isRefusal(err) {
		t.Errorf("no-target should be a refusal, not a fault: %v", err)
	}
}

func TestSectionWriteTargetsEnforcesTheCap(t *testing.T) {
	ids := make([]string, maxSectionTargets+1)
	for i := range ids {
		ids[i] = fmt.Sprintf("doc-%d", i)
	}

	_, err := sectionWriteArgs{DocumentIDs: ids}.targets()
	if err == nil {
		t.Fatal("expected a refusal above the cap")
	}
	if !isRefusal(err) {
		t.Errorf("over-cap should be a refusal, not a fault: %v", err)
	}
	// The refusal has to say the size limit is not the reason, or the agent
	// starts chunking its content — the exact mistake the 1 MB argument
	// limit was documented to prevent.
	if !strings.Contains(err.Error(), "not about the size of the content") {
		t.Errorf("refusal should rule out content size as the cause: %v", err)
	}

	// Exactly at the cap is fine.
	if _, err := (sectionWriteArgs{DocumentIDs: ids[:maxSectionTargets]}).targets(); err != nil {
		t.Errorf("the cap itself should be allowed: %v", err)
	}
}
