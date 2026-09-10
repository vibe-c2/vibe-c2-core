package mcp

import (
	"fmt"
	"strings"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// Compact views of domain objects.
//
// Tools return these rather than the domain models. Two reasons, both about
// the agent rather than the wire:
//
//   - Budget. A host carries interfaces, routes and logins; fifty of them in
//     full would swamp a context window before the agent has done anything.
//   - Stability. The models are internal and change freely. Projecting through
//     an explicit view means a refactor there does not silently reshape what
//     agents have learned to expect.
//
// Where a field is omitted, a per-record tool exists to fetch the whole thing.

type operationView struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	MyRole      string `json:"myRole,omitempty"`
}

type hostView struct {
	ID         string   `json:"id"`
	Hostname   string   `json:"hostname"`
	OS         string   `json:"os,omitempty"`
	Addresses  []string `json:"addresses,omitempty"`
	LoginCount int      `json:"loginCount,omitempty"`
	UpdatedAt  string   `json:"updatedAt,omitempty"`
}

type hostDetailView struct {
	hostView
	Interfaces []hostInterfaceView `json:"interfaces,omitempty"`
	Routes     []hostRouteView     `json:"routes,omitempty"`
	Logins     []hostLoginView     `json:"logins,omitempty"`
}

type hostInterfaceView struct {
	Name    string   `json:"name,omitempty"`
	MAC     string   `json:"mac,omitempty"`
	Address []string `json:"addresses,omitempty"`
}

type hostRouteView struct {
	Destination string `json:"destination,omitempty"`
	Gateway     string `json:"gateway,omitempty"`
	Interface   string `json:"interface,omitempty"`
}

type hostLoginView struct {
	User string `json:"user,omitempty"`
	// From is the source host the session came from, empty for local logins.
	// It is the edge the topology users lens draws, so it is the field an
	// agent reasoning about lateral movement actually needs.
	From     string `json:"from,omitempty"`
	TTY      string `json:"tty,omitempty"`
	LastSeen string `json:"lastSeen,omitempty"`
	Count    int    `json:"count,omitempty"`
}

// credentialView carries secret material in full.
//
// That is a deliberate decision by the platform owner: these are credentials
// harvested from targets during an authorized engagement, not the operator's
// own secrets, and an agent that cannot see them cannot do the correlation
// work it is here for. The consequence — plaintext reaching the model
// provider — is stated on the agent-key screen where keys are minted.
type credentialView struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Type     string   `json:"type"`
	Username string   `json:"username,omitempty"`
	Password string   `json:"password,omitempty"`
	IsValid  bool     `json:"isValid"`
	Tags     []string `json:"tags,omitempty"`
}

// Detail views for a single credential. Keys and properties carry their
// contents in full, consistent with credentialView — see the note there on why
// secret material is not redacted.
type credentialKeyView struct {
	Name    string `json:"name,omitempty"`
	Content string `json:"content,omitempty"`
}

type credentialPropertyView struct {
	Name  string `json:"name,omitempty"`
	Value string `json:"value,omitempty"`
}

type credentialCommentView struct {
	Text      string `json:"text"`
	CreatedAt string `json:"createdAt,omitempty"`
}

type hashView struct {
	ID      string `json:"id"`
	Value   string `json:"value"`
	Status  string `json:"status,omitempty"`
	Comment string `json:"comment,omitempty"`
	// CredentialID links a cracked hash to the credential it produced, which
	// is most of why an agent looks at hashes at all.
	CredentialID string   `json:"credentialId,omitempty"`
	Tags         []string `json:"tags,omitempty"`
}

type taskView struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Stage       string `json:"stage"`
	Status      string `json:"status,omitempty"`
	RiskScore   int    `json:"riskScore"`
	ProfitScore int    `json:"profitScore"`
}

type wikiDocView struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	ParentID string `json:"parentId,omitempty"`
	Depth    int    `json:"depth,omitempty"`
	// IsTemplate matters before editing: a template is a shared convention the
	// operator's team writes from, and rewriting one silently changes every
	// page made from it afterwards. Without this an agent cannot tell one from
	// an ordinary page.
	IsTemplate bool `json:"isTemplate,omitempty"`
}

type wikiDocDetailView struct {
	wikiDocView
	Content   string `json:"content"`
	UpdatedAt string `json:"updatedAt,omitempty"`
	// Truncated says the body was cut to fit the response budget. Without it
	// an agent would happily rewrite a page from a partial read.
	Truncated bool `json:"truncated,omitempty"`
}

type timelineEventView struct {
	ID          string `json:"id"`
	Topic       string `json:"topic"`
	SubjectKind string `json:"subjectKind"`
	SubjectName string `json:"subjectName"`
	Actor       string `json:"actor,omitempty"`
	OccurredAt  string `json:"occurredAt"`
}

// --- Projections ---

func toOperationView(op *models.Operation, myRole string) operationView {
	return operationView{
		ID:          op.OperationID.String(),
		Name:        op.Name,
		Description: op.Description,
		MyRole:      myRole,
	}
}

func toHostView(h *models.Host) hostView {
	return hostView{
		ID:         h.HostID.String(),
		Hostname:   h.Hostname,
		OS:         h.OS,
		Addresses:  hostAddresses(h),
		LoginCount: len(h.Logins),
		UpdatedAt:  formatTime(h.UpdateAt),
	}
}

func toHostDetailView(h *models.Host) hostDetailView {
	view := hostDetailView{hostView: toHostView(h)}
	for _, iface := range h.Interfaces {
		view.Interfaces = append(view.Interfaces, hostInterfaceView{
			Name: iface.Name, MAC: iface.MAC, Address: iface.Addresses,
		})
	}
	for _, route := range h.Routes {
		view.Routes = append(view.Routes, hostRouteView{
			Destination: route.Destination, Gateway: route.Gateway, Interface: route.Interface,
		})
	}
	for _, login := range h.Logins {
		view.Logins = append(view.Logins, hostLoginView{
			User: login.User, From: login.From, TTY: login.TTY,
			LastSeen: login.LastSeen, Count: login.Count,
		})
	}
	return view
}

func hostAddresses(h *models.Host) []string {
	var out []string
	for _, iface := range h.Interfaces {
		out = append(out, iface.Addresses...)
	}
	return out
}

func toCredentialView(c *models.Credential) credentialView {
	return credentialView{
		ID:       c.CredentialID.String(),
		Name:     c.Name,
		Type:     string(c.Type),
		Username: c.Username,
		Password: c.Password,
		IsValid:  c.IsValid,
		Tags:     c.Tags,
	}
}

func toHashView(h *models.Hash) hashView {
	view := hashView{
		ID:      h.HashID.String(),
		Value:   h.Value,
		Status:  string(h.Status),
		Comment: h.Comment,
		Tags:    h.Tags,
	}
	if h.CredentialID != nil {
		view.CredentialID = h.CredentialID.String()
	}
	return view
}

func toTaskView(t *models.Task) taskView {
	return taskView{
		ID:          t.TaskID.String(),
		Name:        t.Name,
		Description: t.Description,
		Stage:       string(t.Stage),
		Status:      string(t.Status),
		RiskScore:   int(t.RiskScore),
		ProfitScore: int(t.ProfitScore),
	}
}

func toWikiDocView(d *models.WikiDocument) wikiDocView {
	view := wikiDocView{ID: d.DocumentID.String(), Title: d.Title, IsTemplate: d.IsTemplate}
	if d.ParentDocumentID != nil {
		view.ParentID = d.ParentDocumentID.String()
	}
	return view
}

func toTimelineEventView(e *models.OperationEvent, actor string) timelineEventView {
	return timelineEventView{
		ID:          e.EventID.String(),
		Topic:       e.Topic,
		SubjectKind: string(e.SubjectKind),
		SubjectName: e.SubjectName,
		Actor:       actor,
		OccurredAt:  formatTime(e.OccurredAt),
	}
}

// --- Helpers ---

func formatTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

// maxWikiBodyBytes bounds a single document body. Well under the response
// budget so the envelope and metadata always fit alongside it.
const maxWikiBodyBytes = 40 * 1024

// truncateBody cuts an over-long document at a line boundary where it can, so
// the agent gets whole paragraphs rather than a severed sentence.
func truncateBody(body string) (string, bool) {
	if len(body) <= maxWikiBodyBytes {
		return body, false
	}
	cut := body[:maxWikiBodyBytes]
	if idx := strings.LastIndexByte(cut, '\n'); idx > maxWikiBodyBytes/2 {
		cut = cut[:idx]
	}
	return cut + fmt.Sprintf("\n\n…[truncated: %d of %d bytes shown]", len(cut), len(body)), true
}
