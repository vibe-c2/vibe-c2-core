package mcp

import (
	"archive/zip"
	_ "embed"
	"fmt"
	"io"
	"sort"
	"strings"
	"text/template"
	"time"
)

// The prose lives in real markdown files rather than Go string literals: it is
// documentation, it is edited far more often than the code around it, and
// markdown full of backticks cannot be written as a Go raw string at all.
var (
	//go:embed skillassets/SKILL.md.tmpl
	skillTemplateSource string
	//go:embed skillassets/workflows.md
	workflowsMD string

	skillTemplate = template.Must(template.New("skill").Parse(skillTemplateSource))
)

type skillTemplateData struct {
	Name          string
	Description   string
	ServerVersion string
	GeneratedAt   string
	ToolCount     int
}

// Skill generation.
//
// An operator should not have to teach their agent this platform. The server
// knows its own tool surface, so it can hand out a skill that describes it —
// and because the skill is assembled from the live registry, the copy an
// operator installs always matches the server they are pointed at. A
// hand-written skill in a separate repository is stale the first time somebody
// adds a tool.
//
// The format is Anthropic's Agent Skills: a directory with SKILL.md carrying
// YAML frontmatter, plus reference files loaded only when the agent decides
// they are relevant. That progressive disclosure is the reason to ship a skill
// rather than a longer `instructions` string — the detail costs nothing until
// it is needed.
//
// A skill is client-side and cannot be pushed over MCP. What the server can do
// is make installing it one step and keep it correct.

// SkillName is the directory and frontmatter name. Stable: renaming it would
// orphan every installed copy.
const SkillName = "vibe-c2"

// skillDescription is the one line that stays in the agent's context
// permanently. It has to say both what the skill covers and when to reach for
// it, because that sentence alone decides whether the rest is ever loaded.
const skillDescription = "Work an offensive security engagement in Vibe C2 — hosts, credentials, hashes, tasks, wiki notes and the operation timeline — through its MCP tools. Use whenever connected to a Vibe C2 MCP endpoint, or when the user mentions an operation, findings, or engagement notes."

// SkillFile is one file in the generated bundle.
type SkillFile struct {
	Path    string
	Content string
}

// SkillBundle renders the whole skill.
func (s *Server) SkillBundle() []SkillFile {
	groups, ungrouped := groupedTools(s.tools)
	return []SkillFile{
		{Path: SkillName + "/SKILL.md", Content: s.renderSkillMD()},
		{Path: SkillName + "/reference/tools.md", Content: renderToolsReference(groups, ungrouped)},
		{Path: SkillName + "/reference/workflows.md", Content: workflowsMD},
	}
}

// SkillZip writes the bundle as a zip, ready to unpack into a skills
// directory.
func (s *Server) SkillZip(w io.Writer) error {
	zw := zip.NewWriter(w)
	for _, file := range s.SkillBundle() {
		f, err := zw.Create(file.Path)
		if err != nil {
			return fmt.Errorf("create %s: %w", file.Path, err)
		}
		if _, err := io.WriteString(f, file.Content); err != nil {
			return fmt.Errorf("write %s: %w", file.Path, err)
		}
	}
	return zw.Close()
}

func (s *Server) renderSkillMD() string {
	var b strings.Builder
	if err := skillTemplate.Execute(&b, skillTemplateData{
		Name:          SkillName,
		Description:   skillDescription,
		ServerVersion: serverVersion,
		GeneratedAt:   time.Now().UTC().Format("2006-01-02"),
		ToolCount:     len(s.tools),
	}); err != nil {
		// Unreachable: the template is embedded and parsed at init, so a
		// failure here would mean the binary shipped broken.
		return "---\nname: " + SkillName + "\ndescription: " + skillDescription + "\n---\n"
	}
	return b.String()
}

func renderToolsReference(groups []renderedGroup, ungrouped []toolDoc) string {
	var b strings.Builder

	b.WriteString(`# Tool reference

Grouped by what you are trying to do. Tools marked **write** change the
operation and appear on the operator's timeline; everything else only reads,
though reads are recorded too.

`)

	for _, g := range groups {
		fmt.Fprintf(&b, "## %s\n\n%s\n\n", g.Title, g.Intro)
		for _, t := range g.Tools {
			marker := ""
			if t.Write {
				marker = " **(write)**"
			}
			fmt.Fprintf(&b, "### `%s`%s\n\n%s\n\n", t.Name, marker, t.Description)
		}
	}

	if len(ungrouped) > 0 {
		// Visible rather than dropped: a tool nobody filed is still a tool the
		// agent can call, and silently omitting it would be worse than an
		// untidy heading.
		b.WriteString("## Other\n\nNot yet grouped.\n\n")
		sort.Slice(ungrouped, func(i, j int) bool { return ungrouped[i].Name < ungrouped[j].Name })
		for _, t := range ungrouped {
			fmt.Fprintf(&b, "### `%s`\n\n%s\n\n", t.Name, t.Description)
		}
	}

	return b.String()
}
