package models

import (
	"fmt"
	"io"
	"strings"
)

// WikiDocumentKind is what a wiki page's body actually is.
//
// A page is a Y.js room, not a document of one fixed shape. Prose pages put a
// ProseMirror tree in the room's "default" XmlFragment; drawing pages put an
// Excalidraw scene in its "excalidraw" Map. Both persist, back up and transfer
// through the same bytes — but almost every *reader* of a body assumes prose,
// so the kind has to travel with the document and be checked before anything
// writes markdown into it.
//
// The zero value is the empty string and means WikiDocumentKindDocument: every
// row written before this field existed is prose, so no migration is needed.
// Use Or() rather than comparing against the constant directly.
type WikiDocumentKind string

const (
	// WikiDocumentKindDocument is a prose page: Tiptap over the "default"
	// XmlFragment, projected to Markdown for search, export and the MCP tools.
	WikiDocumentKindDocument WikiDocumentKind = "document"
	// WikiDocumentKindDrawing is an Excalidraw scene. It has no Markdown body,
	// so every markdown write path must refuse it and every markdown read path
	// must say what it is instead of returning an empty string.
	WikiDocumentKindDrawing WikiDocumentKind = "drawing"
)

// Or resolves the zero value to the default kind. Legacy rows carry no `kind`
// field at all, and a page with no kind is prose.
func (k WikiDocumentKind) Or() WikiDocumentKind {
	if k == "" {
		return WikiDocumentKindDocument
	}
	return k
}

// IsDrawing reports whether this page's body is a drawing scene.
func (k WikiDocumentKind) IsDrawing() bool { return k.Or() == WikiDocumentKindDrawing }

// Valid reports whether the kind is one this build knows how to render.
func (k WikiDocumentKind) Valid() bool {
	switch k.Or() {
	case WikiDocumentKindDocument, WikiDocumentKindDrawing:
		return true
	default:
		return false
	}
}

// MarshalGQL writes the kind as an uppercase quoted string for GraphQL. The
// zero value marshals as DOCUMENT so the non-null schema field is satisfied by
// rows that predate this field.
func (k WikiDocumentKind) MarshalGQL(w io.Writer) {
	fmt.Fprintf(w, "%q", strings.ToUpper(string(k.Or())))
}

// UnmarshalGQL reads the kind from a GraphQL uppercase string.
func (k *WikiDocumentKind) UnmarshalGQL(v interface{}) error {
	str, ok := v.(string)
	if !ok {
		return fmt.Errorf("WikiDocumentKind must be a string")
	}
	parsed := WikiDocumentKind(strings.ToLower(str))
	if !parsed.Valid() {
		return fmt.Errorf("invalid WikiDocumentKind: %s", str)
	}
	*k = parsed.Or()
	return nil
}
