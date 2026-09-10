package mcp

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// What an attachment is, for the purpose of reading it.
//
// Content type is the weaker signal here, not the stronger one. IngestFile
// prefers the type the client declared and only sniffs when it is empty, so
// real attachments in this platform arrive as application/octet-stream —
// several .vsdx diagrams do exactly that. The extension is consulted first for
// the kinds it names unambiguously, and the content type fills in the rest.

type attachmentKindName string

const (
	attachmentText        attachmentKindName = "text"
	attachmentCSV         attachmentKindName = "csv"
	attachmentMarkdown    attachmentKindName = "markdown"
	attachmentJSON        attachmentKindName = "json"
	attachmentOffice      attachmentKindName = "office"
	attachmentImage       attachmentKindName = "image"
	attachmentUnsupported attachmentKindName = "unsupported"
)

// extensionByKind maps the extensions worth trusting outright.
var extensionByKind = map[string]attachmentKindName{
	"txt": attachmentText, "log": attachmentText, "conf": attachmentText,
	"cfg": attachmentText, "ini": attachmentText, "yaml": attachmentText,
	"yml": attachmentText, "xml": attachmentText, "sql": attachmentText,
	"sh": attachmentText, "ps1": attachmentText, "py": attachmentText,

	"csv": attachmentCSV, "tsv": attachmentCSV,
	"md": attachmentMarkdown, "markdown": attachmentMarkdown,
	"json": attachmentJSON,

	"docx": attachmentOffice, "xlsx": attachmentOffice,

	"png": attachmentImage, "jpg": attachmentImage, "jpeg": attachmentImage,
	"gif": attachmentImage, "webp": attachmentImage,
}

const (
	docxContentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	xlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)

// attachmentKind decides how a file should be read.
func attachmentKind(filename, contentType string) attachmentKindName {
	if kind, ok := extensionByKind[strings.ToLower(extensionOf(filename))]; ok {
		return kind
	}

	base := strings.ToLower(strings.TrimSpace(contentType))
	if i := strings.IndexByte(base, ';'); i >= 0 {
		base = strings.TrimSpace(base[:i])
	}

	switch {
	case base == docxContentType, base == xlsxContentType:
		return attachmentOffice
	case base == "text/csv", base == "application/csv", base == "text/tab-separated-values":
		return attachmentCSV
	case base == "text/markdown", base == "text/x-markdown":
		return attachmentMarkdown
	case base == "application/json":
		return attachmentJSON
	// SVG is excluded on purpose: it is a scriptable document rather than a
	// raster, and the file controller keeps it out of inline rendering for the
	// same reason.
	case base == "image/svg+xml":
		return attachmentUnsupported
	case strings.HasPrefix(base, "image/"):
		return attachmentImage
	case strings.HasPrefix(base, "text/"):
		return attachmentText
	default:
		return attachmentUnsupported
	}
}

// extensionOf returns the final extension without the dot, or "".
func extensionOf(filename string) string {
	i := strings.LastIndexByte(filename, '.')
	if i < 0 || i == len(filename)-1 {
		return ""
	}
	return filename[i+1:]
}

// parseUUIDArg keeps id validation messages consistent across tools.
func parseUUIDArg(value, field string) (uuid.UUID, error) {
	id, err := uuid.Parse(value)
	if err != nil {
		return uuid.Nil, fmt.Errorf("%s %q is not a valid id", field, value)
	}
	return id, nil
}
