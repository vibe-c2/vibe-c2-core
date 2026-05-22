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
	PathIDs            []uuid.UUID `bson:"path_ids" json:"-"`
	Title              string     `bson:"title" json:"title"`
	// TitleLower is an ASCII-lowercased mirror of Title, indexed for anchored
	// prefix search without the `$options:"i"` caveat (case-insensitive regex
	// only uses an index for anchored, non-i patterns). Populated on Create
	// and on every title update — never exposed via GraphQL.
	TitleLower         string     `bson:"title_lower" json:"-"`
	Content            string     `bson:"content" json:"content"`                        // Markdown — derived by Hocuspocus from Y.js state
	ContentState       []byte     `bson:"content_state,omitempty" json:"-"`              // Y.js binary state — written by Hocuspocus
	ContentStateAt     *time.Time `bson:"content_state_at,omitempty" json:"-"`           // when Hocuspocus last persisted
	Emoji              string     `bson:"emoji" json:"emoji"`
	Color              string     `bson:"color" json:"color"`                            // hex color for UI
	Icon               string     `bson:"icon" json:"icon"`                              // icon identifier
	SortOrder          string     `bson:"sort_order" json:"sortOrder"`                   // fractional index string
	CreatedByID        uuid.UUID  `bson:"created_by_id" json:"createdById"`
	// LastUpdatedByID + LastUpdatedAt attribute the most recent persistence of
	// the document — metadata edits through the GraphQL resolver and content
	// edits via the Hocuspocus sidecar. Nullable: legacy rows (pre-feature)
	// show the creator as the effective author until their next edit.
	LastUpdatedByID    *uuid.UUID `bson:"last_updated_by_id,omitempty" json:"lastUpdatedById,omitempty"`
	LastUpdatedAt      *time.Time `bson:"last_updated_at,omitempty" json:"lastUpdatedAt,omitempty"`
	LastBackupAt       *time.Time `bson:"last_backup_at,omitempty" json:"lastBackupAt,omitempty"`
	DeletedAt          *time.Time `bson:"deleted_at,omitempty" json:"deletedAt,omitempty"`
	DeletedByID        *uuid.UUID `bson:"deleted_by_id,omitempty" json:"deletedById,omitempty"`
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
}
