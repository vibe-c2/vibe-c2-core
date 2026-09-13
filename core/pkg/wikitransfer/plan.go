// Package wikitransfer moves wiki subtrees in and out of an operation.
//
// Two formats feed one pipeline. The native bundle (subpackage bundle)
// carries Y.js state verbatim and is lossless; the foreign markdown zip
// (subpackage markdown) is what other tools produce and consume. Both are
// read into a Plan, and the Materialiser in this package is the only code
// that turns a Plan into documents. It allocates every id up front, rewrites
// each page body through the Hocuspocus sidecar, and creates each document in
// a single write with its full projection — reference indexes and checklist
// counters included — so an imported page is indexed exactly like one saved
// in the editor.
//
// See docs/wiki-transfer-design.md.
package wikitransfer

import (
	"io"

	"github.com/google/uuid"
)

// Plan is the normalised, in-memory description of what an import will
// create. Producers (bundle reader, markdown importer) fill it; the
// Materialiser consumes it.
type Plan struct {
	// BundleID identifies the export run the plan came from. Stamped as
	// ImportOrigin on every created document. Fresh for foreign imports.
	BundleID uuid.UUID

	// SourceOperationID is the operation the pages were exported from, when
	// known. Zero for foreign zips. Compared against the target to decide
	// whether unmapped host, hash and page ids are still meaningful.
	SourceOperationID uuid.UUID

	// Pages are the top-level pages of the import, each with its subtree.
	Pages []*Page

	// Attachments is every blob the plan may ingest, keyed by its source id.
	// Bodies reference attachments by these ids (/api/v1/wiki/images/<id>,
	// wikiFile.fileId); the materialiser remaps them.
	Attachments map[uuid.UUID]*Attachment

	// Credentials holds the payloads of credentials referenced by the pages,
	// keyed by source id, for resolve-or-create on the target.
	Credentials map[uuid.UUID]CredentialPayload

	// CredentialTombstones lists credential ids the source exported as
	// deleted. Their chips are lowered to plain text.
	CredentialTombstones []uuid.UUID
}

// Page is one document to create. Exactly one of ContentState or Markdown
// carries the body; both empty means an empty page (a folder).
type Page struct {
	// SourceID is the page's id on the source. For foreign markdown the
	// producer mints one so cross-page links can still be expressed.
	SourceID uuid.UUID

	Title     string
	Emoji     string
	Icon      string
	Color     string
	SortOrder string

	IsTemplate       bool
	SourceTemplateID *uuid.UUID

	ContentState []byte
	Markdown     string

	// Attachments are the source ids of the attachments this page owns.
	Attachments []uuid.UUID

	// HostRefs and HashRefs are the ids the source recorded for the page.
	// Hints only: the sidecar decides what the body really references. The
	// materialiser uses them to pre-check which cross-operation ids exist
	// on the target before the body is rebased.
	HostRefs []uuid.UUID
	HashRefs []uuid.UUID

	Children []*Page
}

// HasBody reports whether the page carries content to rebase.
func (p *Page) HasBody() bool {
	return len(p.ContentState) > 0 || p.Markdown != ""
}

// AttachmentKind routes a blob to the image or file ingest path.
type AttachmentKind int

const (
	AttachmentImage AttachmentKind = iota + 1
	AttachmentFile
)

// Attachment is one blob to ingest. Open must return a fresh reader each
// call; the materialiser reads every attachment at most once per owning
// page.
type Attachment struct {
	ID          uuid.UUID
	Kind        AttachmentKind
	Filename    string
	ContentType string
	SizeBytes   int64
	Open        func() (io.ReadCloser, error)
}

// CredentialPayload is a credential as carried by a bundle or a
// vibe-credential fence. Mirrors the fields the export writes.
type CredentialPayload struct {
	ID         string               `json:"id"`
	Name       string               `json:"name"`
	Type       string               `json:"type"`
	Username   string               `json:"username"`
	Password   string               `json:"password"`
	Keys       []CredentialKey      `json:"keys"`
	Properties []CredentialProperty `json:"properties"`
	IsValid    bool                 `json:"isValid"`
	Tags       []string             `json:"tags"`
	Deleted    bool                 `json:"deleted"`
}

// CredentialKey is one key material entry of a credential payload.
type CredentialKey struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

// CredentialProperty is one free-form property of a credential payload.
type CredentialProperty struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// CountPages returns the number of pages in the plan, all levels included.
func (p *Plan) CountPages() int {
	return countPages(p.Pages)
}

func countPages(pages []*Page) int {
	n := 0
	for _, pg := range pages {
		n += 1 + countPages(pg.Children)
	}
	return n
}

// Walk visits every page depth-first, parents before children.
func (p *Plan) Walk(fn func(page *Page, depth int)) {
	var visit func(pages []*Page, depth int)
	visit = func(pages []*Page, depth int) {
		for _, pg := range pages {
			fn(pg, depth)
			visit(pg.Children, depth+1)
		}
	}
	visit(p.Pages, 0)
}
