package mcp

import (
	"archive/zip"
	"bytes"
	"context"
	"io"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
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
		SkillName + "/SKILL.md":           false,
		SkillName + "/reference/tools.md": false,
	}
	for _, g := range referenceGuides {
		want[SkillName+"/reference/"+g.Name+".md"] = false
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
		heading := "- `" + tool.Name + "` **(write)**"
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

// The guide is the same knowledge as the skill, for clients with no skill
// mechanism. If it drifted from the skill an operator on Cursor would be
// working from different documentation than one on Claude Code.
func TestGuide_CarriesTheSameContentAsTheSkill(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})
	guide := s.GuideText()

	// Every tool, same as the skill's index.
	for _, tool := range s.tools {
		if !strings.Contains(guide, "`"+tool.Name+"`") {
			t.Errorf("tool %q is missing from the guide", tool.Name)
		}
	}

	for _, marker := range []string{
		"# Tool index",
		"Findings hold the data", // the conduct guidance from SKILL.md
	} {
		if !strings.Contains(guide, marker) {
			t.Errorf("the guide is missing %q", marker)
		}
	}

	// The per-job references are separate resources, and the guide has to
	// say so or a resource reader never finds them.
	for _, g := range referenceGuides {
		if !strings.Contains(guide, guideResourceURI+"/"+g.Name) {
			t.Errorf("the guide does not point at %s/%s", guideResourceURI, g.Name)
		}
	}

	// The pointers to sibling files make no sense in a flattened document.
	if strings.Contains(guide, "reference/tools.md") {
		t.Error("the guide still points at reference files that do not exist for a resource reader")
	}
}

// Each reference file is also served as its own resource, so a client
// without a skill mechanism can load one job's guidance at a time.
func TestGuide_ServesEachReferenceAsAResource(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})
	for _, g := range referenceGuides {
		res, err := s.readResource(context.Background(), &mcp.ReadResourceRequest{
			Params: &mcp.ReadResourceParams{URI: guideResourceURI + "/" + g.Name},
		})
		if err != nil {
			t.Fatalf("%s: %v", g.Name, err)
		}
		if got := res.Contents[0].Text; got != g.Content {
			t.Errorf("%s resource does not match the skill file", g.Name)
		}
	}
	if _, err := s.readResource(context.Background(), &mcp.ReadResourceRequest{
		Params: &mcp.ReadResourceParams{URI: guideResourceURI + "/nope"},
	}); err == nil {
		t.Error("an unknown guide name was served")
	}
}

// Frontmatter is for a skill runtime deciding whether to load a file. A
// resource reader has already decided, so leading YAML would just be noise at
// the top of the document.
func TestGuide_HasNoFrontmatter(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})
	guide := s.GuideText()

	if strings.HasPrefix(guide, "---") {
		t.Fatalf("the guide starts with frontmatter:\n%s", guide[:120])
	}
	if !strings.HasPrefix(guide, "# Vibe C2") {
		t.Fatalf("the guide should open with its title, got: %q", firstLine(guide))
	}
}

func TestStripFrontmatter(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"with frontmatter", "---\nname: x\n---\n\n# Title\n\nbody", "# Title\n\nbody"},
		{"without frontmatter", "# Title\n\nbody", "# Title\n\nbody"},
		{"unterminated frontmatter is left alone", "---\nname: x\n# Title", "---\nname: x\n# Title"},
		{"empty", "", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := stripFrontmatter(tc.in); got != tc.want {
				t.Fatalf("stripFrontmatter(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

// The instructions string is charged on every turn, so it has to stay short —
// and it has to point at the guide, which is the only reason it can afford to.
func TestInstructions_StayShortAndPointAtTheGuide(t *testing.T) {
	const budget = 1000
	if len(serverInstructions) > budget {
		t.Errorf("instructions are %d chars, over the %d budget — they are carried every turn; "+
			"move detail into the guide instead", len(serverInstructions), budget)
	}
	if !strings.Contains(serverInstructions, guideResourceURI) {
		t.Errorf("instructions do not mention %s, so a client with no skill support "+
			"has no way to learn the guide exists", guideResourceURI)
	}
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

func TestStripSkillOnly(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "removes a delimited passage",
			in:   "before\n" + skillOnlyStart + "\ngone\n" + skillOnlyEnd + "\nafter",
			want: "before\n\nafter",
		},
		{
			name: "removes several",
			in:   "a" + skillOnlyStart + "x" + skillOnlyEnd + "b" + skillOnlyStart + "y" + skillOnlyEnd + "c",
			want: "abc",
		},
		{
			name: "leaves undelimited text alone",
			in:   "# Title\n\nbody",
			want: "# Title\n\nbody",
		},
		{
			// Better to lose the tail than to leave an instruction the reader
			// cannot act on.
			name: "unterminated drops the remainder",
			in:   "keep\n" + skillOnlyStart + "\nlost",
			want: "keep\n",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := stripSkillOnly(tc.in); got != tc.want {
				t.Fatalf("stripSkillOnly(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

// The installed skill must KEEP what the guide drops — the reference pointers
// are how its sibling files ever get loaded.
func TestSkill_KeepsItsReferencePointers(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})
	skill := findFile(t, s.SkillBundle(), SkillName+"/SKILL.md")

	want := []string{"reference/tools.md"}
	for _, g := range referenceGuides {
		want = append(want, "reference/"+g.Name+".md")
	}
	for _, path := range want {
		if !strings.Contains(skill, path) {
			t.Errorf("SKILL.md no longer points at %s, so it will never be loaded", path)
		}
	}
	// The markers themselves are plumbing and should not reach the reader.
	if strings.Contains(skill, skillOnlyStart) || strings.Contains(skill, skillOnlyEnd) {
		t.Error("the skill-only markers are visible in SKILL.md")
	}
}

// Skill prose is a budget, not a canvas.
//
// SKILL.md is loaded in full every time the skill triggers, so a paragraph
// added here is paid for on every engagement forever. The reference files are
// loaded on demand and can afford more, but only just — they grow by accretion
// as tools are added, and nothing else in the process ever asks whether an
// older section is still earning its place.
//
// These ceilings are deliberately close to the current sizes. Crossing one is
// not a failure, it is a prompt: re-read the file and cut something before
// raising the number.
//
// reference/tools.md is generated from the registry as a one-line index, so
// it is budgeted per tool rather than in total.
func TestSkill_ProseStaysWithinItsBudget(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})
	budgets := map[string]int{
		SkillName + "/SKILL.md":           4 * 1024,
		SkillName + "/reference/tools.md": 1024 + 120*len(s.tools),
	}
	for _, g := range referenceGuides {
		budgets[SkillName+"/reference/"+g.Name+".md"] = 4 * 1024
	}

	for _, file := range s.SkillBundle() {
		budget, ok := budgets[file.Path]
		if !ok {
			continue
		}
		if len(file.Content) > budget {
			t.Errorf("%s is %d bytes, over its %d budget — cut something rather than "+
				"raising the number", file.Path, len(file.Content), budget)
		}
	}
}

// The Public operation is reachable by every authenticated caller and appears
// in no membership query, so an agent can only learn it exists from the guide
// or from list_operations. It was usable and undiscoverable for a while, which
// is the worst of both.
func TestGuide_MentionsThePublicOperation(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})
	guide := s.GuideText()

	if !strings.Contains(guide, "Public") {
		t.Error("the guide never mentions the Public operation, which an agent " +
			"cannot otherwise discover")
	}
	// Reachable is not the same as appropriate; the guide has to say what it
	// is for, or an agent will file target-specific notes in a shared space.
	if !strings.Contains(guide, "outlive") {
		t.Error("the guide mentions Public without saying what belongs there")
	}
}

// Templates are a shared convention. An agent that cannot see them writes a
// second house style; one that edits them changes everyone's pages.
func TestGuide_CoversTemplates(t *testing.T) {
	guide, _ := findReferenceGuide("wiki")

	for _, want := range []string{
		"list_wiki_templates",
		"template_id",
		"isTemplate",
	} {
		if !strings.Contains(guide.Content, want) {
			t.Errorf("the wiki guide does not cover %q", want)
		}
	}
}
