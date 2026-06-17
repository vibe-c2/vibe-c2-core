// Editor schema version — the single authored version number for the wiki
// collaborative editor. It is reported to the backend when requesting a collab
// ticket; the server refuses to connect a client whose version is below the
// schema that authored a document's stored content (see
// core/pkg/controller/wiki_controller.go CollabTicket), because an older editor
// would silently prune node types it doesn't understand (e.g. checklist items)
// when y-prosemirror binds the shared Y.js doc to its reduced schema.
//
// BUMP THIS whenever the editor's node/mark set changes in a way that an older
// client could not faithfully represent — i.e. when adding a new node or mark
// type to wiki-editor.tsx (and mirroring it in hocuspocus/src/wiki-schema.ts).
// Pure styling/behavior changes that don't add persisted node/mark types do not
// require a bump.
//
// History:
//   1 — baseline: prose, lists, tables, code blocks, images, files, /credential
//       /hash /host /doc reference chips, notices, highlight marks, and
//       wikiChecklistItem nodes.
export const WIKI_SCHEMA_VERSION = 1
