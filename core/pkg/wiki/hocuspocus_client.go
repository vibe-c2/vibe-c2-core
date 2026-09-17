package wiki

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"go.uber.org/zap"
)

// HocuspocusClient is an HTTP client for the Hocuspocus sidecar's internal API.
// Used to force-disconnect users when their operation membership is revoked
// or their role is demoted below operator, and to convert markdown into Y.js
// document updates during the Outline import flow.
type HocuspocusClient struct {
	baseURL        string
	internalSecret string
	httpClient     *http.Client
	logger         *zap.Logger
}

// NewHocuspocusClient creates a new client for the Hocuspocus internal API.
//
// internalSecret is shared with the sidecar's HOCUSPOCUS_WEBHOOK_SECRET (the
// same secret signs both the sidecar→backend webhook and the backend→sidecar
// internal route; the header name disambiguates direction). Pass an empty
// string when only the disconnect API is needed — markdown-to-yjs requests
// will then fail with a clear error.
func NewHocuspocusClient(baseURL, internalSecret string, logger *zap.Logger) *HocuspocusClient {
	return &HocuspocusClient{
		baseURL:        baseURL,
		internalSecret: internalSecret,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		logger: logger,
	}
}

type disconnectRequest struct {
	UserID      string `json:"userId"`
	OperationID string `json:"operationId"`
}

// DisconnectUser calls the Hocuspocus disconnect API to force-close WebSocket
// connections for a user in a specific operation. This is called when a user's
// role is demoted below operator or their membership is revoked.
func (c *HocuspocusClient) DisconnectUser(ctx context.Context, userID, operationID string) error {
	body, err := json.Marshal(disconnectRequest{
		UserID:      userID,
		OperationID: operationID,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal disconnect request: %w", err)
	}

	url := c.baseURL + "/api/disconnect"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create disconnect request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		c.logger.Warn("Failed to call Hocuspocus disconnect API",
			zap.String("user_id", userID),
			zap.String("operation_id", operationID),
			zap.Error(err))
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		c.logger.Warn("Hocuspocus disconnect API returned error",
			zap.String("user_id", userID),
			zap.Int("status", resp.StatusCode))
	}

	return nil
}

// markdownToYjsRequest is the body shape the sidecar's
// /internal/markdown-to-yjs route consumes.
type markdownToYjsRequest struct {
	Markdown string `json:"markdown"`
}

// MarkdownToYjs sends the markdown body to the Hocuspocus sidecar and
// returns the encoded Y.js document update bytes. The bytes are suitable
// for direct insertion into wiki_documents.content_state; the editor's
// collab extension reads them back via the same Y.XmlFragment field name
// ("default") that the sidecar's persistence layer uses.
//
// Used by the Outline importer to seed every imported document with a
// fully-populated content_state so the first user edit doesn't overwrite
// the imported body with an empty Y.Doc.
func (c *HocuspocusClient) MarkdownToYjs(ctx context.Context, markdown string) ([]byte, error) {
	if c.internalSecret == "" {
		return nil, fmt.Errorf("markdown-to-yjs: no internal secret configured")
	}

	body, err := json.Marshal(markdownToYjsRequest{Markdown: markdown})
	if err != nil {
		return nil, fmt.Errorf("marshal markdown payload: %w", err)
	}

	mac := hmac.New(sha256.New, []byte(c.internalSecret))
	mac.Write(body)
	signature := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	url := c.baseURL + "/internal/markdown-to-yjs"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build markdown-to-yjs request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Signature-256", signature)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call hocuspocus markdown-to-yjs: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Surface the sidecar's error body so callers can log a useful
		// reason without re-parsing the response.
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("markdown-to-yjs returned %d: %s",
			resp.StatusCode, string(errBody))
	}

	bytesOut, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read markdown-to-yjs response: %w", err)
	}
	return bytesOut, nil
}

// YjsToMarkdown is the inverse of MarkdownToYjs: it sends a document's Y.js
// content_state to the Hocuspocus sidecar and returns the Outline-flavored
// markdown that round-trips back through MarkdownToYjs.
//
// Used by the wiki export flow to render each document's stored binary
// state into a .md file. Empty input bytes return an empty string without
// calling the sidecar — an unopened document has no content to render.
func (c *HocuspocusClient) YjsToMarkdown(ctx context.Context, contentState []byte) (string, error) {
	if len(contentState) == 0 {
		return "", nil
	}
	if c.internalSecret == "" {
		return "", fmt.Errorf("yjs-to-markdown: no internal secret configured")
	}

	mac := hmac.New(sha256.New, []byte(c.internalSecret))
	mac.Write(contentState)
	signature := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	url := c.baseURL + "/internal/yjs-to-markdown"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(contentState))
	if err != nil {
		return "", fmt.Errorf("build yjs-to-markdown request: %w", err)
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("X-Internal-Signature-256", signature)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("call hocuspocus yjs-to-markdown: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("yjs-to-markdown returned %d: %s",
			resp.StatusCode, string(errBody))
	}

	bytesOut, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read yjs-to-markdown response: %w", err)
	}
	return string(bytesOut), nil
}

// MaxMarkdownBytes is the largest body ApplyMarkdown will accept.
//
// MUST match MAX_INPUT_BYTES in hocuspocus/src/apply-markdown.ts. Declared
// here so callers can refuse an oversized body with a useful message instead
// of discovering the limit as a 413 from a service they have never heard of.
const MaxMarkdownBytes = 1024 * 1024

// ErrMarkdownTooLarge reports a body the sidecar refused on size. Typed so
// callers can turn it into their own message rather than matching on the text
// of an HTTP error.
var ErrMarkdownTooLarge = errors.New("markdown body exceeds the size limit")

// ApplyMode selects how ApplyMarkdown combines an edit with what is already
// in the document.
type ApplyMode string

const (
	// ApplyReplace swaps the whole body. Correct when the caller has just read
	// the document and is sending back a complete revision.
	ApplyReplace ApplyMode = "replace"
	// ApplyAppend adds to the end and never touches existing content, so it
	// cannot race somebody typing above it.
	ApplyAppend ApplyMode = "append"
	// ApplyPrepend adds to the beginning, with the same guarantee.
	//
	// Worth its own mode rather than leaving callers to do it: without one,
	// putting a line at the top of a page means reading the whole body and
	// sending it all back through ApplyReplace — the most expensive call
	// available, and the only one that can lose a collaborator's work. A
	// structural addition should not force a full rewrite.
	ApplyPrepend ApplyMode = "prepend"
)

type applyMarkdownRequest struct {
	DocumentID string    `json:"documentId"`
	Markdown   string    `json:"markdown"`
	Mode       ApplyMode `json:"mode"`
	// UserID is the operator the edit is made on behalf of. The sidecar
	// stamps attribution only when it knows who edited, and the wiki's
	// recently-updated list is sorted on a field only attributed saves set —
	// so omitting this makes the edit invisible to that list.
	UserID string `json:"userId,omitempty"`
}

// ApplyMarkdownResult reports what the sidecar did. Watchers is how many
// people had the document open, which is the difference between an edit
// somebody watched appear and one that happened quietly.
type ApplyMarkdownResult struct {
	Nodes    int `json:"nodes"`
	Watchers int `json:"watchers"`
	AttachmentAudit
}

// StrayFileLink is a link to an attachment that stayed an ordinary link
// instead of becoming an attachment card.
type StrayFileLink struct {
	FileID string `json:"fileId"`
	Label  string `json:"label"`
}

// AttachmentAudit says how the page's file links stand after a write. The
// page reads back as the same markdown whether a file is a card or a plain
// link, so this is the only way an agent learns which one it produced.
type AttachmentAudit struct {
	AttachmentCards int             `json:"attachmentCards"`
	StrayFileLinks  []StrayFileLink `json:"strayFileLinks,omitempty"`
}

// ApplyMarkdown edits a wiki document as a Y.js transaction on the live
// document, rather than by overwriting content_state.
//
// This is what lets an agent write to a page while the operator has it open.
// Overwriting content_state cannot work in that situation — a connected editor
// holds the authoritative Y.Doc and stores it back on the next debounce, so
// the write is either erased seconds later or lands mid-keystroke. Going
// through the sidecar makes the edit an ordinary Y.js transaction instead: it
// merges rather than overwrites, broadcasts to everyone connected, and
// persists through the same debounced store as a human edit.
//
// The sidecar loads the document when nobody has it open, so this is the write
// path in both cases and there is only one behaviour to reason about.
func (c *HocuspocusClient) ApplyMarkdown(ctx context.Context, documentID, markdown string, mode ApplyMode, userID string) (ApplyMarkdownResult, error) {
	var result ApplyMarkdownResult

	if c.internalSecret == "" {
		return result, fmt.Errorf("apply-markdown: no internal secret configured")
	}
	switch mode {
	case ApplyReplace, ApplyAppend, ApplyPrepend:
	default:
		return result, fmt.Errorf("apply-markdown: unknown mode %q", mode)
	}

	body, err := json.Marshal(applyMarkdownRequest{
		DocumentID: documentID,
		Markdown:   markdown,
		Mode:       mode,
		UserID:     userID,
	})
	if err != nil {
		return result, fmt.Errorf("marshal apply payload: %w", err)
	}

	mac := hmac.New(sha256.New, []byte(c.internalSecret))
	mac.Write(body)
	signature := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	url := c.baseURL + "/internal/apply-markdown"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return result, fmt.Errorf("build apply-markdown request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Signature-256", signature)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return result, fmt.Errorf("call hocuspocus apply-markdown: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusRequestEntityTooLarge {
		return result, ErrMarkdownTooLarge
	}
	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return result, fmt.Errorf("apply-markdown returned %d: %s", resp.StatusCode, string(errBody))
	}

	if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&result); err != nil {
		return result, fmt.Errorf("read apply-markdown response: %w", err)
	}
	return result, nil
}

// editMarkdownRequest is the edit-mode body of /internal/apply-markdown.
type editMarkdownRequest struct {
	DocumentID string    `json:"documentId"`
	Mode       ApplyMode `json:"mode"`
	OldText    string    `json:"oldText"`
	NewText    string    `json:"newText"`
	ReplaceAll bool      `json:"replaceAll"`
	// See applyMarkdownRequest.UserID.
	UserID string `json:"userId,omitempty"`
}

// applyEdit is the mode value for EditMarkdown. Not exported alongside the
// other modes because it takes different arguments and ApplyMarkdown would
// reject it.
const applyEdit ApplyMode = "edit"

// EditMarkdownResult reports a snippet edit.
type EditMarkdownResult struct {
	Nodes        int `json:"nodes"`
	Watchers     int `json:"watchers"`
	Matches      int `json:"matches"`
	Replacements int `json:"replacements"`
	AttachmentAudit
}

// EditNoMatchError means old_text was not on the page. Diagnosis is a sentence
// for the agent saying how the snippet most likely differs.
type EditNoMatchError struct {
	Diagnosis string
}

func (e *EditNoMatchError) Error() string { return "snippet not found: " + e.Diagnosis }

// EditAmbiguousError means old_text occurs more than once and replaceAll was
// not set.
type EditAmbiguousError struct {
	Matches int
}

func (e *EditAmbiguousError) Error() string {
	return fmt.Sprintf("snippet is ambiguous: %d matches", e.Matches)
}

// editRefusal is the 409 body the sidecar sends for either refusal.
type editRefusal struct {
	Error     string `json:"error"`
	Matches   int    `json:"matches"`
	Diagnosis string `json:"diagnosis"`
}

// EditMarkdown replaces an exact snippet on the live document in one hop.
//
// The match runs inside the sidecar against the document as it is right now,
// not against a rendering of the persisted state, and only the blocks that
// change are touched. Before this the Go side rendered the whole page, did
// the replacement, and sent the whole page back through ApplyReplace — two
// hops, the entire body twice over the wire, and a base that could lag what
// the operator was typing.
func (c *HocuspocusClient) EditMarkdown(ctx context.Context, documentID, oldText, newText string, replaceAll bool, userID string) (EditMarkdownResult, error) {
	var result EditMarkdownResult

	if c.internalSecret == "" {
		return result, fmt.Errorf("apply-markdown: no internal secret configured")
	}

	body, err := json.Marshal(editMarkdownRequest{
		DocumentID: documentID,
		Mode:       applyEdit,
		OldText:    oldText,
		NewText:    newText,
		ReplaceAll: replaceAll,
		UserID:     userID,
	})
	if err != nil {
		return result, fmt.Errorf("marshal edit payload: %w", err)
	}

	mac := hmac.New(sha256.New, []byte(c.internalSecret))
	mac.Write(body)
	signature := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	url := c.baseURL + "/internal/apply-markdown"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return result, fmt.Errorf("build apply-markdown request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Signature-256", signature)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return result, fmt.Errorf("call hocuspocus apply-markdown: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&result); err != nil {
			return result, fmt.Errorf("read apply-markdown response: %w", err)
		}
		return result, nil
	case http.StatusRequestEntityTooLarge:
		return result, ErrMarkdownTooLarge
	case http.StatusConflict:
		var refusal editRefusal
		if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&refusal); err != nil {
			return result, fmt.Errorf("read apply-markdown refusal: %w", err)
		}
		if refusal.Error == "ambiguous" {
			return result, &EditAmbiguousError{Matches: refusal.Matches}
		}
		return result, &EditNoMatchError{Diagnosis: refusal.Diagnosis}
	}

	errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	return result, fmt.Errorf("apply-markdown returned %d: %s", resp.StatusCode, string(errBody))
}

type extractTextRequest struct {
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	// Data is the file, base64-encoded. JSON rather than a raw body because
	// the HMAC covers the exact bytes sent, and the filename and content type
	// have to travel under that signature too.
	Data string `json:"data"`
}

// ExtractedText is what the sidecar made of an attachment.
type ExtractedText struct {
	Kind      string `json:"kind"`
	Text      string `json:"text"`
	Truncated bool   `json:"truncated"`
}

// ErrNoTextExtractor means the sidecar has no converter for this file. It is
// an ordinary answer, not a failure: most attachments are not documents.
var ErrNoTextExtractor = errors.New("no text extractor for this file type")

// ExtractText converts a .docx or .xlsx attachment to plain text.
//
// Delegated to the sidecar because the converters already live there — the
// wiki's own attachment preview renders these in the browser with mammoth and
// read-excel-file, and reimplementing either in Go would be a second
// implementation to keep in step with what the operator sees. It also keeps
// this away from SheetJS, which the frontend documents at length as unsafe to
// feed untrusted spreadsheets to.
func (c *HocuspocusClient) ExtractText(ctx context.Context, filename, contentType string, data []byte) (ExtractedText, error) {
	var out ExtractedText

	if c.internalSecret == "" {
		return out, fmt.Errorf("extract-text: no internal secret configured")
	}

	body, err := json.Marshal(extractTextRequest{
		Filename:    filename,
		ContentType: contentType,
		Data:        base64.StdEncoding.EncodeToString(data),
	})
	if err != nil {
		return out, fmt.Errorf("marshal extract payload: %w", err)
	}

	mac := hmac.New(sha256.New, []byte(c.internalSecret))
	mac.Write(body)
	signature := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	url := c.baseURL + "/internal/extract-text"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return out, fmt.Errorf("build extract-text request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Signature-256", signature)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return out, fmt.Errorf("call hocuspocus extract-text: %w", err)
	}
	defer resp.Body.Close()

	// 415 is "not a document I can read", which callers handle rather than
	// report as breakage.
	if resp.StatusCode == http.StatusUnsupportedMediaType {
		return out, ErrNoTextExtractor
	}
	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return out, fmt.Errorf("extract-text returned %d: %s", resp.StatusCode, string(errBody))
	}

	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return out, fmt.Errorf("read extract-text response: %w", err)
	}
	return out, nil
}

// ChipKind names a kind of inline reference chip for RebaseRequest.
// Values mirror the segment names in hocuspocus/src/markdown-serializer.ts
// (`vibe://doc/…`, `vibe://host/…`, `vibe://hash/…`) plus "credential".
type ChipKind string

const (
	ChipDoc        ChipKind = "doc"
	ChipHost       ChipKind = "host"
	ChipHash       ChipKind = "hash"
	ChipCredential ChipKind = "credential"
)

// RebaseRequest describes one page to rebase. Exactly one of ContentState
// or Markdown is set: native transfers send the stored Y.js bytes, foreign
// imports send markdown for the sidecar to parse.
type RebaseRequest struct {
	ContentState []byte
	Markdown     string
	// IDMap maps every source id the body may reference (documents, hosts,
	// hashes, credentials, images, files) to the id it must carry on the
	// target. Ids absent from the map are kept unless Drop or
	// DropUnmappedKinds says otherwise.
	IDMap map[string]string
	// Drop lists ids whose chips are lowered to plain label text.
	Drop []string
	// DropUnmappedKinds lists chip kinds for which any id absent from IDMap
	// is lowered to text. A cross-operation import names every kind; a
	// same-operation import names none.
	DropUnmappedKinds []ChipKind
}

// ChecklistCoverage mirrors the sidecar's projection of checklist items.
type ChecklistCoverage struct {
	Total    int `json:"total"`
	Required int `json:"required"`
	Answered int `json:"answered"`
}

// RebaseResult is the rebased body plus the full persisted projection the
// sidecar derived from it — the same fields persistence.ts writes on a
// collaborative save, so a page created from this result is indexed as if
// it had been saved in the editor.
type RebaseResult struct {
	ContentState         []byte
	Content              string            `json:"content"`
	References           []string          `json:"references"`
	CredentialReferences []string          `json:"credentialReferences"`
	HashReferences       []string          `json:"hashReferences"`
	HostReferences       []string          `json:"hostReferences"`
	ImageReferences      []string          `json:"imageReferences"`
	FileReferences       []string          `json:"fileReferences"`
	Checklist            ChecklistCoverage `json:"checklist"`
	SchemaVersion        int               `json:"schemaVersion"`
	Unmapped             []string          `json:"unmapped"`
	Dropped              int               `json:"dropped"`
	Remapped             int               `json:"remapped"`
}

type rebaseWireRequest struct {
	ContentState      string            `json:"contentState,omitempty"`
	Markdown          *string           `json:"markdown,omitempty"`
	IDMap             map[string]string `json:"idMap"`
	Drop              []string          `json:"drop,omitempty"`
	DropUnmappedKinds []ChipKind        `json:"dropUnmappedKinds,omitempty"`
}

type rebaseWireResponse struct {
	RebaseResult
	ContentState string `json:"contentState"`
}

// RebaseDocument rewrites every id a page body references and returns the
// new Y.js state together with its persisted projection.
//
// Used by the wiki transfer materialiser for every page it creates. The ids
// live in ProseMirror node attributes, so the rewrite has to happen on the
// tree — this is the one place that walks it, and it also derives the
// reference indexes, so an imported page can never be created unindexed.
func (c *HocuspocusClient) RebaseDocument(ctx context.Context, req RebaseRequest) (RebaseResult, error) {
	var out RebaseResult
	if c.internalSecret == "" {
		return out, fmt.Errorf("rebase-document: no internal secret configured")
	}

	wire := rebaseWireRequest{
		IDMap:             req.IDMap,
		Drop:              req.Drop,
		DropUnmappedKinds: req.DropUnmappedKinds,
	}
	if wire.IDMap == nil {
		wire.IDMap = map[string]string{}
	}
	if len(req.ContentState) > 0 {
		wire.ContentState = base64.StdEncoding.EncodeToString(req.ContentState)
	} else {
		md := req.Markdown
		wire.Markdown = &md
	}
	body, err := json.Marshal(wire)
	if err != nil {
		return out, fmt.Errorf("marshal rebase payload: %w", err)
	}

	mac := hmac.New(sha256.New, []byte(c.internalSecret))
	mac.Write(body)
	signature := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	url := c.baseURL + "/internal/rebase-document"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return out, fmt.Errorf("build rebase-document request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Internal-Signature-256", signature)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return out, fmt.Errorf("call hocuspocus rebase-document: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return out, fmt.Errorf("rebase-document returned %d: %s", resp.StatusCode, string(errBody))
	}

	var wireOut rebaseWireResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 16<<20)).Decode(&wireOut); err != nil {
		return out, fmt.Errorf("read rebase-document response: %w", err)
	}
	out = wireOut.RebaseResult
	out.ContentState, err = base64.StdEncoding.DecodeString(wireOut.ContentState)
	if err != nil {
		return out, fmt.Errorf("decode rebased content_state: %w", err)
	}
	return out, nil
}
