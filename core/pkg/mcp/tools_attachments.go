package mcp

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/controller"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
)

// Wiki attachments.
//
// An operator can already read these: the SPA fetches the bytes and renders
// docx, xlsx, CSV, text, markdown and images inline. Until now an agent
// working on the same page could not see any of it — it could rewrite the
// notes but not read the evidence they were about.
//
// Three paths, chosen by what the file actually is:
//
//   - Already text (txt, csv, md, json, log, …) — read straight through. No
//     conversion, no round trip.
//   - Office documents (docx, xlsx) — converted by the Hocuspocus sidecar,
//     which already has the converters the browser preview uses.
//   - Rasters — returned as MCP ImageContent so a model with vision can
//     actually look at the screenshot or diagram, rather than being handed
//     base64 it cannot act on.
//
// PDF is deliberately absent: nothing in this platform extracts PDF text
// today (the browser renders it natively), so supporting it means adopting a
// parser rather than reusing one. That is a decision to take on its own.

const (
	// maxAttachmentBytes bounds what is pulled out of blob storage. Larger
	// than the office limit because a spreadsheet compresses hard; smaller
	// than the platform's own 50 MB upload cap, because nothing beyond this is
	// usefully readable by a model anyway.
	maxAttachmentBytes = 25 * 1024 * 1024

	// maxAttachmentTextBytes bounds what is handed back. The response budget
	// trims further; this stops a 20 MB log becoming a 20 MB string first.
	maxAttachmentTextBytes = 200 * 1024

	// maxInlineImageBytes bounds an image returned as ImageContent. Images are
	// sent base64, so the wire cost is a third larger again, and a model gets
	// nothing extra from a 10 MB screenshot.
	maxInlineImageBytes = 4 * 1024 * 1024
)

type listWikiAttachmentsArgs struct {
	DocumentID string `json:"document_id" jsonschema:"Page id."`
}

type readWikiAttachmentArgs struct {
	AttachmentID string `json:"attachment_id" jsonschema:"Attachment id."`
}

type attachmentView struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"contentType,omitempty"`
	SizeBytes   int64  `json:"sizeBytes"`
	// Readable says whether read_wiki_attachment can return this file's
	// content. Stated up front so an agent does not spend a call finding out,
	// and does not assume an unreadable attachment is empty.
	Readable bool   `json:"readable"`
	Kind     string `json:"kind"`
	// Markdown is the line that places this file on a page as an attachment
	// card. The card only appears when a link to the file stands alone in a
	// paragraph with the byte count after the name; an agent composing that
	// by hand from the id and size got it wrong often enough (a bare link, a
	// "2 KB" label showing as 0 B) that the tool now hands over the exact
	// line to paste.
	Markdown string `json:"markdown"`
}

// attachmentCardMarkdown is the canonical line for an attachment card:
// `[name size](/api/v1/wiki/files/<id>)`, the shape the Hocuspocus parser
// lifts into a wikiFile block. Square brackets in the name are escaped so
// the label survives markdown.
func attachmentCardMarkdown(id, filename string, sizeBytes int64) string {
	label := strings.NewReplacer("[", "\\[", "]", "\\]").Replace(filename)
	return fmt.Sprintf("[%s %d](/api/v1/wiki/files/%s)", label, sizeBytes, id)
}

// newAttachmentView builds the agent-facing view of one stored file.
func newAttachmentView(id, filename, contentType string, sizeBytes int64) attachmentView {
	kind := attachmentKind(filename, contentType)
	return attachmentView{
		ID:          id,
		Filename:    filename,
		ContentType: contentType,
		SizeBytes:   sizeBytes,
		Readable:    kind != attachmentUnsupported,
		Kind:        string(kind),
		Markdown:    attachmentCardMarkdown(id, filename, sizeBytes),
	}
}

type attachTextArgs struct {
	IdempotencyKey
	DocumentID string `json:"document_id" jsonschema:"Page id."`
	Filename   string `json:"filename"    jsonschema:"With an extension: recon.txt, hosts.csv."`
	Content    string `json:"content"     jsonschema:"The text, whole, in one call; the cap is megabytes."`
}

func registerAttachmentTools(s *Server) {
	register(s, &mcp.Tool{
		Name:        "list_wiki_attachments",
		Description: "Files attached to a page, each marked readable or not.",
	}, readTool, handleListWikiAttachments)

	register(s, &mcp.Tool{
		Name: "read_wiki_attachment",
		Description: "Read an attachment: text formats directly, Word and Excel as text, " +
			"images as images. Large files are truncated and say so.",
	}, readTool, handleReadWikiAttachment)

	register(s, &mcp.Tool{
		Name: "attach_text_to_wiki_document",
		Description: "Attach text to a page as a file: raw output, a scan, a config. Whole " +
			"content in one call. The result's markdown line, pasted alone on its own line, " +
			"shows the file on the page.",
	}, writeTool, handleAttachTextToWikiDocument)
}

// handleAttachTextToWikiDocument writes agent-supplied text to a page as an
// attachment.
//
// The gap this fills was reported by an agent: faced with a 22 KB command
// history it split the text into chunks and stitched them into the page body
// with placeholder markers, one dependent round trip each, because nothing
// here offered a way to hand over a blob. The page body was never the right
// home for that anyway — it is evidence, and evidence attaches.
//
// Bytes go through the same ingest path as a browser upload: same size cap,
// same content-type sniffing, same deny-list. An agent's attachment is not a
// second class of file.
func handleAttachTextToWikiDocument(ctx context.Context, s *Server, args attachTextArgs) (toolResult, error) {
	if s.deps.Files == nil {
		return toolResult{}, fmt.Errorf("attachments are unavailable: file storage is not configured")
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
			"filename is required, and should carry an extension so the file opens in the " +
				"right thing: recon.txt, hosts.csv, nginx.conf.")
	}
	if args.Content == "" {
		return toolResult{}, refuse("content is empty; there is nothing to attach.")
	}

	owner, err := agentOwnerID(ctx)
	if err != nil {
		return toolResult{}, err
	}

	// Declared type left empty on purpose: the ingest path sniffs and
	// canonicalises, which is what the browser upload relies on too, and an
	// agent guessing a MIME type is a worse source of truth than the bytes.
	file, ingestErr := s.deps.Files.IngestFile(
		ctx, doc, owner, strings.NewReader(args.Content), filename, "")
	if ingestErr != nil {
		// Ingest failures are ordinary outcomes — too big, wrong type — and
		// the agent can act on them, so they come back as refusals rather
		// than errors it will retry verbatim.
		return toolResult{}, refuse("could not attach %q: %s", filename, ingestErr.Message)
	}

	view := newAttachmentView(file.FileID.String(), file.Filename, file.ContentType, file.SizeBytes)
	return toolResult{
		Payload:     view,
		OperationID: &doc.OperationID,
		Summary: fmt.Sprintf("attached %s to %s; paste `markdown` alone on its own line to show it on the page",
			file.Filename, doc.Title),
	}, nil
}

func handleListWikiAttachments(ctx context.Context, s *Server, args listWikiAttachmentsArgs) (toolResult, error) {
	doc, err := s.loadWikiDocument(ctx, args.DocumentID, models.OperationRoleViewer)
	if err != nil {
		return toolResult{}, err
	}

	files, err := s.deps.WikiFileRepo.FindByDocumentID(ctx, doc.DocumentID)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to list attachments: %w", err)
	}

	views := make([]attachmentView, 0, len(files))
	for i := range files {
		f := &files[i]
		if f.DeletedAt != nil {
			continue
		}
		views = append(views, newAttachmentView(f.FileID.String(), f.Filename, f.ContentType, f.SizeBytes))
	}

	result, err := newPage(views, "")
	if err != nil {
		return toolResult{}, err
	}
	return toolResult{
		Payload:     result,
		OperationID: &doc.OperationID,
		Summary:     fmt.Sprintf("listed %d attachments on %s", len(views), doc.Title),
	}, nil
}

func handleReadWikiAttachment(ctx context.Context, s *Server, args readWikiAttachmentArgs) (toolResult, error) {
	file, err := s.attachmentInScope(ctx, args.AttachmentID)
	if err != nil {
		return toolResult{}, err
	}

	kind := attachmentKind(file.Filename, file.ContentType)
	if kind == attachmentUnsupported {
		return toolResult{}, refuse(
			"%q cannot be read as text or viewed as an image. Readable kinds are text, csv, "+
				"markdown, json, docx, xlsx and images; PDFs and binaries are not supported.",
			file.Filename)
	}
	if file.SizeBytes > maxAttachmentBytes {
		return toolResult{}, refuse(
			"%q is %d MB, past the %d MB an attachment may be read at.",
			file.Filename, file.SizeBytes/(1024*1024), maxAttachmentBytes/(1024*1024))
	}

	raw, err := s.readBlob(ctx, file.ObjectKey, maxAttachmentBytes)
	if err != nil {
		return toolResult{}, fmt.Errorf("failed to read %q: %w", file.Filename, err)
	}

	switch kind {
	case attachmentImage:
		if int64(len(raw)) > maxInlineImageBytes {
			return toolResult{}, refuse(
				"%q is too large to view (%d KB, limit %d KB).",
				file.Filename, len(raw)/1024, maxInlineImageBytes/1024)
		}
		return toolResult{
			// Returned as real image content, not base64 in a JSON string —
			// the point is that a model with vision can look at it.
			Content: []mcp.Content{
				&mcp.TextContent{Text: fmt.Sprintf("Attachment %q (%s):", file.Filename, file.ContentType)},
				&mcp.ImageContent{Data: raw, MIMEType: imageMIMEFor(file)},
			},
			OperationID: &file.OperationID,
			Summary:     fmt.Sprintf("viewed image attachment %s", file.Filename),
		}, nil

	case attachmentOffice:
		return s.readOfficeAttachment(ctx, file, raw)

	default:
		return s.textAttachmentResult(file, string(raw), string(kind), false)
	}
}

// readOfficeAttachment converts through the sidecar, which owns the docx and
// xlsx converters the browser preview already uses.
func (s *Server) readOfficeAttachment(ctx context.Context, file *models.WikiFile, raw []byte) (toolResult, error) {
	if s.deps.Hocuspocus == nil {
		return toolResult{}, fmt.Errorf(
			"reading Office attachments is unavailable: the collaboration service is not configured")
	}

	extracted, err := s.deps.Hocuspocus.ExtractText(ctx, file.Filename, file.ContentType, raw)
	if err != nil {
		if errors.Is(err, wiki.ErrNoTextExtractor) {
			return toolResult{}, refuse("%q is not a document this platform can convert to text.", file.Filename)
		}
		// A corrupt or password-protected document lands here. Say which,
		// because "failed to read" would send an agent retrying.
		return toolResult{}, fmt.Errorf(
			"could not extract text from %q — it may be corrupt or password-protected: %w",
			file.Filename, err)
	}

	return s.textAttachmentResult(file, extracted.Text, extracted.Kind, extracted.Truncated)
}

// textAttachmentResult trims, flags, and packages any text-shaped result.
func (s *Server) textAttachmentResult(file *models.WikiFile, text, kind string, alreadyTruncated bool) (toolResult, error) {
	truncated := alreadyTruncated
	if len(text) > maxAttachmentTextBytes {
		text = truncateUTF8(text, maxAttachmentTextBytes)
		truncated = true
	}

	payload := struct {
		ID        string `json:"id"`
		Filename  string `json:"filename"`
		Kind      string `json:"kind"`
		Text      string `json:"text"`
		Truncated bool   `json:"truncated,omitempty"`
		Note      string `json:"note,omitempty"`
	}{
		ID:        file.FileID.String(),
		Filename:  file.Filename,
		Kind:      kind,
		Text:      text,
		Truncated: truncated,
	}
	if truncated {
		payload.Note = "Only the beginning of this file is shown. Do not treat it as the whole document."
	}

	return toolResult{
		Payload:     payload,
		OperationID: &file.OperationID,
		Summary:     fmt.Sprintf("read attachment %s", file.Filename),
	}, nil
}

// attachmentInScope resolves an attachment and checks the agent may read the
// page it belongs to. Attachments carry their own operation id, but the
// document's is what the agent was authorized against elsewhere, so both are
// checked rather than trusting the denormalized copy.
func (s *Server) attachmentInScope(ctx context.Context, attachmentID string) (*models.WikiFile, error) {
	fileID, err := parseUUIDArg(attachmentID, "attachment_id")
	if err != nil {
		return nil, err
	}

	file, err := s.deps.WikiFileRepo.FindByID(ctx, fileID)
	if err != nil || file.DeletedAt != nil {
		return nil, fmt.Errorf("attachment not found")
	}
	if _, err := s.authorizeOperation(ctx, file.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}
	return &file, nil
}

// readBlob pulls an object, refusing to buffer past the cap even if the
// recorded size lied.
func (s *Server) readBlob(ctx context.Context, key string, limit int64) ([]byte, error) {
	if s.deps.Blobs == nil {
		return nil, fmt.Errorf("attachment storage is not configured")
	}
	reader, _, err := s.deps.Blobs.Get(ctx, key)
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	return io.ReadAll(io.LimitReader(reader, limit))
}

// truncateUTF8 cuts to a byte budget without splitting a rune, which would
// otherwise put a replacement character at the end of every truncated file.
func truncateUTF8(s string, limit int) string {
	if len(s) <= limit {
		return s
	}
	cut := s[:limit]
	for len(cut) > 0 && !utf8.ValidString(cut) {
		cut = cut[:len(cut)-1]
	}
	return cut
}

func imageMIMEFor(file *models.WikiFile) string {
	if strings.HasPrefix(file.ContentType, "image/") {
		return file.ContentType
	}
	// The type was declared by the client and only sniffed when empty, so an
	// image can arrive as octet-stream. Fall back to the extension.
	switch strings.ToLower(extensionOf(file.Filename)) {
	case "png":
		return "image/png"
	case "jpg", "jpeg":
		return "image/jpeg"
	case "gif":
		return "image/gif"
	case "webp":
		return "image/webp"
	default:
		return "image/png"
	}
}
