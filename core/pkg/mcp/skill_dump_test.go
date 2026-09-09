package mcp

import (
	"os"
	"testing"

	"go.uber.org/zap"
)

// TestDumpSkill prints the generated bundle. Not an assertion — a way to read
// what an operator would actually download, since the real endpoint needs a
// browser session. Run with: go test ./pkg/mcp -run TestDumpSkill -v
func TestDumpSkill(t *testing.T) {
	if os.Getenv("DUMP_SKILL") == "" {
		t.Skip("set DUMP_SKILL=1 to print the generated skill")
	}
	s := New(Deps{Logger: zap.NewNop()})
	for _, f := range s.SkillBundle() {
		t.Logf("\n========== %s (%d bytes)\n%s", f.Path, len(f.Content), f.Content)
	}
}
