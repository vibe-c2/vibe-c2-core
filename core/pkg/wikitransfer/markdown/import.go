package markdown

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"path"
	"strings"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer"
)

// ReadPlan turns a parsed markdown zip into a transfer Plan.
//
// Each top-level folder of the zip becomes one empty top-level page (the
// collection), with the folder's documents beneath it. Attachment links are
// rewritten from `uploads/…` to the canonical `/api/v1/wiki/{images,files}/`
// form under a freshly minted id, and the blob is registered on the plan
// under that id so the materialiser ingests it and the sidecar remaps the
// link. Credential fences are read into the plan's credential payloads; the
// fences themselves stay in the body for the sidecar to lower into chips.
func ReadPlan(zr *zip.Reader) (*wikitransfer.Plan, error) {
	parsed, err := Parse(zr)
	if err != nil {
		return nil, err
	}
	plan := &wikitransfer.Plan{
		BundleID:    uuid.New(),
		Attachments: map[uuid.UUID]*wikitransfer.Attachment{},
		Credentials: map[uuid.UUID]wikitransfer.CredentialPayload{},
	}
	tombstones := map[uuid.UUID]struct{}{}

	for _, coll := range parsed.Collections {
		collPage := &wikitransfer.Page{
			SourceID: uuid.New(),
			Title:    coll.Name,
			Icon:     wikitransfer.DefaultDocumentIcon,
		}
		for i, d := range coll.Documents {
			collPage.Children = append(collPage.Children, buildPage(parsed, plan, tombstones, d, i))
		}
		plan.Pages = append(plan.Pages, collPage)
	}
	for id := range tombstones {
		plan.CredentialTombstones = append(plan.CredentialTombstones, id)
	}
	return plan, nil
}

func buildPage(parsed *ParsedExport, plan *wikitransfer.Plan, tombstones map[uuid.UUID]struct{}, d *Doc, index int) *wikitransfer.Page {
	page := &wikitransfer.Page{
		SourceID:  uuid.New(),
		Title:     d.Title,
		Emoji:     d.Emoji,
		Icon:      d.Icon,
		Color:     d.Color,
		SortOrder: fractionalIndex(index),
	}
	body := d.BodyMarkdown
	for _, ref := range d.AttachmentRefs {
		blob, ok := resolveBlob(parsed, ref)
		if !ok {
			// Left in place: the reader sees a broken link rather than a
			// silently vanished attachment.
			continue
		}
		att := attachmentFromBlob(blob)
		plan.Attachments[att.ID] = att
		page.Attachments = append(page.Attachments, att.ID)
		body = strings.ReplaceAll(body, ref, canonicalURL(att))
	}
	collectCredentialFences(body, plan.Credentials, tombstones)
	page.Markdown = body

	for i, child := range d.Children {
		page.Children = append(page.Children, buildPage(parsed, plan, tombstones, child, i))
	}
	return page
}

// resolveBlob finds the zip entry a markdown link target refers to. The
// parser keys blobs by their `uploads/…` suffix; the link may be
// URL-encoded, may carry a trailing title, and may start with `../`
// segments when it came from a Vibe markdown export.
func resolveBlob(parsed *ParsedExport, ref string) (*zip.File, bool) {
	key := uploadsKey(ref)
	if f, ok := parsed.AttachmentBlobs[decodeURLPath(key)]; ok {
		return f, true
	}
	f, ok := parsed.AttachmentBlobs[key]
	return f, ok
}

func attachmentFromBlob(f *zip.File) *wikitransfer.Attachment {
	filename := sanitizeImportFilename(path.Base(f.Name))
	if filename == "" {
		filename = "file"
	}
	ct := guessContentType(filename)
	kind := wikitransfer.AttachmentFile
	if strings.HasPrefix(ct, "image/") {
		kind = wikitransfer.AttachmentImage
	}
	return &wikitransfer.Attachment{
		ID:          uuid.New(),
		Kind:        kind,
		Filename:    filename,
		ContentType: ct,
		SizeBytes:   int64(f.UncompressedSize64),
		Open:        func() (io.ReadCloser, error) { return f.Open() },
	}
}

func canonicalURL(att *wikitransfer.Attachment) string {
	if att.Kind == wikitransfer.AttachmentImage {
		return "/api/v1/wiki/images/" + att.ID.String()
	}
	return "/api/v1/wiki/files/" + att.ID.String()
}

// collectCredentialFences reads every vibe-credential fence in body into
// the plan's payload map, and tombstone fences into the tombstone set.
func collectCredentialFences(body string, into map[uuid.UUID]wikitransfer.CredentialPayload, tombstones map[uuid.UUID]struct{}) {
	if !containsCredentialFence(body) {
		return
	}
	for _, m := range credentialFencePattern.FindAllStringSubmatch(body, -1) {
		var p wikitransfer.CredentialPayload
		if err := json.Unmarshal([]byte(m[1]), &p); err != nil {
			continue
		}
		id, err := uuid.Parse(p.ID)
		if err != nil {
			continue
		}
		if p.Deleted {
			tombstones[id] = struct{}{}
			continue
		}
		if _, seen := into[id]; !seen {
			into[id] = p
		}
	}
}

// fractionalIndex builds a stable, lexicographically ordered sort key for
// the i-th sibling: fixed-width base36, good for 1296 siblings.
func fractionalIndex(i int) string {
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
	if i < 0 {
		i = 0
	}
	a := i / 36
	if a >= len(alphabet) {
		a = len(alphabet) - 1
	}
	return string(alphabet[a]) + string(alphabet[i%36])
}

// decodeURLPath best-effort URL-decodes a markdown link target so it can be
// matched against the zip's exact path. A trailing title attribute is
// stripped first.
func decodeURLPath(p string) string {
	if i := strings.IndexByte(p, ' '); i >= 0 {
		p = p[:i]
	}
	out, err := url.PathUnescape(p)
	if err != nil {
		return p
	}
	return out
}

// guessContentType routes a blob to the image or file ingest path and
// supplies the declared type hint. The file ingest helper sniffs bytes
// when the hint is generic.
func guessContentType(filename string) string {
	switch strings.ToLower(path.Ext(filename)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".avif":
		return "image/avif"
	case ".svg":
		return "image/svg+xml"
	case ".pdf":
		return "application/pdf"
	case ".txt":
		return "text/plain"
	case ".md":
		return "text/markdown"
	case ".csv":
		return "text/csv"
	case ".json":
		return "application/json"
	case ".zip":
		return "application/zip"
	default:
		return "application/octet-stream"
	}
}

// sanitizeImportFilename normalises a zip entry name into something safe to
// persist and echo in download headers: no path segments, no control
// characters, no Windows-reserved trailing characters.
func sanitizeImportFilename(raw string) string {
	base := path.Base(strings.ReplaceAll(raw, `\`, "/"))
	if base == "." || base == "/" || base == "" {
		return ""
	}
	var sb strings.Builder
	sb.Grow(len(base))
	for _, r := range base {
		if r < 0x20 || r == 0x7f {
			continue
		}
		sb.WriteRune(r)
	}
	cleaned := strings.Join(strings.Fields(sb.String()), " ")
	cleaned = strings.TrimRight(cleaned, ". ")
	const maxLen = 255
	if len(cleaned) > maxLen {
		cleaned = cleaned[:maxLen]
	}
	return cleaned
}

// ErrNoCollections is returned by Parse when the zip has no top-level
// folder; re-exported for callers that want to map it to a 400.
var ErrNoCollections = fmt.Errorf("zip has no top-level collection folder")
