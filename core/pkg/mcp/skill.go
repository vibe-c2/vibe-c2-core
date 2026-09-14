package mcp

import (
	"archive/zip"
	_ "embed"
	"fmt"
	"io"
	"sort"
	"strings"
	"text/template"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/mcp/skillchangelog"
)

// The prose lives in real markdown files rather than Go string literals: it is
// documentation, it is edited far more often than the code around it, and
// markdown full of backticks cannot be written as a Go raw string at all.
var (
	//go:embed skillassets/SKILL.md.tmpl
	skillTemplateSource string
	//go:embed skillassets/wiki.md
	wikiMD string
	//go:embed skillassets/findings.md
	findingsMD string
	//go:embed skillassets/tasks.md
	tasksMD string
	//go:embed skillassets/attachments.md
	attachmentsMD string
	//go:embed skillassets/icons.md
	iconsMD string

	skillTemplate = template.Must(template.New("skill").Parse(skillTemplateSource))
)

// referenceGuide is one on-demand reference file. The same text ships as
// reference/<Name>.md in the skill and as the resource vibe://guide/<Name>,
// so a client without a skill mechanism can still load one job's guidance
// without paying for all of them.
type referenceGuide struct {
	Name    string
	Summary string
	Content string
}

// referenceGuides lists the split reference files. One file per job rather
// than one workflows file: progressive disclosure only works at file
// granularity, and an agent that wants "how do I edit a page" should not have
// to load the icon palette to find out.
var referenceGuides = []referenceGuide{
	{"wiki", "reading, editing and templating pages", wikiMD},
	{"findings", "recording hosts, credentials and hashes", findingsMD},
	{"tasks", "proposing, linking and closing tasks", tasksMD},
	{"attachments", "reading and adding files on a page", attachmentsMD},
	{"icons", "when and how to give a page an icon", iconsMD},
}

// findReferenceGuide returns the guide with that name.
func findReferenceGuide(name string) (referenceGuide, bool) {
	for _, g := range referenceGuides {
		if g.Name == name {
			return g, true
		}
	}
	return referenceGuide{}, false
}

type skillTemplateData struct {
	Name        string
	Description string
	// Version is stamped into the frontmatter metadata so an operator can
	// read which release they have installed, and so the update prompt in
	// the app has something to compare against. The number comes from
	// package skillchangelog; the golden test keeps it honest.
	Version int
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
	files := []SkillFile{
		{Path: SkillName + "/SKILL.md", Content: s.renderSkillMD()},
		{Path: SkillName + "/reference/tools.md", Content: renderToolsReference(groups, ungrouped)},
	}
	for _, g := range referenceGuides {
		files = append(files, SkillFile{Path: SkillName + "/reference/" + g.Name + ".md", Content: g.Content})
	}
	return files
}

// GuideText renders the core of the skill as one document, for clients that
// have no skill mechanism at all.
//
// A skill file is client-side: the operator installs it, and only Claude
// clients load it. An operator on any other MCP client would otherwise get
// nothing but the short instructions string — so the same guidance is offered
// as a resource they can pull on demand.
//
// Core only: the conduct rules and the tool index. The per-job references are
// separate resources (vibe://guide/<name>), listed at the end, so a first
// read costs a few thousand tokens rather than everything the platform knows.
// The frontmatter is stripped: it exists so a skill runtime can decide whether
// to load the file, and whoever is reading this already decided.
func (s *Server) GuideText() string {
	groups, ungrouped := groupedTools(s.tools)

	var b strings.Builder
	b.WriteString(stripSkillOnly(stripFrontmatter(s.renderSkillSource())))
	b.WriteString("\n\n---\n\n")
	b.WriteString(renderToolsReference(groups, ungrouped))
	b.WriteString("\n---\n\n## Further reading\n\nRead the resource that matches the job.\n\n")
	for _, g := range referenceGuides {
		fmt.Fprintf(&b, "- `%s%s` — %s.\n", guideResourceURI+"/", g.Name, g.Summary)
	}
	return b.String()
}

// removeSkillOnlyMarkers deletes the marker lines, keeping what they wrap.
func removeSkillOnlyMarkers(doc string) string {
	doc = strings.ReplaceAll(doc, skillOnlyStart+"\n", "")
	doc = strings.ReplaceAll(doc, skillOnlyEnd+"\n", "")
	doc = strings.ReplaceAll(doc, skillOnlyStart, "")
	return strings.ReplaceAll(doc, skillOnlyEnd, "")
}

// skillOnly delimits passages that make sense only in the installed skill,
// where the reference files exist as sibling documents. In the flattened guide
// they would point at files the reader has no way to open.
const (
	skillOnlyStart = "<!-- skill-only:start -->"
	skillOnlyEnd   = "<!-- skill-only:end -->"
)

// stripSkillOnly removes every delimited passage. HTML comments because they
// are invisible wherever the skill itself is rendered.
func stripSkillOnly(doc string) string {
	for {
		start := strings.Index(doc, skillOnlyStart)
		if start < 0 {
			return doc
		}
		end := strings.Index(doc[start:], skillOnlyEnd)
		if end < 0 {
			// Unterminated: drop from the marker rather than leaving a
			// dangling instruction in a document that cannot honour it.
			return strings.TrimRight(doc[:start], "\n") + "\n"
		}
		doc = doc[:start] + doc[start+end+len(skillOnlyEnd):]
	}
}

// stripFrontmatter removes a leading YAML block, if there is one.
func stripFrontmatter(doc string) string {
	if !strings.HasPrefix(doc, "---\n") {
		return doc
	}
	end := strings.Index(doc[4:], "\n---\n")
	if end < 0 {
		return doc
	}
	return strings.TrimLeft(doc[4+end+len("\n---\n"):], "\n")
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

// renderSkillMD is the installed skill: the delimited content kept, the
// markers removed. An agent reads this file raw, so leftover plumbing is noise
// in its context.
func (s *Server) renderSkillMD() string {
	return removeSkillOnlyMarkers(s.renderSkillSource())
}

// renderSkillSource is the templated document with its markers intact. The two
// presentations both derive from it — one keeps the delimited passages, the
// other drops them — so neither can be built from the other's output.
func (s *Server) renderSkillSource() string {
	var b strings.Builder
	if err := skillTemplate.Execute(&b, skillTemplateData{
		Name:        SkillName,
		Description: skillDescription,
		Version:     skillchangelog.Current(),
	}); err != nil {
		// Unreachable: the template is embedded and parsed at init, so a
		// failure here would mean the binary shipped broken.
		return "---\nname: " + SkillName + "\ndescription: " + skillDescription + "\n---\n"
	}
	return b.String()
}

// renderToolsReference is an index, not a second copy of the schema.
//
// The client already holds every tool's full description and argument schema
// and sends them on every turn; repeating the descriptions here meant an agent
// that opened the file paid for them twice. What the schema cannot carry is
// grouping and order, so that is what this file adds: one line per tool, under
// the heading an agent would look for it.
func renderToolsReference(groups []renderedGroup, ungrouped []toolDoc) string {
	var b strings.Builder

	b.WriteString(`# Tool index

Grouped by job, in the order you usually need them. Tools marked **(write)**
change the operation; everything else only reads, though reads are recorded
too. Full descriptions and arguments are in your tool list.

`)

	for _, g := range groups {
		fmt.Fprintf(&b, "## %s\n\n%s\n\n", g.Title, g.Intro)
		for _, t := range g.Tools {
			b.WriteString(toolIndexLine(t))
		}
		b.WriteString("\n")
	}

	if len(ungrouped) > 0 {
		// Visible rather than dropped: a tool nobody filed is still a tool the
		// agent can call, and silently omitting it would be worse than an
		// untidy heading.
		b.WriteString("## Other\n\nNot yet grouped.\n\n")
		sort.Slice(ungrouped, func(i, j int) bool { return ungrouped[i].Name < ungrouped[j].Name })
		for _, t := range ungrouped {
			b.WriteString(toolIndexLine(t))
		}
	}

	return b.String()
}

// toolIndexLine is one tool in the index: its name, the write marker, and the
// first sentence of its description.
func toolIndexLine(t toolDoc) string {
	marker := ""
	if t.Write {
		marker = " **(write)**"
	}
	return fmt.Sprintf("- `%s`%s — %s\n", t.Name, marker, firstSentence(t.Description))
}

// firstSentence cuts at the first sentence end. Descriptions are written so
// the first sentence says what the tool does and the rest qualifies it.
func firstSentence(s string) string {
	for i := 0; i < len(s); i++ {
		if s[i] == '.' && (i+1 == len(s) || s[i+1] == ' ') {
			return s[:i+1]
		}
	}
	return s
}
