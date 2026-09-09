package mcp

import (
	"archive/zip"
	"bytes"
	"io"
	"strings"
	"testing"

	"go.uber.org/zap"
)

// The whole reason to generate the skill rather than write it is that a
// hand-maintained one goes stale. These tests are what make that true: a tool
// added to the server but not filed into a group fails here, before an
// operator downloads a skill that does not mention it.
func TestSkill_DocumentsEveryRegisteredTool(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})

	if len(s.tools) == 0 {
		t.Fatal("no tools recorded; the registry this skill is built from is empty")
	}

	reference := findFile(t, s.SkillBundle(), SkillName+"/reference/tools.md")
	for _, tool := range s.tools {
		if !strings.Contains(reference, "`"+tool.Name+"`") {
			t.Errorf("tool %q is registered but missing from the skill", tool.Name)
		}
		if tool.Description == "" {
			t.Errorf("tool %q has no description, so the skill documents it as a bare name", tool.Name)
		}
	}
}

// A tool nobody filed lands under "Other". That is deliberately visible rather
// than dropped — but it should never ship, so the test refuses it.
func TestSkill_EveryToolIsGrouped(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})

	_, ungrouped := groupedTools(s.tools)
	if len(ungrouped) > 0 {
		names := make([]string, 0, len(ungrouped))
		for _, t := range ungrouped {
			names = append(names, t.Name)
		}
		t.Fatalf("these tools are not in any group in skill_groups.go: %s\n"+
			"Add them to a group so the skill files them under a heading an agent will find.",
			strings.Join(names, ", "))
	}
}

// Groups must not name tools that no longer exist, or the skill sends an agent
// calling something that was renamed away.
func TestSkill_GroupsNameOnlyRealTools(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})

	registered := map[string]bool{}
	for _, tool := range s.tools {
		registered[tool.Name] = true
	}
	for _, group := range toolGroups {
		for _, name := range group.Tools {
			if !registered[name] {
				t.Errorf("group %q lists %q, which is not a registered tool", group.Title, name)
			}
		}
	}
}

// The frontmatter is what a client reads to decide whether to load the rest.
// Without a name and description the skill is inert.
func TestSkill_HasValidFrontmatter(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})
	skill := findFile(t, s.SkillBundle(), SkillName+"/SKILL.md")

	if !strings.HasPrefix(skill, "---\n") {
		t.Fatal("SKILL.md does not open with YAML frontmatter")
	}
	end := strings.Index(skill[4:], "\n---\n")
	if end < 0 {
		t.Fatal("SKILL.md frontmatter is not terminated")
	}
	front := skill[4 : end+4]

	if !strings.Contains(front, "name: "+SkillName) {
		t.Errorf("frontmatter is missing the skill name:\n%s", front)
	}
	if !strings.Contains(front, "description: ") {
		t.Errorf("frontmatter is missing a description:\n%s", front)
	}
	// The description is the only part that is always in context, so it has to
	// carry enough to decide with.
	if len(skillDescription) < 80 {
		t.Errorf("the description is too short to be a useful trigger: %q", skillDescription)
	}
	if !strings.Contains(skill, "reference/tools.md") {
		t.Error("SKILL.md does not point at its reference files, so they will never be loaded")
	}
}

// The bundle has to unpack into a skills directory as-is.
func TestSkill_ZipLayout(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})

	var buf bytes.Buffer
	if err := s.SkillZip(&buf); err != nil {
		t.Fatalf("SkillZip: %v", err)
	}

	r, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatalf("the bundle is not a readable zip: %v", err)
	}

	want := map[string]bool{
		SkillName + "/SKILL.md":               false,
		SkillName + "/reference/tools.md":     false,
		SkillName + "/reference/workflows.md": false,
	}
	for _, f := range r.File {
		if _, expected := want[f.Name]; !expected {
			t.Errorf("unexpected file in the bundle: %s", f.Name)
			continue
		}
		want[f.Name] = true

		rc, err := f.Open()
		if err != nil {
			t.Fatalf("open %s: %v", f.Name, err)
		}
		content, _ := io.ReadAll(rc)
		rc.Close()
		if len(content) == 0 {
			t.Errorf("%s is empty", f.Name)
		}
	}
	for name, found := range want {
		if !found {
			t.Errorf("%s is missing from the bundle", name)
		}
	}
}

// Writes must be marked. An agent that cannot tell a read from a change will
// eventually make one it did not intend to.
func TestSkill_MarksWriteTools(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})
	reference := findFile(t, s.SkillBundle(), SkillName+"/reference/tools.md")

	for _, tool := range s.tools {
		if !tool.Write {
			continue
		}
		heading := "### `" + tool.Name + "` **(write)**"
		if !strings.Contains(reference, heading) {
			t.Errorf("write tool %q is not marked as a write in the skill", tool.Name)
		}
	}
}

func findFile(t *testing.T, files []SkillFile, path string) string {
	t.Helper()
	for _, f := range files {
		if f.Path == path {
			return f.Content
		}
	}
	t.Fatalf("%s is not in the bundle", path)
	return ""
}
