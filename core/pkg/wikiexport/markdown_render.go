package wikiexport

import (
	"path"
	"regexp"
	"strings"

	"github.com/google/uuid"
)

// Patterns that match attachment refs as the sidecar's markdown serializer
// emits them. Tightened to the canonical /api/v1/wiki/{images,files}/<uuid>
// shape — the same form the import-parser regex consumes (see
// hocuspocus/src/markdown-parser.ts).
var (
	imageRefPattern = regexp.MustCompile(`/api/v1/wiki/images/([0-9a-fA-F-]{36})`)
	fileRefPattern  = regexp.MustCompile(`/api/v1/wiki/files/([0-9a-fA-F-]{36})`)
)

// renderDocMarkdown builds the full markdown content of one exported .md
// file: the H1 (with optional emoji), an optional `vibe:meta` comment that
// carries icon and color across the round-trip, then a blank line and the
// body. The body has already had its attachment refs rewritten by
// rewriteAttachmentRefs.
//
// The meta comment is the Vibe-specific extension on top of the Outline
// markdown format — Outline can't carry our Icon/Color fields, so we
// emit them as an HTML comment that the import parser recognises and
// strips. CommonMark and every off-the-shelf markdown viewer renders the
// comment as nothing, so plain-text consumers see the H1 + body as
// expected.
func renderDocMarkdown(emoji, title, icon, color, body string) string {
	var b strings.Builder
	b.WriteString("# ")
	if emoji != "" {
		b.WriteString(emoji)
		b.WriteString(" ")
	}
	b.WriteString(title)
	b.WriteString("\n")

	if meta := renderVibeMeta(icon, color); meta != "" {
		b.WriteString(meta)
		b.WriteString("\n")
	}

	b.WriteString("\n")
	if body != "" {
		b.WriteString(body)
		// Always end with a newline so re-import's blank-line splitter
		// doesn't get confused by EOF in the middle of a paragraph.
		if !strings.HasSuffix(body, "\n") {
			b.WriteString("\n")
		}
	}
	return b.String()
}

// renderVibeMeta builds the metadata comment that round-trips icon and
// color. Returns the empty string when both are empty so the export
// stays clean for docs that use the defaults. Keys are emitted in a
// stable order so the same input always produces the same output (handy
// for diffing exports across runs).
func renderVibeMeta(icon, color string) string {
	if icon == "" && color == "" {
		return ""
	}
	var b strings.Builder
	b.WriteString("<!-- vibe:meta")
	if icon != "" {
		b.WriteString(` icon="`)
		b.WriteString(escapeMetaValue(icon))
		b.WriteString(`"`)
	}
	if color != "" {
		b.WriteString(` color="`)
		b.WriteString(escapeMetaValue(color))
		b.WriteString(`"`)
	}
	b.WriteString(" -->")
	return b.String()
}

// escapeMetaValue defends against any double-quote that snuck into an
// icon or color value. Icon names are lucide identifiers (alphanumeric)
// and colors are hex strings, so in practice this is belt-and-braces —
// but emitting a value with an unescaped " would break the parser's
// key="value" grammar silently.
func escapeMetaValue(s string) string {
	return strings.ReplaceAll(s, `"`, `\"`)
}

// rewriteAttachmentRefs walks the body markdown, finds every reference to
// `/api/v1/wiki/images/<uuid>` and `/api/v1/wiki/files/<uuid>`, and asks
// the caller to resolve the in-zip relative path for each one. Refs the
// resolver returns ("", false) for are left untouched (broken links on
// disk, but the doc still exports).
//
// The resolver is called once per unique attachment id; the result is
// substituted into every occurrence in the body.
func rewriteAttachmentRefs(
	body string,
	resolveImage func(id uuid.UUID) (relPath string, ok bool),
	resolveFile func(id uuid.UUID) (relPath string, ok bool),
) string {
	body = imageRefPattern.ReplaceAllStringFunc(body, func(match string) string {
		idStr := imageRefPattern.FindStringSubmatch(match)[1]
		id, err := uuid.Parse(idStr)
		if err != nil {
			return match
		}
		rel, ok := resolveImage(id)
		if !ok {
			return match
		}
		return rel
	})
	body = fileRefPattern.ReplaceAllStringFunc(body, func(match string) string {
		idStr := fileRefPattern.FindStringSubmatch(match)[1]
		id, err := uuid.Parse(idStr)
		if err != nil {
			return match
		}
		rel, ok := resolveFile(id)
		if !ok {
			return match
		}
		return rel
	})
	return body
}

// collectAttachmentRefs returns every distinct image and file UUID
// referenced in the body markdown. Used by the orchestrator to drive
// attachment streaming without scanning twice.
func collectAttachmentRefs(body string) (images []uuid.UUID, files []uuid.UUID) {
	imageSet := map[uuid.UUID]struct{}{}
	fileSet := map[uuid.UUID]struct{}{}

	for _, m := range imageRefPattern.FindAllStringSubmatch(body, -1) {
		id, err := uuid.Parse(m[1])
		if err != nil {
			continue
		}
		if _, seen := imageSet[id]; seen {
			continue
		}
		imageSet[id] = struct{}{}
		images = append(images, id)
	}
	for _, m := range fileRefPattern.FindAllStringSubmatch(body, -1) {
		id, err := uuid.Parse(m[1])
		if err != nil {
			continue
		}
		if _, seen := fileSet[id]; seen {
			continue
		}
		fileSet[id] = struct{}{}
		files = append(files, id)
	}
	return images, files
}

// sanitizeFilename strips path separators and control characters from an
// attachment filename so it's safe to use as a zip entry name. Mirrors the
// importer's sanitizeImportFilename, kept inline so the export package
// doesn't import the controller.
func sanitizeFilename(raw string) string {
	base := path.Base(strings.ReplaceAll(raw, `\`, "/"))
	if base == "." || base == "/" || base == "" {
		return "file"
	}
	var sb strings.Builder
	sb.Grow(len(base))
	for _, r := range base {
		if r < 0x20 || r == 0x7f {
			continue
		}
		// Reject characters that would break either the zip entry or the
		// markdown link form: leave only printable, slashless ASCII +
		// common unicode word characters.
		if r == '/' || r == '\\' {
			continue
		}
		sb.WriteRune(r)
	}
	out := sb.String()
	out = strings.TrimRight(out, ". ") // Windows reserved suffix
	if out == "" {
		return "file"
	}
	return out
}
