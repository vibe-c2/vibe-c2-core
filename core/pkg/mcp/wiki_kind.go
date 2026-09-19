package mcp

import "github.com/vibe-c2/vibe-c2-core/core/pkg/models"

// Kind gating for the wiki tools.
//
// Every Markdown write funnels into the sidecar's apply-markdown route, which
// parses the body into a ProseMirror tree and writes it to the Y.js room's
// "default" fragment. A drawing page's body is an Excalidraw scene living in a
// different root key of that same room, so such a write does not fail — it
// quietly grows a prose document alongside the scene, and the next projection
// overwrites the page's indexed content with it. Nothing surfaces an error and
// the operator's canvas still looks right until the room is next re-hydrated.
//
// That is why these guards sit in front of the tools rather than inside the
// sidecar: by the time the bytes reach the room there is no longer anything
// distinguishing "an agent meant to write prose here" from a legitimate edit.

// requireProse refuses a page whose body is not Markdown.
//
// The refusal names the kind and points at the tool that does work, because an
// agent that gets a bare "not allowed" will usually retry the same call.
func requireProse(doc *models.WikiDocument, action string) error {
	if !doc.Kind.IsDrawing() {
		return nil
	}
	return refuse(
		"%q is a drawing, so it has no Markdown body to %s. "+
			"Use edit_wiki_drawing to change its contents, or get_wiki_drawing to read it.",
		doc.Title, action)
}

// requireDrawing refuses a page whose body is not a drawing. The mirror of
// requireProse, for the drawing tools.
func requireDrawing(doc *models.WikiDocument, action string) error {
	if doc.Kind.IsDrawing() {
		return nil
	}
	return refuse(
		"%q is a Markdown page, not a drawing, so there is no scene to %s. "+
			"Use edit_wiki_document to change its text, or get_wiki_document to read it.",
		doc.Title, action)
}
