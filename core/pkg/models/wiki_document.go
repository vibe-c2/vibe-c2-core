package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// WikiDocument represents a wiki document in an operation's knowledge base.
// Documents form a recursive tree via ParentDocumentID — any document can
// have content and children simultaneously. Root-level documents have nil
// ParentDocumentID.
//
// Content is stored as Y.js CRDT binary state (ContentState) and derived
// Markdown (Content). The Go backend reads Content for search, backups, and
// GraphQL. ContentState is written by the Hocuspocus sidecar and never
// exposed via GraphQL.
//
// What that CRDT state *holds* depends on Kind. A prose page (the default, and
// every page that existed before Kind did) keeps a ProseMirror tree; a drawing
// page keeps an Excalidraw scene and has no Markdown body at all. Both live in
// the same room and persist through the same bytes, so Kind — not the presence
// of content — is what tells a caller which one it is holding.
type WikiDocument struct {
	field.DefaultField `bson:",inline"`
	DocumentID         uuid.UUID  `bson:"document_id" json:"documentId"`
	OperationID        uuid.UUID  `bson:"operation_id" json:"operationId"`
	ParentDocumentID   *uuid.UUID `bson:"parent_document_id,omitempty" json:"parentDocumentId,omitempty"`
	// PathIDs is the materialized ancestor chain: root → … → immediate-parent.
	// It excludes the document itself. Empty for root documents. Multikey-indexed
	// on {operation_id, path_ids} so a scoped search ("find under this folder")
	// is one index probe instead of an O(depth) BFS over parent_document_id.
	// Maintained by Create (caller pre-populates) and by
	// RebuildPathIDsCascade after any reparent. Never exposed via GraphQL.
	PathIDs []uuid.UUID `bson:"path_ids" json:"-"`
	Title   string      `bson:"title" json:"title"`
	// TitleLower is an ASCII-lowercased mirror of Title, indexed for anchored
	// prefix search without the `$options:"i"` caveat (case-insensitive regex
	// only uses an index for anchored, non-i patterns). Populated on Create
	// and on every title update — never exposed via GraphQL.
	TitleLower string `bson:"title_lower" json:"-"`
	// Kind is what this page's body is: prose (the default) or an Excalidraw
	// drawing. Absent on every row written before drawings existed, which is
	// why it is `omitempty` and why the zero value resolves to "document" —
	// see WikiDocumentKind.Or(). Everything that writes Markdown into a body
	// must refuse a non-document kind; everything that reads a body as Markdown
	// must say what the page is rather than returning an empty string.
	Kind           WikiDocumentKind `bson:"kind,omitempty" json:"kind"`
	Content        string           `bson:"content" json:"content"`              // Markdown — derived by Hocuspocus from Y.js state
	ContentState   []byte           `bson:"content_state,omitempty" json:"-"`    // Y.js binary state — written by Hocuspocus
	ContentStateAt *time.Time       `bson:"content_state_at,omitempty" json:"-"` // when Hocuspocus last persisted
	// ContentStateSchemaVersion is the editor schema version of the client that
	// last persisted ContentState. The sidecar stamps it (monotonic, never
	// lowered) on every meaningful content edit; legacy rows have it absent → 0.
	// The collab-ticket endpoint refuses to connect a client whose reported
	// schema version is below this, because such a client's ProseMirror schema
	// can't represent every node in the stored content and would silently prune
	// the unknown nodes (e.g. checklist items) on bind, destroying content. Never
	// written by Go — the sidecar owns it, same as the reference/coverage fields.
	ContentStateSchemaVersion int       `bson:"content_state_schema_version,omitempty" json:"-"`
	Emoji                     string    `bson:"emoji" json:"emoji"`
	Color                     string    `bson:"color" json:"color"`          // hex color for UI
	Icon                      string    `bson:"icon" json:"icon"`            // icon identifier
	SortOrder                 string    `bson:"sort_order" json:"sortOrder"` // fractional index string
	CreatedByID               uuid.UUID `bson:"created_by_id" json:"createdById"`
	// LastUpdatedByID + LastUpdatedAt attribute the most recent persistence of
	// the document — metadata edits through the GraphQL resolver and content
	// edits via the Hocuspocus sidecar. Nullable: legacy rows (pre-feature)
	// show the creator as the effective author until their next edit.
	LastUpdatedByID *uuid.UUID `bson:"last_updated_by_id,omitempty" json:"lastUpdatedById,omitempty"`
	LastUpdatedAt   *time.Time `bson:"last_updated_at,omitempty" json:"lastUpdatedAt,omitempty"`
	LastBackupAt    *time.Time `bson:"last_backup_at,omitempty" json:"lastBackupAt,omitempty"`
	DeletedAt       *time.Time `bson:"deleted_at,omitempty" json:"deletedAt,omitempty"`
	DeletedByID     *uuid.UUID `bson:"deleted_by_id,omitempty" json:"deletedById,omitempty"`
	// References lists the document IDs that this document cites inline via the
	// /doc slash command (wikiDocumentReference nodes). Rewritten in full by
	// the Hocuspocus sidecar on every content persist — the editor JSON is the
	// source of truth. Used to drive the backlinks resolver. Plain markdown
	// links (<a href="/wiki/…">) are intentionally not tracked here.
	References []uuid.UUID `bson:"references,omitempty" json:"-"`
	// CredentialReferences lists the credential IDs that this document cites
	// inline via the /credential slash command (wikiCredentialReference nodes).
	// Same rewrite semantics as References — populated by the Hocuspocus
	// sidecar on every persist and used to power the inverse "which wiki docs
	// cite this credential" lookup for the Findings page.
	CredentialReferences []uuid.UUID `bson:"credential_references,omitempty" json:"-"`
	// HashReferences lists the hash IDs that this document cites inline via the
	// /hash slash command (wikiHashReference nodes). Same rewrite semantics as
	// CredentialReferences — populated by the Hocuspocus sidecar on every
	// persist and used to power the inverse "which wiki docs cite this hash"
	// lookup for the Findings page.
	HashReferences []uuid.UUID `bson:"hash_references,omitempty" json:"-"`
	// ImageReferences lists the wiki image IDs embedded in this document's body
	// (image nodes whose src is /api/v1/wiki/images/<uuid>). FileReferences is
	// the equivalent for wikiFile attachment nodes. Both are rewritten in full
	// by the Hocuspocus sidecar on every content persist — the editor state is
	// the source of truth. They are the authoritative "which attachments does
	// this document use" record (the Content field is plain text and does NOT
	// contain attachment URLs), and drive the image/file garbage collectors: a
	// blob is reclaimed only once no document in the operation references its id.
	ImageReferences []uuid.UUID `bson:"image_references,omitempty" json:"-"`
	FileReferences  []uuid.UUID `bson:"file_references,omitempty" json:"-"`
	// IsTemplate marks this document as a reusable template. Any document in any
	// operation (or the Public tree) can be flagged a template by anyone with
	// edit access; the create-from-template picker then offers it as a fork
	// source. The flag is independent of content — a template body may hold
	// checklist items, prose, or anything else. Replaces the former synthetic
	// "Templates tree": templates now live in-place wherever they're authored.
	IsTemplate bool `bson:"is_template" json:"isTemplate"`
	// SourceTemplateID records the template a document was forked from
	// (instantiateTemplate byte-copies the template's content into a new
	// operation wiki doc and stamps this field). Nil for templates themselves
	// and for ordinary documents created from scratch. Provenance only — the two
	// documents are independent CRDTs after instantiation, so a later template
	// edit never propagates here.
	SourceTemplateID *uuid.UUID `bson:"source_template_id,omitempty" json:"sourceTemplateId,omitempty"`
	// ChecklistTotal, ChecklistRequired and ChecklistAnswered are coverage counts
	// projected by the Hocuspocus sidecar from the document's wikiChecklistItem
	// nodes: ChecklistTotal is the number of checklist items, ChecklistRequired
	// the subset whose `required` attribute is truthy, and ChecklistAnswered the
	// number of items (required or not) whose derived state is answered or
	// not_applicable. All three are zero for documents that contain no checklist
	// items, so a non-zero ChecklistTotal is the marker that "this document has a
	// checklist". Never written by Go — the sidecar owns them, same as the
	// reference arrays above.
	ChecklistTotal    int `bson:"checklist_total" json:"checklistTotal"`
	ChecklistRequired int `bson:"checklist_required" json:"checklistRequired"`
	ChecklistAnswered int `bson:"checklist_answered" json:"checklistAnswered"`
	// DrawingElementCount and DrawingVersionSum are the drawing equivalent of
	// the checklist counters above: projected by the Hocuspocus sidecar from
	// the page's Excalidraw scene, zero for every prose page, and never written
	// by Go. ElementCount is the live (non-deleted) element total, which is what
	// tells a real drawing from a blank canvas. VersionSum adds up those
	// elements' versions — it is not a checksum, it exists so that moving a
	// shape registers as a change at all. A drawing's text does not move when a
	// box is dragged, so without it the sidecar's meaningful-change check reads
	// every drawing edit as an open-time no-op and the page is never attributed
	// or marked updated.
	DrawingElementCount int `bson:"drawing_element_count" json:"drawingElementCount"`
	DrawingVersionSum   int `bson:"drawing_version_sum" json:"-"`
	// HostReferences lists the host IDs that this document cites inline via the
	// /host slash command (wikiHostReference nodes). Same rewrite semantics as
	// CredentialReferences — populated by the Hocuspocus sidecar on every
	// persist and used to power the inverse "which wiki docs reference this
	// host" lookup. Hosts are operation-private, so the sidecar drops these on
	// Public-tree documents (same boundary as credentials/hashes).
	HostReferences []uuid.UUID `bson:"host_references,omitempty" json:"-"`
	// ImportOrigin records where a document came from when it was created by
	// a wiki transfer (bundle or markdown import) rather than authored here.
	// Nil for every other document. Provenance only: nothing reads it on the
	// hot path, but it is the hook for "already imported from this bundle"
	// checks and for answering "where did this page come from" later.
	ImportOrigin *WikiImportOrigin `bson:"import_origin,omitempty" json:"-"`
}

// WikiImportOrigin is the provenance stamp on an imported WikiDocument.
type WikiImportOrigin struct {
	// BundleID identifies the export run the page came from. For a markdown
	// import it is a fresh id shared by every page of that import.
	BundleID uuid.UUID `bson:"bundle_id" json:"bundleId"`
	// SourceDocumentID is the page's id on the source system. Zero for
	// foreign markdown, which carries no ids.
	SourceDocumentID uuid.UUID `bson:"source_document_id,omitempty" json:"sourceDocumentId"`
	ImportedAt       time.Time `bson:"imported_at" json:"importedAt"`
}
