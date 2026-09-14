package mcp

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/mcp/skillchangelog"
	"go.uber.org/zap"
)

// The skill has a version so the app can tell an operator their installed copy
// is stale. That only works if the number moves whenever the content does, and
// nobody remembers to bump a constant. This test makes forgetting fail:
//
//   - the rendered bundle is compared against testdata/skill.golden;
//   - a content change with the same version is refused, with or without
//     -update, until an entry is appended in skillchangelog;
//   - once the version is bumped, `go test ./pkg/mcp -run TestSkill_Golden
//     -update` rewrites the golden file, and the diff in review shows exactly
//     what the changelog entry should describe.
//
// The golden holds the whole bundle rather than a hash for that last reason:
// a hash tells you something changed, the file tells you what.

var updateGolden = flag.Bool("update", false, "rewrite testdata/skill.golden from the current bundle")

const goldenPath = "testdata/skill.golden"

func TestSkill_ChangelogIsWellFormed(t *testing.T) {
	if err := skillchangelog.Validate(); err != nil {
		t.Fatalf("skillchangelog: %v", err)
	}
}

func TestSkill_FrontmatterCarriesCurrentVersion(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})
	skill := findFile(t, s.SkillBundle(), SkillName+"/SKILL.md")
	got, ok := frontmatterVersion(skill)
	if !ok {
		t.Fatalf("SKILL.md frontmatter has no metadata.version:\n%s", skill[:min(len(skill), 400)])
	}
	if got != skillchangelog.Current() {
		t.Fatalf("frontmatter version = %d, changelog current = %d", got, skillchangelog.Current())
	}
}

func TestSkill_Golden(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})
	current := renderGolden(s.SkillBundle())
	currentVersion := skillchangelog.Current()

	previous, err := os.ReadFile(goldenPath)
	if os.IsNotExist(err) {
		if *updateGolden {
			writeGolden(t, current)
			return
		}
		t.Fatalf("%s is missing; run: go test ./pkg/mcp -run TestSkill_Golden -update", goldenPath)
	}
	if err != nil {
		t.Fatal(err)
	}

	if string(previous) == current {
		return
	}

	previousVersion, ok := frontmatterVersion(string(previous))
	if !ok {
		t.Fatalf("%s carries no version; regenerate it with -update", goldenPath)
	}

	if previousVersion == currentVersion {
		t.Fatalf("the skill bundle changed but skillchangelog still says version %d.\n"+
			"Append a release to pkg/mcp/skillchangelog/changelog.go describing the change, "+
			"then run: go test ./pkg/mcp -run TestSkill_Golden -update\n\nfirst difference:\n%s",
			currentVersion, firstDifference(string(previous), current))
	}
	if previousVersion > currentVersion {
		t.Fatalf("golden is at version %d but skillchangelog is at %d: released entries must not be removed",
			previousVersion, currentVersion)
	}

	if *updateGolden {
		writeGolden(t, current)
		return
	}
	t.Fatalf("skillchangelog moved from %d to %d; refresh the golden with: go test ./pkg/mcp -run TestSkill_Golden -update\n\nfirst difference:\n%s",
		previousVersion, currentVersion, firstDifference(string(previous), current))
}

// renderGolden flattens the bundle into one document, files in bundle order,
// each under a banner naming its path.
func renderGolden(files []SkillFile) string {
	var b strings.Builder
	for _, f := range files {
		fmt.Fprintf(&b, "==================== %s\n", f.Path)
		b.WriteString(f.Content)
		if !strings.HasSuffix(f.Content, "\n") {
			b.WriteString("\n")
		}
	}
	return b.String()
}

func writeGolden(t *testing.T, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(goldenPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(goldenPath, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Logf("wrote %s at version %d", goldenPath, skillchangelog.Current())
}

var frontmatterVersionRe = regexp.MustCompile(`(?m)^  version: "(\d+)"$`)

// frontmatterVersion reads metadata.version out of SKILL.md, or out of a
// golden document that begins with it.
func frontmatterVersion(doc string) (int, bool) {
	m := frontmatterVersionRe.FindStringSubmatch(doc)
	if m == nil {
		return 0, false
	}
	v, err := strconv.Atoi(m[1])
	if err != nil {
		return 0, false
	}
	return v, true
}

// firstDifference points at the first line that differs, with a little
// context, so the failure is readable without a diff tool.
func firstDifference(a, b string) string {
	al, bl := strings.Split(a, "\n"), strings.Split(b, "\n")
	for i := 0; i < len(al) || i < len(bl); i++ {
		var x, y string
		if i < len(al) {
			x = al[i]
		}
		if i < len(bl) {
			y = bl[i]
		}
		if x != y {
			return fmt.Sprintf("line %d\n  golden:  %q\n  current: %q", i+1, x, y)
		}
	}
	return "(no line-level difference; trailing whitespace?)"
}
