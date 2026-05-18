# Wiki Import — Outline Markdown Export

## 1. Overview

This spec describes how to import an Outline (getoutline.com) workspace export, in the **Markdown** export format, into a Vibe-C2 operation wiki.

The importer is **operation-scoped**: every import targets one specific operation, and every imported document is created as a `WikiDocument` under that operation. To keep imports isolated and reviewable, all imported documents land inside a temporary holding pen — `import/<import_timestamp>` — that the user can browse, edit, and gradually move into the operation root using the existing move dialog.

This is a one-way import. Outline-side updates do not propagate; re-importing the same export produces a fresh `<import_timestamp>` subtree, never a merge.

**Reference test fixture:** `local-outline/test-export.markdown.zip` (Outline 1.6.1, exportVersion 1).

## 2. Outline Markdown Export Format

The export is a `.zip` whose root contains exactly one folder per Outline collection. Inside each collection folder, every document is a `.md` file, and a document's children live in a sibling folder of the same name. Attachments live in an `uploads/` directory whose depth depends on the export type: a single-collection export places it at `<collection>/uploads/`, while a workspace export emits one `uploads/` directory inside each containing folder (e.g. `<collection>/<sub>/<sub2>/uploads/`). Markdown references the suffix `uploads/<userId>/<attId>/<filename>` regardless of where the directory actually sits in the zip; the importer keys the attachment map by that suffix so both layouts resolve.

### 2.1 Zip layout (from the test fixture)

```
test-export.markdown.zip
└── test/                                   ← collection name (folder)
    ├── test.md                             ← root document "test"
    ├── test2.md                            ← root document "test2"
    ├── test/                               ← children of the "test" document
    │   └── 1234.md                         ← child document "1234"
    └── uploads/
        └── {userId}/
            └── {attachmentId}/
                └── {originalFilename}      ← raw binary
```

There is **no manifest file** — no `metadata.json`, no `test.json`. The folder tree itself is the structural source of truth.

### 2.2 Hierarchy convention

A document with children is encoded as a `.md` file plus a folder of the same base name next to it:

| Filesystem | Meaning |
|---|---|
| `test/foo.md` | leaf document `foo` at root of collection |
| `test/foo.md` + `test/foo/` (folder) | document `foo` with children inside the `foo/` folder |
| `test/foo/bar.md` | document `bar` whose parent is `foo` |

There is no separate "collection root" document — the collection is just the outermost folder name.

### 2.3 Document title

The first line of every `.md` is `# Title`. Outline prepends the document emoji to the H1 when present:

- `# 😑 test` → emoji `😑`, title `test`
- `# test2` → no emoji, title `test2`
- `# 1234` → no emoji, title `1234`

Strategy: parse the H1 line, take the first grapheme cluster, classify as emoji vs. word boundary; if emoji, split into `(emoji, " ", rest)`. Strip the H1 line from the body before storing.

The `.md` filename is a slug derived from the title; do **not** rely on it for the human-readable title.

### 2.4 Sort order is not preserved

The Markdown export does **not** carry per-document fractional indices. Sibling order is whatever the filesystem returns. Vibe should sort siblings by filename (case-insensitive, locale-aware) at import time and assign fresh fractional `SortOrder` values in that sequence. This is a known fidelity loss vs. Outline's JSON export.

### 2.5 Per-document timestamps (optional)

Outline writes a JSON blob into the zip's per-file **file comment** on each `.md` entry, of the form `{"createdAt":"…","updatedAt":"…"}`. Most extractors ignore this. The importer **may** read these via the zip metadata (Go: `zip.File.Comment`) for display purposes, but should not block import if absent or malformed. It does not map to anything authoritative in our model — Vibe stamps `createdAt`/`updatedAt` at import time; the Outline timestamps can at most populate a manual backup label such as `"Imported from Outline (originally edited 2026-04-22)"`.

### 2.6 Markdown dialect quirks

Outline's Markdown is mostly CommonMark + GFM, with a few extensions and quirks the importer must handle:

#### Notice blocks

Wrapped in `:::variant` … `:::` fences. Variants observed: `info`, `success`, `warning`, `tip` — exact 1:1 with our `wikiNotice` extension.

```
:::info
info notice

next line
:::
```

Nested block content (paragraphs, lists, etc.) is allowed inside a notice. Empty trailing line before the closing `:::` is normal.

#### Images with size hint

```
![](uploads/{userId}/{attachmentId}/image.png " =763x367")
```

The image **title** carries a size hint as ` =WxH`. Extract `width=763`, `height=367`; drop the title or keep it empty. Alt text and caption are absent in the test fixture.

#### File attachments

```
[Roles & Responsibilities.pdf 2011979](uploads/{userId}/{attachmentId}/Roles%20&%20Responsibilities.pdf)
```

The link **label** is `<filename> <bytes>` (single space between). Treat the entire trailing numeric token as the size hint and the rest as the filename. The href is URL-encoded; decode before resolving on disk.

#### Code fences

Standard triple-backtick fences with language. The `wrap` attribute that Outline's JSON export carries is **lost** in Markdown — every imported code block defaults to `wrap=false`.

#### Horizontal rule

`---` only. Outline does not encode a `dashed` variant in Markdown; default everything to `variant=line`.

#### Other GFM features

Tables, task lists, ordered/unordered lists, blockquotes, inline code, bold, italic, strikethrough, links — all standard CommonMark + GFM, no transformation needed beyond standard parsing.

## 3. Vibe-C2 Target Model

Recap (full spec in [`docs/wiki-feature-spec.md`](wiki-feature-spec.md)):

- `WikiDocument` (`core/pkg/models/wiki_document.go`) is the only entity. Every document can have children. Tree is scoped by `OperationID`. Fields touched on import: `DocumentID`, `OperationID`, `ParentDocumentID`, `Title`, `Content`, `ContentState`, `Emoji`, `Color`, `Icon`, `SortOrder`, `CreatedByID`.
- `WikiImage` and `WikiFile` are document-scoped attachments. Binaries land in S3 (SeaweedFS gateway). REST upload endpoints: `POST /api/v1/wiki/images`, `POST /api/v1/wiki/files`.
- The editor (`frontend/src/components/wiki/wiki-editor.tsx`) supports: paragraph, heading, list, ordered list, task list, blockquote, code block (with `wrap` attr), horizontal rule (`line`/`dashed`), table, image, `wikiFile`, `wikiNotice` (`info`/`success`/`warning`/`tip`).
- Resolver caps from `core/pkg/resolver/wiki_document_resolver.go`: title ≤ 200 chars, content ≤ 1 MB, nesting depth ≤ 10.

### Y.js content-state contract

`hocuspocus/src/persistence.ts` is the source of truth for document body. The Go backend writes the derived `Content` (Markdown) but **must never** leave `ContentState` (Y.js binary) empty when there is content to preserve, because:

1. User opens an imported doc → Hocuspocus `fetch()` returns `null` → editor opens an empty `Y.Doc`.
2. On the first edit, Hocuspocus `store()` derives Markdown from the empty `Y.Doc` and overwrites `Content` with `""`.
3. **Imported content is silently destroyed.**

The importer must seed `ContentState` from the Markdown body before the document is first opened. See §5.4.

## 4. Import Target Layout

All imports for an operation land under a singleton holding-pen path:

```
<operation root>
└── import/                                 ← singleton WikiDocument; created lazily on first import
    ├── 2026-04-26T11:54:32Z/               ← per-import WikiDocument; one per import run
    │   └── test/                           ← original Outline collection folder
    │       ├── test                        ← imported documents preserve their original tree
    │       │   └── 1234
    │       └── test2
    └── 2026-04-30T08:12:01Z/
        └── …
```

Rules:

- **`import` parent**: lazily created on the first import for an operation. Title `import`, `Icon: "package"` (or similar — pick at implementation time). Reused for every subsequent import in the same operation.
- **`<import_timestamp>` parent**: created per import run. Title is an ISO-8601 UTC timestamp with no fractional seconds (e.g. `2026-04-26T11:54:32Z`). Always created fresh — never reused, never merged.
- **Inside the timestamp folder**: preserve the Outline collection folder name as the next-level parent, then the original tree below it. This keeps multi-collection imports unambiguous.
- **Move semantics**: users move imported documents out via the existing move dialog (`move-wiki-document-dialog.tsx`). Once empty, the timestamp folder and the `import` parent can be soft-deleted manually; the importer does not auto-clean.
- **Import depth**: the `import/<timestamp>/<collection>/…` prefix consumes 3 levels of the 10-level cap. Imports of trees deeper than 7 levels under a collection root must be rejected with a clear error and a per-document skip list.

## 5. Mapping (Outline Markdown → Vibe Wiki)

### 5.1 Documents

| Outline | Vibe `WikiDocument` field | Source / transform |
|---|---|---|
| `# 😑 Title` (H1) | `Title`, `Emoji` | Strip leading `# `; split first grapheme cluster as emoji if applicable; rest is `Title`; trim. |
| `.md` body (sans H1) | `Content`, `ContentState` | Markdown → Y.Doc via TipTap schema; binary-encode for `ContentState`; round-trip back to Markdown for `Content` to keep them coherent. |
| folder structure | `ParentDocumentID` | DFS walk; each `.md` parents to the document represented by the enclosing same-named folder, or to the per-import `<timestamp>` doc at top level. |
| filesystem order | `SortOrder` | Sort siblings case-insensitively by filename; assign fresh fractional indices in that order. |
| zip file comment `createdAt`/`updatedAt` | not stored on `WikiDocument` | Optional: include in the import-report and/or in a manual backup description. |
| (none) | `CreatedByID` | The importing user's id. |
| (none) | `OperationID` | The operation selected in the import dialog. |
| (none) | `Color` | Empty. |
| (none) | `Icon` | Empty (the H1 emoji goes into `Emoji`, not `Icon`). |

Title overflow: if the H1 exceeds 200 chars, truncate to 197 + `"…"` and surface a warning in the import report.

### 5.2 Body markdown nodes

| Outline Markdown | TipTap node (Vibe) | Notes |
|---|---|---|
| paragraph, heading (`##`–`######`), bullet/ordered list, task list (`- [ ]`), blockquote, bold, italic, strikethrough, inline code, link, table | identical | StarterKit + GFM extensions cover. |
| ```` ```lang … ``` ```` | `codeBlock` `{language, wrap: false}` | `wrap` is always `false` (lost in markdown export). |
| `---` | `horizontalRule` `{variant: "line"}` | Variant info lost; default `line`. |
| `:::info ⏎ … ⏎ :::` | `wikiNotice` `{variant: "info"}` | Same for `success`, `warning`, `tip`. Inner content parsed recursively. |
| `![](uploads/…/img.png " =WxH")` | `image` `{src, width, height}` | After uploading the binary as `WikiImage` and rewriting `src`. |
| `[name size](uploads/…/file.pdf)` | `wikiFile` `{fileId, filename, size, mimeType}` | After uploading the binary as `WikiFile`. |
| Outline-only nodes (math, embed, mention, video) | preserved as a fenced `info` notice carrying the original Markdown snippet | None of these appear in the test fixture; treat as best-effort forensic preservation. |

### 5.3 Attachments

For every `uploads/{userId}/{attachmentId}/<filename>` referenced in any document body:

1. Read the binary from the zip.
2. Determine kind from MIME type (sniff or use the upload route's existing classification): `image/*` → `WikiImage`, anything else → `WikiFile`.
3. Create the per-document attachment record by calling the same code path the existing upload handlers use (`core/pkg/controller/wiki_image_controller.go`, `core/pkg/controller/wiki_file_controller.go`) — including SHA256 dedupe, MIME deny-list, filename sanitization.
4. Capture the new attachment id; rewrite the markdown reference before that document's `Content`/`ContentState` is finalized:
   - Image: `src` becomes `/api/v1/wiki/images/{newId}` (or whatever the existing render path is).
   - File: emit a `wikiFile` node with `fileId={newId}`, `filename`, `size`, `mimeType`.

If the same `uploads/.../<id>/...` path is referenced from two documents in the export, upload it twice (once per owning document) — Vibe attachments are scoped per `DocumentID`, so deduplication across documents is **not** done. SHA256 dedupe at the blob level still kicks in inside the storage layer.

### 5.4 Y.js content seeding

Markdown → Y.js binary is a JS-side operation (`@hocuspocus/transformer`). Two implementation paths, pick at code time; the spec only requires the behavior:

- **A. Frontend orchestration.** After backend has staged attachments and returned a manifest, the frontend walks the tree, calls `createWikiDocument`, opens a short-lived Hocuspocus connection per doc, applies the transformed TipTap doc as initial state, and disconnects. Hocuspocus `store()` writes both `content_state` and derived `content` atomically.
- **B. Node-side helper.** A backend route shells out to (or RPCs into) a Node helper that uses `@hocuspocus/transformer.prosemirrorJSONToYDoc` + `Y.encodeStateAsUpdate`, returns the binary, and the Go backend writes both `content_state` and `content` directly.

Either path satisfies the constraint. **Whichever is chosen, the importer must not commit a `WikiDocument` with non-trivial Markdown in `Content` and a `nil`/empty `ContentState`** — the next user edit would erase the import.

## 6. Authorization

- Import requires the caller to have an operation role of `operator` or `admin` (same gate as `createWikiDocument`).
- Viewers cannot import.
- The importing user becomes `CreatedByID` on every imported document. Outline's own author fields are not honored (no Outline ↔ Vibe user mapping exists).

## 7. Limits and Failure Modes

- **Per-document caps** (from the resolver): title ≤ 200 chars, body Markdown ≤ 1 MB, depth ≤ 10. Documents that violate any cap are skipped, not aborted; a per-document failure list is surfaced in the import report.
- **Whole-import caps** (recommend, pick numbers at code time): zip ≤ 200 MB, ≤ 5,000 documents, ≤ 5,000 attachment files. Fail fast before extracting if metadata indicates a violation.
- **Partial-import semantics**: the per-import `<timestamp>` folder is the natural unit of cleanup. If the import is aborted mid-flight, the user can soft-delete the entire `<timestamp>` subtree from trash and retry. The importer does **not** auto-rollback — created documents stay in place, marked under the failed timestamp, with the import report listing what succeeded.
- **Resumability**: not supported in v1. A failed import is a "delete and retry" workflow.
- **Concurrent imports** for the same operation: serialize on the singleton `import` parent's creation (e.g. lock on `OperationID`); after the parent exists, multiple `<timestamp>` children can be created in parallel without conflict.

## 8. Pipeline (Reference Flow)

1. **Submit.** User picks a `.zip` and an operation in the import dialog. Frontend POSTs to a new endpoint (e.g. `POST /api/v1/wiki/import/outline?operationId=…`).
2. **Validate.** Backend verifies zip structure: at least one top-level collection folder, no path traversal (`../`), within size/count caps. Reject with a structured error otherwise.
3. **Stage attachments.** Walk every `uploads/.../*` entry, sniff content type, validate against the existing MIME deny-list, sanitize filename, push to a scratch S3 prefix tagged with the import id. (Final per-document `WikiImage`/`WikiFile` records are created during step 5.)
4. **Create holding-pen parents.** Lazily create the `import` doc (one per operation, ever) and the `<timestamp>` doc (one per import run) using `createWikiDocument`.
5. **Walk and create documents.** DFS from each collection folder, creating docs in parent-first order. Per document: parse markdown → TipTap doc → resolve attachment links to fresh `WikiImage`/`WikiFile` records → seed `Content` + `ContentState` (per §5.4).
6. **Cleanup.** Drop the scratch S3 prefix once every attachment has been promoted into a per-document record (or after a TTL on failure).
7. **Report.** Return a structured summary: documents created, documents skipped (with reasons), attachments imported, attachments rejected, the path to the holding-pen folder.

## 9. Out of Scope (v1)

- Multiple imports merging into a single tree (always lands under a fresh timestamp).
- Outline author / user ID mapping (no shared identity).
- Restoring documents that were trashed in Outline (the markdown export omits them anyway).
- Outline JSON-export-only fields: per-doc fractional sort order, code-block `wrap` flag, hr `dashed` variant, sharing/commenting/permission flags.
- Round-tripping: Vibe → Outline export is a separate spec.
- Per-document version history (Outline does not export it; Vibe's backup story starts after import).

## 10. Open Questions

These are flagged for the implementation session to resolve before coding:

- **Markdown → TipTap parser.** Use an existing library (`marked`, `remark`, TipTap's `getMarkdown()` companion) or hand-roll? Notice blocks (`:::info`) need a custom rule regardless.
- **Image size hint syntax.** Outline's ` =WxH` inside the image title is non-standard. Confirm the parser handles it without choking, or strip and re-attach as attributes.
- **Attachment label parsing.** The `[Filename 2011979](…)` convention conflates filename + size. Decide whether to keep both, drop the size, or surface it as a tooltip in the rendered link.
- **Holding-pen icon / color.** Pick representations for the `import` parent and `<timestamp>` children that are visually distinct from real wiki content.
- **Concurrency.** Confirm the locking model on the singleton `import` parent — likely a Mongo upsert with a uniqueness constraint on `(OperationID, Title='import', ParentDocumentID=null)` is enough, but worth verifying against the existing repository.
- **Multi-collection exports.** The test fixture has one collection, but Outline supports workspace-wide exports. Confirm whether each top-level folder maps to a separate `<collection_name>` parent under `<timestamp>/`, or whether all collections are flattened together.
