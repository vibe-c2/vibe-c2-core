package mcp

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/controller"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
)

// ImageIngestor puts image bytes on a wiki page as an inline image, through
// the same path the editor's paste and drop use: same size cap, same
// decoding and re-encoding, same dimension capture.
type ImageIngestor interface {
	IngestImage(
		ctx context.Context,
		doc *models.WikiDocument,
		uploaderID uuid.UUID,
		body io.Reader,
	) (*models.WikiImage, *wiki.IngestError)
}

type attachFileArgs struct {
	IdempotencyKey
	DocumentID    string `json:"document_id"        jsonschema:"Page id."`
	Filename      string `json:"filename"           jsonschema:"With an extension: screenshot.png, capture.pcap, report.pdf."`
	ContentBase64 string `json:"content_base64"     jsonschema:"The file's bytes, base64. A data: URL prefix is accepted."`
	As            string `json:"as,omitempty"       jsonschema:"image to show it inline on the page (PNG, JPEG, GIF, WebP); attachment (default) for a downloadable file card."`
	Place         string `json:"place,omitempty"    jsonschema:"Where the file appears on the page: end (default) adds it at the bottom, start at the top, none stores it and returns the markdown line for you to place with edit_wiki_document."`
}

// inlineImageView is what placing an inline image returns: the id, its
// pixel size, and the line to paste.
type inlineImageView struct {
	ID       string `json:"id"`
	URL      string `json:"url"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
	Bytes    int64  `json:"sizeBytes"`
	Markdown string `json:"markdown"`
	// Placed says whether this call put the image on the page. An image no
	// page references is garbage-collected after a grace period, so a false
	// here is a deadline, not a detail.
	Placed bool `json:"placed"`
}

// placementView rides alongside the file or image view to say where the
// line landed, and who saw it.
type placementView struct {
	Placement string `json:"placement,omitempty"`
	Watchers  int    `json:"watchers,omitempty"`
	Note      string `json:"note,omitempty"`
}

// placementMode maps the place argument to a write mode. ok is false for an
// unknown value; place is false for "none".
func placementMode(place string) (mode wiki.ApplyMode, doPlace bool, ok bool) {
	switch strings.ToLower(strings.TrimSpace(place)) {
	case "", "end":
		return wiki.ApplyAppend, true, true
	case "start":
		return wiki.ApplyPrepend, true, true
	case "none":
		return "", false, true
	}
	return "", false, false
}

// The empty-payload check is generous with whitespace and data: URL wrappers
// because an agent that has just taken a screenshot hands over whatever its
// tooling produced, and a refusal over a prefix costs a round trip.
var dataURLPrefix = regexp.MustCompile(`^data:[^;,]*(;[^;,]*)*;base64,`)

// decodeBase64Payload turns the tool's content argument into bytes. It strips
// a data: URL prefix and whitespace, and accepts both standard and URL-safe
// alphabets with or without padding.
func decodeBase64Payload(raw string) ([]byte, error) {
	s := strings.TrimSpace(raw)
	s = dataURLPrefix.ReplaceAllString(s, "")
	s = strings.Map(func(r rune) rune {
		if r == '\n' || r == '\r' || r == ' ' || r == '\t' {
			return -1
		}
		return r
	}, s)
	if s == "" {
		return nil, fmt.Errorf("empty")
	}
	s = strings.TrimRight(s, "=")
	if strings.ContainsAny(s, "-_") {
		return base64.RawURLEncoding.DecodeString(s)
	}
	return base64.RawStdEncoding.DecodeString(s)
}

// handleAttachFileToWikiDocument attaches arbitrary bytes to a page, or places
// an image inline. The text tool covers command output; this one exists for
// what an agent produces as bytes: a screenshot of a login page, a packet
// capture, a binary it pulled from a host.
//
// Base64 in a JSON argument costs a third more on the wire and a full copy in
// memory on each side; the multipart endpoint in upload.go takes the same
// bytes raw and runs this same code. This tool stays for clients that can
// only speak MCP.
func handleAttachFileToWikiDocument(ctx context.Context, s *Server, args attachFileArgs) (toolResult, error) {
	raw, err := decodeBase64Payload(args.ContentBase64)
	if err != nil {
		return toolResult{}, refuse(
			"content_base64 is not valid base64 (%s). Send the file's bytes base64-encoded, whole, in one call, "+
				"or POST them raw as multipart to /api/v1/mcp/upload.", err)
	}
	return attachBytes(ctx, s, attachBytesArgs{
		DocumentID: args.DocumentID,
		Filename:   args.Filename,
		As:         args.As,
		Place:      args.Place,
		Raw:        raw,
	})
}

// attachBytesArgs is what the tool and the upload endpoint have in common
// once the bytes are in hand.
type attachBytesArgs struct {
	DocumentID string
	Filename   string
	As         string
	Place      string
	Raw        []byte
}

// attachBytes is the shared body of the base64 tool and the multipart
// endpoint: authorisation, placement choice, ingest, and the line to paste.
func attachBytes(ctx context.Context, s *Server, args attachBytesArgs) (toolResult, error) {
	if s.deps.Files == nil {
		return toolResult{}, fmt.Errorf("attachments are unavailable: file storage is not configured")
	}

	as := strings.ToLower(strings.TrimSpace(args.As))
	switch as {
	case "", "attachment", "image":
	default:
		return toolResult{}, refuse("as must be attachment or image, not %q.", args.As)
	}
	mode, doPlace, ok := placementMode(args.Place)
	if !ok {
		return toolResult{}, refuse("place must be end, start or none, not %q.", args.Place)
	}

	doc, err := s.loadWikiDocument(ctx, args.DocumentID, models.OperationRoleOperator)
	if err != nil {
		return toolResult{}, err
	}
	if doc.DeletedAt != nil {
		return toolResult{}, refuse("%q is in the trash; restore it before attaching to it.", doc.Title)
	}

	filename := controller.SanitizeUploadFilename(args.Filename)
	if filename == "" {
		return toolResult{}, refuse(
			"filename is required, with an extension that says what the bytes are: screenshot.png, capture.pcap.")
	}
	if len(args.Raw) == 0 {
		return toolResult{}, refuse("the file is empty; there is nothing to attach.")
	}

	owner, err := agentOwnerID(ctx)
	if err != nil {
		return toolResult{}, err
	}

	if as == "image" {
		return s.placeInlineImage(ctx, doc, owner, filename, args.Raw, mode, doPlace)
	}

	file, ingestErr := s.deps.Files.IngestFile(ctx, doc, owner, bytes.NewReader(args.Raw), filename, "")
	if ingestErr != nil {
		return toolResult{}, refuse("could not attach %q: %s", filename, ingestErr.Message)
	}
	view := newAttachmentView(file.FileID.String(), file.Filename, file.ContentType, file.SizeBytes, false)
	if !doPlace {
		return toolResult{
			Payload:     view,
			OperationID: &doc.OperationID,
			Summary: fmt.Sprintf("attached %s to %s; not on the page yet: paste `markdown` alone on its own line",
				file.Filename, doc.Title),
		}, nil
	}
	placement, err := s.placeLine(ctx, doc, view.Markdown, mode)
	if err != nil {
		return toolResult{}, err
	}
	view.Placed = true
	return toolResult{
		Payload: struct {
			attachmentView
			placementView
		}{view, placement},
		OperationID: &doc.OperationID,
		Summary:     fmt.Sprintf("attached %s to %s and placed it at the %s", file.Filename, doc.Title, placement.Placement),
	}, nil
}

// placeLine writes the card or image line onto the page at the requested end.
//
// Placing is the default rather than an option the agent remembers, because
// the failure was observed: images uploaded and never referenced, which the
// sweeper then deletes. A refusal here still leaves the file stored, so the
// message carries the line for the agent to place by hand.
func (s *Server) placeLine(ctx context.Context, doc *models.WikiDocument, markdown string, mode wiki.ApplyMode) (placementView, error) {
	written, err := s.writeBody(ctx, doc, markdown, mode)
	if err != nil {
		return placementView{}, refuse(
			"the file is stored but could not be placed on %q (%s). Place it yourself with add_wiki_section or edit_wiki_document, alone on its own line: %s",
			doc.Title, err.Error(), markdown)
	}
	where := "end of the page"
	if mode == wiki.ApplyPrepend {
		where = "start of the page"
	}
	view := placementView{Placement: where, Watchers: written.Watchers}
	if written.Watchers > 0 {
		view.Note = "The operator has this page open and saw it appear."
	}
	return view, nil
}

// placeInlineImage stores the bytes as a wiki image and returns the markdown
// image line that the page renders as a picture. The line stands alone in
// its own paragraph, like the attachment card line; the size hint after the
// path is what keeps the layout stable while the image loads.
func (s *Server) placeInlineImage(ctx context.Context, doc *models.WikiDocument, owner uuid.UUID, filename string, raw []byte, mode wiki.ApplyMode, doPlace bool) (toolResult, error) {
	if s.deps.Images == nil {
		return toolResult{}, fmt.Errorf("inline images are unavailable: image storage is not configured")
	}
	img, ingestErr := s.deps.Images.IngestImage(ctx, doc, owner, bytes.NewReader(raw))
	if ingestErr != nil {
		return toolResult{}, refuse(
			"could not place %q as an image: %s. For a non-image file use as:\"attachment\".",
			filename, ingestErr.Message)
	}
	url := "/api/v1/wiki/images/" + img.ImageID.String()
	view := inlineImageView{
		ID:       img.ImageID.String(),
		URL:      url,
		Width:    img.Width,
		Height:   img.Height,
		Bytes:    img.SizeBytes,
		Markdown: inlineImageMarkdown(filename, url, img.Width, img.Height),
	}
	if !doPlace {
		return toolResult{
			Payload:     view,
			OperationID: &doc.OperationID,
			Summary: fmt.Sprintf("stored %s as an image for %s; not on the page yet: paste `markdown` alone on its own line, or it is garbage-collected",
				filename, doc.Title),
		}, nil
	}
	placement, err := s.placeLine(ctx, doc, view.Markdown, mode)
	if err != nil {
		return toolResult{}, err
	}
	view.Placed = true
	return toolResult{
		Payload: struct {
			inlineImageView
			placementView
		}{view, placement},
		OperationID: &doc.OperationID,
		Summary:     fmt.Sprintf("placed %s as an image at the %s of %s", filename, placement.Placement, doc.Title),
	}, nil
}

// inlineImageMarkdown is the line the Hocuspocus parser lifts into an image
// block: `![alt](url " =WxH")`, the Outline size-hint form the serializer
// writes back. Brackets and parentheses are escaped so the line survives.
func inlineImageMarkdown(alt, url string, width, height int) string {
	alt = strings.NewReplacer("[", "\\[", "]", "\\]").Replace(alt)
	if width > 0 && height > 0 {
		return fmt.Sprintf("![%s](%s \" =%dx%d\")", alt, url, width, height)
	}
	return fmt.Sprintf("![%s](%s)", alt, url)
}
