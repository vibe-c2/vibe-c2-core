package mcp

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
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
	ID          string   `json:"id"`
	Hostname    string   `json:"hostname"`
	Description string   `json:"description,omitempty"`
	OS          string   `json:"os,omitempty"`
	Addresses   []string `json:"addresses,omitempty"`
	LoginCount  int      `json:"loginCount,omitempty"`
	UpdatedAt   string   `json:"updatedAt,omitempty"`
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
	Validity string   `json:"validity"`
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
	ID string `json:"id"`
	// Value is complete on a single-hash read and clipped in listings — see
	// toHashListView. ValueLength is set only when it was clipped.
	Value       string `json:"value"`
	ValueLength int    `json:"valueLength,omitempty"`
	Status      string `json:"status,omitempty"`
	Comment     string `json:"comment,omitempty"`
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

	// Counts, not the lists themselves — a board listing should not carry
	// dozens of nested rows. Deliberately NOT omitempty: a zero here is the
	// most useful number on the view, because it says the task is floating
	// free of the notes and access it belongs to. get_task expands them.
	WikiReferenceCount       int `json:"wikiReferenceCount"`
	CredentialReferenceCount int `json:"credentialReferenceCount"`
}

// referenceView is one thing a task points at, named so the agent can judge
// whether the link is the right one without a second read.
type referenceView struct {
	ID   string `json:"id"`
	Name string `json:"name"`
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
	// Kind is present only on a page that is NOT ordinary prose, for the same
	// reason IsTemplate is: without it an agent scanning a listing cannot tell
	// a drawing from a page, so it aims the Markdown tools at a canvas and
	// spends a call learning otherwise. The argument is stronger here than for
	// templates — a template merely warrants caution, a drawing refuses the
	// call outright.
	//
	// Omitted for DOCUMENT rather than spelled out on every row: almost every
	// page is prose, and a field that reads "document" on ninety-nine rows out
	// of a hundred is noise that hides the one row that matters.
	Kind string `json:"kind,omitempty"`

	// Emoji and Icon travel with every row so an agent can see what the
	// operator's pages already use without opening them one by one. Choosing
	// an icon is a style decision, and style is only visible in aggregate —
	// a listing that omitted these forced a call per page to learn it, which
	// in practice meant the agent guessed instead.
	//
	// Both omitempty: most pages carry one or the other, never both, and the
	// adaptive default is omitted too (see toWikiDocView) because a row that
	// says "Adaptive" is a row that says nothing.
	Emoji string `json:"emoji,omitempty"`
	Icon  string `json:"icon,omitempty"`
}

// wikiTemplateView is a template in a listing that spans two operations —
// the operator's own and the shared Public wiki. Without the marker an agent
// cannot tell a house template from one belonging to this engagement, which
// matters: instantiating a shared one is normal, editing it changes what
// everybody else starts from.
type wikiTemplateView struct {
	wikiDocView
	Shared bool `json:"shared,omitempty"`
}

type wikiDocDetailView struct {
	wikiDocView
	Content   string `json:"content"`
	UpdatedAt string `json:"updatedAt,omitempty"`
	// Truncated says the body was cut to fit the response budget. Without it
	// an agent would happily rewrite a page from a partial read.
	Truncated bool `json:"truncated,omitempty"`
	// Section names the heading this body was sliced from, when the caller
	// asked for one. Its presence is the signal that `content` is PART of the
	// page — which update_wiki_document would otherwise happily treat as the
	// whole of it and delete everything else.
	Section string   `json:"section,omitempty"`
	Notes   []string `json:"notes,omitempty"`
}

// wikiOutlineView is a page's shape without its text: what headings it has,
// how deep they nest, and how much sits under each.
//
// Separate from wikiDocDetailView rather than an empty `content` on it,
// because "the body is empty" and "you asked not to be sent the body" are
// different facts and an agent that confuses them rewrites a page to nothing.
type wikiOutlineView struct {
	wikiDocView
	UpdatedAt string `json:"updatedAt,omitempty"`
	// Bytes is the whole page, so the agent can weigh one section against it.
	Bytes   int            `json:"bytes"`
	Outline []outlineEntry `json:"outline"`
	Notes   []string       `json:"notes,omitempty"`
}

// sectionTargetResult is what happened to one page in a multi-page write.
type sectionTargetResult struct {
	ID       string `json:"id"`
	Title    string `json:"title,omitempty"`
	OK       bool   `json:"ok"`
	Watchers int    `json:"watchers,omitempty"`
	Error    string `json:"error,omitempty"`
	audit    wiki.AttachmentAudit
}

// sectionWriteResultView reports a write that spanned several pages.
//
// Per-page rather than a single count, because the failures are the part the
// agent has to act on: which page was missed, and why. A bare "3 of 5" would
// send it re-sending to all five and doubling the content on the three that
// worked.
type sectionWriteResultView struct {
	Applied int                   `json:"applied"`
	Failed  int                   `json:"failed,omitempty"`
	Results []sectionTargetResult `json:"results"`
	Notes   []string              `json:"notes,omitempty"`
}

// wikiWriteResultView is what every single-page write returns.
//
// Watchers tells the agent whether anyone actually saw the edit land. It
// matters: an edit somebody watched appear needs no announcement, and one that
// happened to an empty room might be worth mentioning to the operator later.
type wikiWriteResultView struct {
	wikiDocView
	Watchers int `json:"watchers"`
	// AttachmentCards is how many files the page shows as attachment cards
	// after this write; FileLinksNotPlaced lists file links that stayed plain
	// links. A page reads back as the same markdown either way, so this is
	// where an agent learns its file line did not become a card.
	AttachmentCards    int                  `json:"attachmentCards"`
	FileLinksNotPlaced []wiki.StrayFileLink `json:"fileLinksNotPlaced,omitempty"`
	Note               string               `json:"note,omitempty"`
}

func newWikiWriteResult(doc wikiDocView, watchers int, audit wiki.AttachmentAudit) wikiWriteResultView {
	view := wikiWriteResultView{
		wikiDocView:        doc,
		Watchers:           watchers,
		AttachmentCards:    audit.AttachmentCards,
		FileLinksNotPlaced: audit.StrayFileLinks,
	}
	var notes []string
	if watchers > 0 {
		notes = append(notes, "The operator has this page open and saw your edit appear.")
	}
	if n := len(audit.StrayFileLinks); n > 0 {
		notes = append(notes, fmt.Sprintf(
			"%d file link(s) on the page are plain links, not attachment cards (see fileLinksNotPlaced). "+
				"A card needs the `[name bytes](/api/v1/wiki/files/<id>)` line alone on its own line, "+
				"nothing else beside it; edit_wiki_document can move it.", n))
	}
	view.Note = strings.Join(notes, " ")
	return view
}

// wikiSearchHitView is a search result with the text that matched.
//
// Without the snippet a hit is a title, and deciding whether it is the right
// page costs a full get_wiki_document each — so searching five candidates
// meant reading five whole pages to discard four. The snippet is the cheapest
// possible answer to "is this the one".
type wikiSearchHitView struct {
	wikiDocView
	Snippet string `json:"snippet,omitempty"`
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
		ID:          h.HostID.String(),
		Hostname:    h.Hostname,
		Description: h.Description,
		OS:          h.OS,
		Addresses:   hostAddresses(h),
		LoginCount:  len(h.Logins),
		UpdatedAt:   formatTime(h.UpdateAt),
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
		Validity: string(c.Validity),
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

// maxListHashValueChars is how much of a hash a listing row carries. It keeps
// NTLM and MD5 (32 hex) whole and clips the multi-kilobyte formats — Kerberos
// tickets, NetNTLMv2, sha512crypt — that otherwise blow a 50-row page down to
// a handful of rows. get_hash returns the whole value.
const maxListHashValueChars = 48

// toHashListView is toHashView with a clipped value, for listings.
func toHashListView(h *models.Hash) hashView {
	view := toHashView(h)
	if len(view.Value) > maxListHashValueChars {
		view.ValueLength = len(view.Value)
		view.Value = clipRunes(view.Value, maxListHashValueChars)
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

		WikiReferenceCount:       len(t.WikiReferences),
		CredentialReferenceCount: len(t.CredentialReferences),
	}
}

func toWikiDocView(d *models.WikiDocument) wikiDocView {
	view := wikiDocView{
		ID:         d.DocumentID.String(),
		Title:      d.Title,
		IsTemplate: d.IsTemplate,
		Emoji:      d.Emoji,
	}
	if d.Kind.IsDrawing() {
		view.Kind = string(models.WikiDocumentKindDrawing)
	}
	// The adaptive icon is the default every page gets when nobody chose
	// anything, so reporting it would drown the handful of deliberate choices
	// in noise — which is exactly the signal an agent is reading these rows
	// for. Absence here means "no deliberate icon", not "no icon".
	if d.Icon != AdaptiveIconName {
		view.Icon = d.Icon
	}
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

// maxWikiBodyBytes bounds a single document body per read. Well under the
// response budget so the envelope and metadata always fit alongside it. A body
// past this is not lost: it is cut here and continued from an offset the read
// reports, so the whole page stays reachable — see get_wiki_document.
const maxWikiBodyBytes = 40 * 1024

// truncateBody returns the largest prefix of body that fits one read, whether
// it had to cut, and how many bytes of body that prefix covers — the offset a
// continued read resumes from. The cut lands on a rune boundary, and on a line
// break in the back half where there is one, so the agent gets whole
// paragraphs rather than a severed sentence.
func truncateBody(body string) (string, bool, int) {
	if len(body) <= maxWikiBodyBytes {
		return body, false, len(body)
	}
	cut := truncateUTF8(body, maxWikiBodyBytes)
	if idx := strings.LastIndexByte(cut, '\n'); idx > maxWikiBodyBytes/2 {
		cut = cut[:idx]
	}
	return cut, true, len(cut)
}

// clampBodyOffset resolves a caller-supplied byte offset to a rune boundary
// within text, so a continued read never resumes in the middle of a character.
func clampBodyOffset(text string, offset int) int {
	if offset <= 0 {
		return 0
	}
	if offset >= len(text) {
		return len(text)
	}
	for offset < len(text) && !utf8.RuneStart(text[offset]) {
		offset++
	}
	return offset
}

// continuationSentinel is the line appended to a truncated body so the "there
// is more" signal travels in the text itself, not only in the truncated flag a
// client might drop. It names the byte window shown and the exact call that
// fetches the rest — full:true for a whole body, section:"<heading>" for a
// section — with the offset to pass.
func continuationSentinel(mode string, start, shown, total int) string {
	return fmt.Sprintf("…[showing bytes %d–%d of %d — read the rest with %s, offset:%d]",
		start, start+shown, total, mode, start+shown)
}
