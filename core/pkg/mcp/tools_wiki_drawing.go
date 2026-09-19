package mcp

import (
	"context"
	"errors"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
	"go.uber.org/zap"
)

// The drawing half of the wiki tool surface.
//
// Two tools, not eight. Every tool definition is paid for on every turn (see
// the note on add_wiki_section), so the read collapses its variants into a
// `view` argument and the write collapses add/update/delete/replace into a
// `mode` — the same shape the Markdown tools settled on, for the same reason.
//
// Both go through the sidecar's live room rather than the database, which is
// what lets an agent work on a diagram while the operator has it open: the
// edit merges as a Y.js transaction and appears on their canvas as it lands.
// `watchers` says whether anybody was in fact looking.

type getWikiDrawingArgs struct {
	DocumentID string `json:"document_id" jsonschema:"Page id of a drawing."`
	View       string `json:"view,omitempty" jsonschema:"outline (default) for one line per shape — ids, kinds, labels and positions, which is what you need to edit; full for the complete element JSON."`
}

type editWikiDrawingArgs struct {
	IdempotencyKey
	DocumentID string `json:"document_id"           jsonschema:"Page id of a drawing."`
	Mode       string `json:"mode,omitempty"        jsonschema:"add (default) to draw new shapes; update to change existing ones by id; delete to erase them; replace to swap the whole scene."`
	// Elements is Excalidraw's own element shape. Every field but `type` is
	// optional — the server fills in the bookkeeping (seed, nonce, group ids)
	// that nobody composing a diagram should have to supply.
	Elements   []map[string]any `json:"elements,omitempty"    jsonschema:"Excalidraw elements. Only 'type' is required per element (rectangle, ellipse, diamond, text, arrow, line, freedraw, image, frame); x, y, width, height, strokeColor and the rest are optional and defaulted. Put words on a shape with 'label' — the shape is sized to fit it unless you set width. Layer with 'z': higher covers lower, 0 is where hand-drawn shapes sit, so z:-1 puts arrows under the boxes. Connect an arrow with 'startBinding'/'endBinding' set to a shape id, or it will not follow that shape when it moves. Not used with mode:delete."`
	ElementIDs []string         `json:"element_ids,omitempty" jsonschema:"Ids to erase, from get_wiki_drawing. Only for mode:delete."`
}

func registerWikiDrawingTools(s *Server) {
	register(s, &mcp.Tool{
		Name: "get_wiki_drawing",
		Description: "Read a drawing page's canvas: every shape with its id, position and label. " +
			"Use it before editing one, because edits address shapes by the ids this returns. " +
			"A canvas over 120 shapes comes back summarised, with its labels; pass " +
			"view:\"full\" for the complete element JSON.",
	}, readTool, handleGetWikiDrawing)

	register(s, &mcp.Tool{
		Name: "edit_wiki_drawing",
		Description: "Draw on a drawing page. Adds shapes by default; mode:update changes ones " +
			"that exist, mode:delete erases them, mode:replace swaps the whole canvas. Safe " +
			"while the operator is drawing — edits merge and appear on their screen.",
	}, writeTool, handleEditWikiDrawing)
}

// drawingElementView is one shape, flattened to what an agent needs in order
// to describe or edit it.
//
// The full element carries about twenty-five fields of rendering bookkeeping.
// Returning all of them for every shape turns a thirty-box diagram into tens
// of kilobytes per read, most of it seeds and nonces that mean nothing to the
// reader — so the default read is this, and `view:"full"` is there for the
// cases that genuinely need the rest.
type drawingElementView struct {
	ID     string  `json:"id"`
	Type   string  `json:"type"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width,omitempty"`
	Height float64 `json:"height,omitempty"`
	// Points is where a line actually goes, for arrows and lines. Carried in
	// the default view because without it two arrows drawn on top of each
	// other are indistinguishable from two arrows side by side: the ids
	// differ, the geometry does not, and the canvas shows one stroke.
	Points []any `json:"points,omitempty"`
	// Bindings name the shapes an arrow is attached to. An arrow can be bound
	// correctly and still drawn in the wrong place, so both matter.
	StartBinding string `json:"startBinding,omitempty"`
	EndBinding   string `json:"endBinding,omitempty"`
	// Text is the shape's words, for a text element. It is the single most
	// useful field for working out what a diagram says.
	Text string `json:"text,omitempty"`
	// Z is the element's layer. Reported so the order of the list is
	// explainable: the elements come back back-to-front, and this says why.
	Z float64 `json:"z,omitempty"`
	// ContainerID is set on a label bound to a shape, which is how Excalidraw
	// models "a box with writing in it" — without it an agent cannot tell a
	// caption apart from a free-floating note.
	ContainerID string `json:"containerId,omitempty"`
}

type drawingSceneView struct {
	wikiDocView
	// Elements come back in paint order: back first, front last.
	Elements []drawingElementView `json:"elements,omitempty"`
	// Full is populated only for view:"full".
	Full []map[string]any `json:"fullElements,omitempty"`
	// Shapes counts the scene by element type, and is what a large drawing
	// returns instead of listing every shape.
	Shapes map[string]int `json:"shapes,omitempty"`
	// Labels is every piece of text on a large canvas. A diagram is navigated
	// by its words, so these are what survive when the shapes are summarised.
	Labels   []drawingElementView `json:"labels,omitempty"`
	Count    int                  `json:"elementCount"`
	Watchers int                  `json:"watchers,omitempty"`
	Notes    []string             `json:"notes,omitempty"`
}

// summaryAboveElements is where a plain read stops listing every shape.
//
// The Markdown side has had this since it existed: a page over 8 KB answers a
// default read with its outline, because the alternative is spending an
// agent's context on a body it did not ask for. A canvas needs the same
// backstop and did not have one — a few hundred shapes is an ordinary diagram
// and an extraordinary response.
//
// The summary keeps every label, because the words are how a diagram is
// navigated, and counts the rest by type. An agent that needs a specific
// shape's id asks for view:"full".
const summaryAboveElements = 120

func handleGetWikiDrawing(ctx context.Context, s *Server, args getWikiDrawingArgs) (toolResult, error) {
	doc, err := s.loadWikiDocument(ctx, args.DocumentID, models.OperationRoleViewer)
	if err != nil {
		return toolResult{}, err
	}
	if err := requireDrawing(doc, "read"); err != nil {
		return toolResult{}, err
	}
	if s.deps.Hocuspocus == nil {
		return toolResult{}, fmt.Errorf("reading drawings is unavailable: the collaboration service is not configured")
	}

	scene, err := s.deps.Hocuspocus.ReadDrawing(ctx, doc.DocumentID.String())
	if err != nil {
		s.deps.Logger.Warn("mcp: failed to read wiki drawing",
			zap.String("document_id", doc.DocumentID.String()), zap.Error(err))
		return toolResult{}, fmt.Errorf("failed to read the drawing: %w", err)
	}

	view := drawingSceneView{
		wikiDocView: toWikiDocView(doc),
		Count:       len(scene.Elements),
		Watchers:    scene.Watchers,
	}
	switch {
	case args.View == "full":
		view.Full = make([]map[string]any, 0, len(scene.Elements))
		for _, el := range scene.Elements {
			view.Full = append(view.Full, el)
		}

	case len(scene.Elements) > summaryAboveElements:
		view.Shapes = map[string]int{}
		for _, el := range scene.Elements {
			kind := stringField(el, "type")
			view.Shapes[kind]++
			if kind == "text" {
				view.Labels = append(view.Labels, summariseElement(el))
			}
		}
		view.Notes = append(view.Notes, fmt.Sprintf(
			"This canvas has %d shapes, so it is summarised rather than listed. "+
				"Every label is above; ask for view:\"full\" if you need a particular "+
				"shape's id or geometry.", len(scene.Elements)))

	default:
		view.Elements = make([]drawingElementView, 0, len(scene.Elements))
		for _, el := range scene.Elements {
			view.Elements = append(view.Elements, summariseElement(el))
		}
	}
	if len(scene.Elements) == 0 {
		view.Notes = append(view.Notes, "This canvas is empty.")
	}

	return toolResult{
		Payload:     view,
		OperationID: &doc.OperationID,
		Summary:     fmt.Sprintf("read wiki drawing %s", doc.Title),
	}, nil
}

func summariseElement(el wiki.DrawingElement) drawingElementView {
	return drawingElementView{
		ID:          stringField(el, "id"),
		Type:        stringField(el, "type"),
		X:           floatField(el, "x"),
		Y:           floatField(el, "y"),
		Width:       floatField(el, "width"),
		Height:      floatField(el, "height"),
		Text:        stringField(el, "text"),
		Z:           floatField(el, "z"),
		ContainerID: stringField(el, "containerId"),

		Points:       sliceField(el, "points"),
		StartBinding: bindingTarget(el, "startBinding"),
		EndBinding:   bindingTarget(el, "endBinding"),
	}
}

func sliceField(el wiki.DrawingElement, key string) []any {
	if v, ok := el[key].([]any); ok {
		return v
	}
	return nil
}

// bindingTarget pulls the bound shape's id out of Excalidraw's binding object,
// which also carries focus and gap — geometry the server maintains and nobody
// composing a diagram needs to see.
func bindingTarget(el wiki.DrawingElement, key string) string {
	binding, ok := el[key].(map[string]any)
	if !ok {
		return ""
	}
	id, _ := binding["elementId"].(string)
	return id
}

func stringField(el wiki.DrawingElement, key string) string {
	if v, ok := el[key].(string); ok {
		return v
	}
	return ""
}

func floatField(el wiki.DrawingElement, key string) float64 {
	if v, ok := el[key].(float64); ok {
		return v
	}
	return 0
}

type drawingWriteView struct {
	wikiDocView
	Mode     string   `json:"mode"`
	Applied  int      `json:"applied"`
	Watchers int      `json:"watchers,omitempty"`
	Notes    []string `json:"notes,omitempty"`
}

func handleEditWikiDrawing(ctx context.Context, s *Server, args editWikiDrawingArgs) (toolResult, error) {
	doc, err := s.loadWikiDocument(ctx, args.DocumentID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}
	if err := requireDrawing(doc, "draw on"); err != nil {
		return toolResult{}, err
	}
	if s.deps.Hocuspocus == nil {
		return toolResult{}, fmt.Errorf("drawing is unavailable: the collaboration service is not configured")
	}

	mode := wiki.DrawingMode(args.Mode)
	if args.Mode == "" {
		mode = wiki.DrawingAdd
	}
	switch mode {
	case wiki.DrawingAdd, wiki.DrawingUpdate, wiki.DrawingDelete, wiki.DrawingReplace:
	default:
		return toolResult{}, refuse(
			"unknown mode %q. Use add, update, delete or replace.", args.Mode)
	}

	if mode == wiki.DrawingDelete && len(args.ElementIDs) == 0 {
		return toolResult{}, refuse(
			"mode:delete needs element_ids — the ids of the shapes to erase, as get_wiki_drawing reports them.")
	}
	if mode != wiki.DrawingDelete && len(args.Elements) == 0 {
		return toolResult{}, refuse(
			"elements is required: each one needs at least a type (rectangle, ellipse, diamond, " +
				"text, arrow, line, freedraw, image or frame). Everything else is optional.")
	}

	elements := make([]wiki.DrawingElement, 0, len(args.Elements))
	for _, el := range args.Elements {
		elements = append(elements, wiki.DrawingElement(el))
	}

	// Attributed to the key's owner, not to the key: a page records which
	// person last changed it, and an agent acts for one.
	result, err := s.deps.Hocuspocus.ApplyDrawing(
		ctx, doc.DocumentID.String(), mode, elements, args.ElementIDs, viewerID(ctx))
	if errors.Is(err, wiki.ErrDrawingElementsInvalid) {
		// A refusal, not a fault: the request was understood and wrong, and
		// the sidecar's message names the offending element.
		return toolResult{}, refuse("%s", err.Error())
	}
	if err != nil {
		s.deps.Logger.Warn("mcp: failed to apply wiki drawing edit",
			zap.String("document_id", doc.DocumentID.String()),
			zap.String("mode", string(mode)), zap.Error(err))
		return toolResult{}, fmt.Errorf("failed to save the drawing: %w", err)
	}

	view := drawingWriteView{
		wikiDocView: toWikiDocView(doc),
		Mode:        string(mode),
		Applied:     result.Applied,
		Watchers:    result.Watchers,
	}
	if result.Warning != "" {
		view.Notes = append(view.Notes, result.Warning)
	}
	if result.Watchers > 0 {
		view.Notes = append(view.Notes,
			"The operator has this drawing open and saw your edit appear.")
	}
	// An update or delete that matched nothing is the one outcome that looks
	// like success and is not: the usual cause is ids from a read taken before
	// somebody else changed the canvas.
	if result.Applied == 0 && (mode == wiki.DrawingUpdate || mode == wiki.DrawingDelete) {
		view.Notes = append(view.Notes,
			"No shape on the canvas matched those ids, so nothing changed. "+
				"Read the drawing again — it may have been edited since.")
	}

	return toolResult{
		Payload:     view,
		OperationID: &doc.OperationID,
		Summary:     fmt.Sprintf("edited wiki drawing %s", doc.Title),
	}, nil
}
