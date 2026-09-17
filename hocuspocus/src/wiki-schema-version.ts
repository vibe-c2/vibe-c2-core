// The editor schema version this sidecar authors content at.
//
// Mirrors WIKI_SCHEMA_VERSION in
// frontend/src/components/wiki/wiki-schema-version.ts. Bump both together.
//
// Why anything server-side needs a version at all: persistence.ts refuses a
// write that both comes from a client older than the schema which authored the
// stored content AND shrinks the document. That guard exists for a browser tab
// left open across a deploy, which would silently prune node types its editor
// does not know about.
//
// Content this sidecar builds — from the markdown parser or the rebase route —
// is built against the current wiki-schema.ts, so it *is* current-schema
// content and must say so. Leaving it to default to 0 makes every server-side
// write look like a stale tab: any edit that removes something is discarded,
// on every document a person has ever edited, while the caller is told the
// edit succeeded.
export const WIKI_SCHEMA_VERSION = 1
