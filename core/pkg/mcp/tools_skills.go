package mcp

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/skills"
)

// The registry is reachable over plain HTTP with the same agent key that
// authenticates the MCP endpoint. Bytes never travel through a tool result:
// a bundle base64'd into JSON would be read into the model's context on the
// way past, which is both expensive and pointless, since nothing in the
// conversation needs to see the zip.
const (
	skillDownloadPath = "/api/v1/mcp/skills/download"
	skillUploadPath   = "/api/v1/mcp/skills/upload"
)

type findSkillsArgs struct {
	Query string `json:"query,omitempty" jsonschema:"Match against name and description; omit to list everything."`
	Limit int    `json:"limit,omitempty"  jsonschema:"How many to return; default 25, max 50."`
}

type getSkillArgs struct {
	Name string `json:"name" jsonschema:"Skill name."`
}

// skillView is one skill in a listing.
type skillView struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Owner       string `json:"owner"`
	Version     int    `json:"version"`
	SizeBytes   int64  `json:"sizeBytes"`
	UpdatedAt   string `json:"updatedAt"`
	// Mine marks a skill published by the operator who owns this agent key,
	// which is also the only one this key may publish a new version of.
	Mine bool `json:"mine"`
}

// skillDetailView adds the history and the two things an agent needs in order
// to act: where to fetch the bundle, and where to send one.
type skillDetailView struct {
	skillView
	DownloadURL string             `json:"downloadUrl"`
	Versions    []skillVersionView `json:"versions,omitempty"`
	HowToUse    string             `json:"howToUse"`
	HowToUpdate string             `json:"howToUpdate,omitempty"`
}

type skillVersionView struct {
	Version    int    `json:"version"`
	UploadedAt string `json:"uploadedAt"`
	UploadedBy string `json:"uploadedBy"`
	SizeBytes  int64  `json:"sizeBytes"`
	Notes      string `json:"notes,omitempty"`
	// ViaAgent distinguishes an upload the operator made from one their agent
	// made for them.
	ViaAgent bool `json:"viaAgent,omitempty"`
}

func registerSkillTools(s *Server) {
	register(s, &mcp.Tool{
		Name: "find_skills",
		Description: "Skills operators have published on this server: shared working methods, " +
			"packaged the way your own skill is. Returns names and descriptions, not the bundles.",
	}, readTool, handleFindSkills)

	register(s, &mcp.Tool{
		Name: "get_skill",
		Description: "One skill in full: its version history and the URL to download the bundle " +
			"from with your agent key. Also how to publish a new version, when the key's owner owns the name.",
	}, readTool, handleGetSkill)
}

func handleFindSkills(ctx context.Context, s *Server, args findSkillsArgs) (toolResult, error) {
	if s.deps.Skills == nil {
		return toolResult{}, refuse("this server has no skill registry configured.")
	}
	all, err := s.deps.Skills.List(ctx)
	if err != nil {
		return toolResult{}, err
	}

	viewer := viewerID(ctx)
	matched := make([]skillView, 0, len(all))
	for _, skill := range all {
		if !matchesSkillQuery(skill, args.Query) {
			continue
		}
		matched = append(matched, toSkillView(skill, viewer))
	}

	limit := clampPageSize(args.Limit)
	var notes []string
	if len(matched) > limit {
		notes = append(notes, fmt.Sprintf(
			"Showing %d of %d skills. Narrow it with query.", limit, len(matched)))
		matched = matched[:limit]
	}
	if len(matched) == 0 {
		notes = append(notes, "Nobody has published a skill matching that yet.")
	}

	result, err := newPage(matched, "", notes...)
	if err != nil {
		return toolResult{}, err
	}
	return toolResult{Payload: result, Summary: "listed published skills"}, nil
}

func handleGetSkill(ctx context.Context, s *Server, args getSkillArgs) (toolResult, error) {
	if s.deps.Skills == nil {
		return toolResult{}, refuse("this server has no skill registry configured.")
	}
	skill, err := s.deps.Skills.Lookup(ctx, args.Name)
	if err != nil {
		return toolResult{}, asRefusal(err)
	}
	history, err := s.deps.Skills.Versions(ctx, skill.SkillID)
	if err != nil {
		return toolResult{}, err
	}

	viewer := viewerID(ctx)
	view := skillDetailView{
		skillView:   toSkillView(skill, viewer),
		DownloadURL: fmt.Sprintf("%s?name=%s", skillDownloadPath, skill.Name),
		HowToUse: fmt.Sprintf(
			"GET %s?name=%s with your agent key, unzip it into your skills directory, and start a new session so your client loads it.",
			skillDownloadPath, skill.Name),
	}
	for _, row := range history {
		view.Versions = append(view.Versions, skillVersionView{
			Version:    row.Version,
			UploadedAt: formatTime(row.CreateAt),
			UploadedBy: row.UploadedByName,
			SizeBytes:  row.SizeBytes,
			Notes:      row.Notes,
			ViaAgent:   row.ViaAgentKeyID != nil,
		})
	}
	if view.Mine {
		view.HowToUpdate = fmt.Sprintf(
			"POST multipart/form-data to %s with fields name=%s, file=<the zip>, and optionally description and notes. "+
				"Publishing adds a version; earlier ones stay downloadable.",
			skillUploadPath, skill.Name)
	}

	return toolResult{Payload: view, Summary: fmt.Sprintf("read the skill %q", skill.Name)}, nil
}

func toSkillView(skill models.Skill, viewer string) skillView {
	return skillView{
		Name:        skill.Name,
		Description: skill.Description,
		Owner:       skill.OwnerUsername,
		Version:     skill.CurrentVersion,
		SizeBytes:   skill.SizeBytes,
		UpdatedAt:   formatTime(skill.UploadedAt),
		Mine:        viewer != "" && skill.OwnerUserID.String() == viewer,
	}
}

func matchesSkillQuery(skill models.Skill, query string) bool {
	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		return true
	}
	return strings.Contains(strings.ToLower(skill.Name), q) ||
		strings.Contains(strings.ToLower(skill.Description), q) ||
		strings.Contains(strings.ToLower(skill.OwnerUsername), q)
}

// viewerID is the operator behind this call: for an agent, the key's owner.
func viewerID(ctx context.Context) string {
	return gqlctx.AuthFromContext(ctx).UserID
}

// asRefusal converts a registry policy failure into a refusal, so the model
// reads "that name belongs to someone else" as a decision to work around
// rather than a fault to retry.
//
// The service error is kept as the cause rather than flattened into a string:
// the audit row wants to call this a refusal, and the HTTP layer wants the
// status the service chose. Wrapping gives both without a second code path.
func asRefusal(err error) error {
	var svcErr *skills.Error
	if errors.As(err, &svcErr) && svcErr.IsPolicy() {
		return refusal{err: svcErr}
	}
	return err
}
