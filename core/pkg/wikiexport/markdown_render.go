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
// file: the H1 (with optional emoji) followed by a blank line and the
// body. The body has already had its attachment refs rewritten by
// rewriteAttachmentRefs.
func renderDocMarkdown(emoji, title, body string) string {
	var b strings.Builder
	b.WriteString("# ")
	if emoji != "" {
		b.WriteString(emoji)
		b.WriteString(" ")
	}
	b.WriteString(title)
	b.WriteString("\n\n")
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
