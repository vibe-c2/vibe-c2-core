# Wiki Import — Outline Markdown Export, Implementation Plan

Companion to [`wiki-outline-import.md`](wiki-outline-import.md). The spec answers *what* the importer does; this doc answers *how* and *in what order* we build it.

## 1. Architecture

The Go backend drives the import end-to-end. Markdown → Y.js binary conversion lives in the Hocuspocus sidecar, which already runs Node, already has `@hocuspocus/transformer` + `yjs` installed, and already exposes an internal Express HTTP server on `port + 1` (`hocuspocus/src/index.ts:108-126`) for the health check and disconnect API. We mount the new conversion route there.

```
┌────────────┐  multipart .zip   ┌──────────────────────┐
│  Frontend  │ ─────────────────►│  Go: import          │
│   dialog   │                   │  controller          │
└────────────┘                   │                      │
                                 │ • extract zip        │
                                 │ • validate           │
                                 │ • create folders     │
                                 │ • create empty docs  │
                                 │ • ingest attachments │
                                 │                      │
                                 │ for each doc:        │
                                 │   POST markdown ────►┌────────────────────────┐
                                 │   ◄──── Y.js bytes   │  Hocuspocus sidecar    │
                                 │                      │  (existing Express)    │
                                 │ • write Content +    │                        │
                                 │   ContentState       │  • markdown → PM JSON  │
                                 │                      │  • PM JSON → Y.Doc     │
                                 │ • return manifest    │  • encode update bytes │
                                 └──────────────────────┘└────────────────────────┘
```

**Why the sidecar owns conversion:**
- Already a Node process; no new infrastructure.
- `@hocuspocus/transformer` is the canonical encoder for our Y.js storage shape.
- Conversion runs in the same process that defines persistence semantics (`hocuspocus/src/persistence.ts`), so the encoding is guaranteed to match what the editor reads back.
- HMAC-signed internal channel pattern is already in place for the webhook (`hocuspocus/src/index.ts:42-47`).

**Why fully synchronous:**
- No empty-content edit window — every imported document is born with `ContentState` populated.
- One request → fully built `import/<timestamp>` subtree. Failures roll back at the per-doc level (skip + report) or at the request level (the `<timestamp>` parent is the natural cleanup unit).
- Frontend collapses to a thin upload-and-progress dialog with no markdown, schema, Y.js, or Hocuspocus knowledge.

## 2. Phase Plan

Three phases, each independently mergeable.

### Phase 1 — Sidecar: markdown → Y.js conversion endpoint

**Goal:** the sidecar exposes `POST /internal/markdown-to-yjs` on its existing Express server, accepts markdown, returns the binary Y.js update.

**New files in `hocuspocus/src/`:**

- **`wiki-schema.ts`** — minimal `prosemirror-model.Schema` mirroring exactly the node types our TipTap editor uses. Hand-transcribed from `frontend/src/components/wiki/wiki-editor.tsx:102-200`.
  - Standard nodes: `doc`, `paragraph`, `heading` (lvl 1–6), `text`, `bulletList`, `orderedList`, `listItem`, `taskList`, `taskItem`, `blockquote`, `horizontalRule` (`variant`), `codeBlock` (`language`, `wrap`), `image` (`src`, `alt`, `width`, `height`), `hardBreak`, `table`, `tableRow`, `tableHeader`, `tableCell`.
  - Custom nodes: `wikiNotice` (`variant: "info" | "success" | "warning" | "tip"`), `wikiFile` (`fileId`, `filename`, `size`, `mimeType`).
  - Marks: `bold`, `italic`, `code`, `strike`, `link` (`href`).
  - Top-of-file comment: *"This schema MUST stay in sync with `frontend/src/components/wiki/wiki-editor.tsx` extensions. Adding/changing a node there requires updating this file."*

- **`markdown-parser.ts`** — wraps `prosemirror-markdown.MarkdownParser` with our schema and custom markdown-it rules:
  - `:::variant ⏎ … ⏎ :::` → `wikiNotice` (markdown-it container plugin, four labels).
  - `![](url " =WxH")` → `image` with `width`/`height` parsed from the title hint, `title` cleared.
  - `[label size](url)` where url matches `/api/v1/wiki/files/<uuid>` → `wikiFile`. Label split into `(filename, size)`; `mimeType` sniffed from extension.
  - Code fence: language preserved, `wrap` always `false`.
  - Horizontal rule: `variant: "line"`.
  - Everything else: `prosemirror-markdown` defaults.
  - **Parser invariant — graceful degradation:** the parser MUST NEVER fail on unrecognized syntax and MUST NEVER emit a node type the schema doesn't define. Anything it can't classify (unknown `:::variant`, future custom block, attribute the schema doesn't carry) degrades to a plain `paragraph` with the inner text content preserved. This bounds drift risk: a new editor node added without updating the sidecar produces a styling regression on import, never lost content. Test: feed `:::danger ⏎ x ⏎ :::` and assert the output is a paragraph containing `x`.

- **`markdown-to-yjs.ts`** — thin orchestrator:
  ```ts
  export function markdownToYjsUpdate(markdown: string): Uint8Array {
    const pmDoc = parseOutlineMarkdown(markdown);
    const ydoc = TiptapTransformer.toYdoc(pmDoc.toJSON(), "default", schema);
    return Y.encodeStateAsUpdate(ydoc);
  }
  ```
  Passing the bare `Schema` to `TiptapTransformer.toYdoc` avoids importing `@tiptap/core` on the sidecar.

- **`internal-api.ts`** — mounts the route on the existing Express app:
  ```
  POST /internal/markdown-to-yjs
  Header:  X-Internal-Signature-256: sha256=<hmac of body, secret=HOCUSPOCUS_WEBHOOK_SECRET>
  Body:    { "markdown": "..." }   (application/json, ≤1 MB)
  → 200 application/octet-stream  (Y.js update bytes)
  → 400 invalid signature / oversized / malformed JSON
  ```
  HMAC verification mirrors the webhook signing pattern at `index.ts:42-47`. **The shared secret is the existing `HOCUSPOCUS_WEBHOOK_SECRET`** (locked in via dialog) — same secret signs both directions; the distinct header name (`X-Internal-Signature-256` vs `X-Hocuspocus-Signature-256`) keeps direction unambiguous.

**Modified file:**
- `hocuspocus/src/index.ts` — one-line wire-up: `setupInternalApi(app)` next to the existing `setupDisconnectApi(app, server)` at line 110.

**New deps in `hocuspocus/package.json`:**
- `prosemirror-model`
- `prosemirror-markdown`
- `markdown-it` (transitively via `prosemirror-markdown` but pin explicitly)
- `markdown-it-container`

No new dev deps.

**Tests** (`hocuspocus/src/__tests__/markdown-to-yjs.test.ts`):
- Round-trip: markdown → bytes → `Y.applyUpdate(new Y.Doc(), bytes)` → re-derive markdown via the same `extractTextFromFragment` used in `persistence.ts:199-209` → equality.
- Each Outline-flavored construct from `wiki-outline-import.md` §5.2 produces the expected ProseMirror JSON before encoding. Source-of-truth fixture: `local-outline/test-export.markdown.zip`.
- Graceful-degradation: unknown `:::variant` and unknown nodes don't fail and don't lose text content.

### Phase 2 — Backend Go: helpers, parser, orchestrator, controller

**Phase 2a — extract attachment-upload helpers:**
- `core/pkg/controller/wiki_image_controller.go` — extract `ingestImage(ctx, op, doc, callerUID, body io.Reader, declaredName, declaredSize) (*models.WikiImage, error)` from inside `Upload(c)`. `Upload` becomes a thin gin wrapper.
- `core/pkg/controller/wiki_file_controller.go` — same shape for `ingestFile`. Keep `sanitizeUploadFilename`, SHA256, MIME deny-list inside the helper.
- Tests: extend `wiki_file_controller_test.go` with table-driven cases covering the helper directly.

**Phase 2b — new `core/pkg/wikiimport/` package:**
- `parser.go` — pure functions; opens `*zip.Reader`, walks Outline's parallel-folder convention, returns `ParsedExport{ Collections: []Collection{ Name, Documents: []Doc{ Title, Emoji, BodyMarkdown, Children, AttachmentRefs } }, AttachmentBlobs: map[zipPath]*zip.File }`. Multi-collection zips produce one `Collection` per top-level zip folder.
- `parser_test.go` — uses `local-outline/test-export.markdown.zip` directly as the canonical fixture.
- `hocuspocus_client.go` — HMAC-signing HTTP client for `POST /internal/markdown-to-yjs`. Reads `HOCUSPOCUS_INTERNAL_URL` and the existing `HOCUSPOCUS_WEBHOOK_SECRET` from env.
- `orchestrator.go` — given the parsed tree + caller + operation + `hocuspocusClient`, runs the create-folders → create-docs → ingest-attachments → seed-yjs sequence. Returns a manifest.
- `orchestrator_test.go` — integration test against test mongo + S3 + a fake Hocuspocus HTTP server (`httptest`).

**Phase 2c — controller + route:**
- `core/pkg/controller/wiki_import_controller.go` — gin handler. Streams the multipart body to a temp file (`os.CreateTemp`), enforces zip-size cap, hands off to `wikiimport.Run(...)`.
- `core/pkg/app/router.go:~129` — register `wikiGroup.POST("/import/outline", wikiImportCtrl.UploadOutlineExport)`. Inherits JWT + CSRF.
- `core/pkg/app/app.go` — wire the new controller into the App struct.

**Endpoint contract:**

```
POST /api/v1/wiki/import/outline?operationId=<uuid>
Content-Type: multipart/form-data; field "file": .zip

→ 200 OK
{
  "importParentId": "<uuid>",
  "timestampParentId": "<uuid>",
  "report": {
    "totalDocs": 12,
    "createdDocs": 11,
    "skippedDocs": 1,
    "imagesIngested": 4,
    "filesIngested": 1,
    "skipped": [{ "path": "deep/.../x.md", "reason": "depth_exceeded" }],
    "warnings": [{ "path": "long-title.md", "reason": "title_truncated" }]
  }
}
```

**Orchestrator sequence (Go):**
1. Authorize: `authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleOperator)` (matches `wiki_document_resolver.go:122-128`).
2. Read multipart, enforce zip-size cap (200 MB default), stream to temp file, defer cleanup.
3. Open with `archive/zip.OpenReader`. Validate paths (no `..`, no `/`-prefix), uncompressed-size cap (1 GB), document-count cap (5,000).
4. `wikiimport.Parse(zip)` → `ParsedExport`.
5. Lookup-or-create the singleton `import` parent. Once created, never auto-deleted; reused by future imports. v1 uses a process-local mutex keyed on `operationID`; follow-up adds the `(operation_id, parent_document_id, title_lower)` Mongo unique index.
6. Create `<timestamp>` parent under `import`. Title = `time.Now().UTC().Format(time.RFC3339)`. Always fresh.
7. Per collection in `ParsedExport.Collections`: create a per-collection parent under `<timestamp>/`, named after the collection's top-level zip folder. Nesting budget: `import/<timestamp>/<collection>/...` consumes 3 of the 10 depth slots, leaving 7 for imported content.
8. DFS each collection's tree, parents-first. Per document:
   - Validate caps (title ≤ 200, body ≤ 1 MB, depth ≤ 10). Skip-with-reason or truncate-with-warning per the spec.
   - Sort siblings case-insensitively by filename; assign fresh fractional `SortOrder` values.
   - Create `WikiDocument` with empty `Content`/`ContentState` placeholder so attachments have an owner doc to scope to.
9. For each `(zipPath, ownerDocID)` referenced by any kept doc:
   - Open zip entry as a stream; call `ingestImage` or `ingestFile`. The same blob may be uploaded N times across N owners — accepted (blob layer dedupes by SHA256 if configured).
   - Record `(zipPath, ownerDocID) → newAttachmentID`.
10. For each kept document:
    - Rewrite body markdown: `uploads/...image.png` → `/api/v1/wiki/images/<newId>` and `uploads/...file.pdf` → `/api/v1/wiki/files/<newId>` (sidecar's parser recognizes the latter prefix and emits `wikiFile` nodes).
    - Call `hocuspocusClient.MarkdownToYjs(rewrittenMd)` → `Uint8Array` bytes.
    - `docRepo.UpdateContent(docID, content=rewrittenMd, contentState=bytes, contentStateAt=now)`. Single Mongo write per doc; both fields atomic.
11. Build response payload, return.

No background jobs; no scratch S3 prefix; no separate "promote attachment" or "finalize import" routes. Temp zip removed via `defer`.

### Phase 3 — Frontend: thin upload + progress dialog

The frontend's job collapses dramatically. No markdown parsing, no Y.js handling, no per-doc Hocuspocus connections.

**New files:**
- `frontend/src/hooks/use-import-outline.ts` — TanStack mutation around `POST /api/v1/wiki/import/outline`. Returns the manifest.
- `frontend/src/components/wiki/import-outline-dialog.tsx` — modeled on `frontend/src/components/wiki/create-wiki-document-dialog.tsx`. File input (`.zip`) + submit + progress + report.

**Modified files:**
- `frontend/src/components/wiki/wiki-tree-sidebar.tsx` — "Import from Outline" entry in the sidebar's "+" menu, gated by the operator-role check pattern.

**No new npm deps.**

**Behavior:**
- "Uploading…" while the POST is in flight (the request is doing all the work).
- On success: invalidate the wiki tree query; show the report ("Imported 11 documents, skipped 1, ingested 4 images and 1 file. Open import/2026-04-26T12:00:00Z.").
- On failure: error banner with retry; if response includes a partial manifest, link to the timestamp folder so the user can soft-delete it.

## 3. Critical Files

| Layer | File | Reason |
|---|---|---|
| Sidecar | `hocuspocus/src/index.ts:108-126` | Existing Express server — new route mounts here |
| Sidecar | `hocuspocus/src/persistence.ts:135-191` | Reference for the `default` Y.XmlFragment field name and storage shape |
| Sidecar | `hocuspocus/src/index.ts:42-47` | HMAC pattern to copy for the internal route |
| Sidecar | `hocuspocus/package.json` | Add `prosemirror-model`, `prosemirror-markdown`, `markdown-it-container` |
| Backend | `core/pkg/controller/wiki_image_controller.go:90` | Extract `ingestImage` helper |
| Backend | `core/pkg/controller/wiki_file_controller.go:115` | Extract `ingestFile` helper |
| Backend | `core/pkg/resolver/wiki_document_resolver.go:122-258` | Reference for auth gate + caps + the doc-create pipeline the orchestrator mirrors |
| Backend | `core/pkg/repository/wiki_document_repository.go` | Add `FindRootByTitle`/`UpdateContent` if not present |
| Backend | `core/pkg/blob/blob.go:20-33` | `ObjectStore` interface used by `ingestImage`/`ingestFile` |
| Backend | `core/pkg/app/router.go:116-129` | Register `POST /wiki/import/outline` next to existing wiki routes |
| Frontend | `frontend/src/components/wiki/create-wiki-document-dialog.tsx` | Template for the new import dialog |
| Frontend | `frontend/src/components/wiki/wiki-tree-sidebar.tsx` | Where the "Import from Outline" menu entry goes |
| Frontend | `frontend/src/components/wiki/wiki-editor.tsx:102-200` | The TipTap extension list the sidecar's schema must mirror |
| Fixture | `local-outline/test-export.markdown.zip` | Canonical test fixture for sidecar + backend tests |

## 4. Dependencies

- **Sidecar (new):** `prosemirror-model`, `prosemirror-markdown`, `markdown-it-container`. `@hocuspocus/transformer`, `yjs`, `express` already installed.
- **Backend Go:** stdlib only (`archive/zip`, `os`, `io`, `crypto/hmac`, `net/http`).
- **Frontend:** none.

**Env vars:** add `HOCUSPOCUS_INTERNAL_URL` (e.g. `http://hocuspocus:1235`) to the Go service. The HMAC for the new internal route reuses the existing `HOCUSPOCUS_WEBHOOK_SECRET`. Header on the new route is `X-Internal-Signature-256`.

## 5. Verification

- **Sidecar unit:** `markdown-to-yjs` round-trip — every node from `wiki-outline-import.md` §5.2 encodes and decodes correctly. Cover `:::info`/`success`/`warning`/`tip`, image-with-size-hint, file-attachment-link, code-fence-with-language, hr, table, task list. Plus the graceful-degradation test for unknown variants.
- **Sidecar integration:** spin up the sidecar in test mode, POST a sample markdown, decode the returned bytes with `Y.applyUpdate(new Y.Doc(), bytes)`, assert the resulting `getXmlFragment("default")` matches expectations.
- **Backend unit (parser):** parse `local-outline/test-export.markdown.zip` and assert tree shape, title/emoji extraction, attachment-ref discovery.
- **Backend unit (helpers):** behavior parity for `ingestImage`/`ingestFile` vs. their controller wrappers.
- **Backend integration:** stand up test mongo + blob + a fake sidecar (httptest), run the full orchestrator on the fixture; assert: `import` parent created once, `<timestamp>` parent created per call, every doc has populated `Content` AND `ContentState`, attachments scoped to correct `DocumentID`.
- **Backend end-to-end:** POST the fixture against the gin router, assert response shape and side effects. Cover 403 (viewer), 413/400 (oversized/malformed), 502 (sidecar unreachable), 200 happy path.
- **Frontend Playwright:** golden path — user uploads `test-export.markdown.zip`, dialog completes, the `import/<timestamp>` subtree appears in the sidebar, opening one of the imported docs renders the expected content (notice block, code, image, attachment link).
- **Manual:** import the fixture into a fresh operation; click into each doc; verify rendering matches the spec's mapping table; move one doc to root via the existing move dialog.

## 6. Risks and Mitigations

- **Schema drift between sidecar and frontend.** Hand-transcribed schema in `hocuspocus/src/wiki-schema.ts`. Mitigation: load-bearing comment + sidecar test exercising every node listed in `wiki-editor.tsx`, plus the parser's plain-paragraph fallback so unknown nodes degrade gracefully instead of failing or losing text. Follow-up: extract a shared schema package once import is in production.
- **Sidecar availability.** Import requires the sidecar. Mitigation: surface a clear `502 Sidecar unavailable` and let the user retry; failed `<timestamp>` folder is soft-deletable.
- **Markdown-it container plugin edge cases.** Nested notice blocks, blank lines, etc. Mitigation: integration tests against the real fixture; new regression tests as customer exports surface quirks.
- **Concurrent imports racing on the singleton `import` parent.** Process-local mutex on `operationID` for v1; durable Mongo unique index follow-up.
- **Zip-bomb / path traversal.** Uncompressed-size cap, document-count cap, strict path validation in the parser.

## 7. Sequencing & Effort

- Phase 1 (sidecar): 1.5 days. Schema transcription is the bulk.
- Phase 2a (extract helpers): 0.5 day.
- Phase 2b (parser + orchestrator): 1.5 days.
- Phase 2c (controller + route): 0.5 day.
- Phase 3 (frontend dialog): 0.5 day.

Total ~4.5 days for v1.

## 8. Resolved Decisions

Settled via dialog before coding started:

- **Schema-sharing strategy** — hand-transcribe in the sidecar; parser falls back to plain paragraph for unknown nodes.
- **Multi-collection exports** — preserved as per-collection parents under `<timestamp>/`.
- **Holding-pen cleanup** — `import/` is created once per operation and lives forever, even when empty.
- **Internal auth** — reuse `HOCUSPOCUS_WEBHOOK_SECRET`. Header name (`X-Internal-Signature-256`) disambiguates direction.

## 9. Still Open

Smaller decisions; settle during code review:

- **Sidecar transport.** HTTP is the default; alternative is a Node child process spawned by Go. Ship HTTP unless there's an objection.
- **Holding-pen icon.** Suggested `package`.
- **Viewer visibility during import.** With a synchronous request, the visible window is short. Confirm whether viewers need any extra gating.
