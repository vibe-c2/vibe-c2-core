# Wiki Transfer — Export and Import of Trees and Subtrees

Design document. Supersedes the export half of
[`wiki-outline-import.md`](wiki-outline-import.md); the Outline import spec
stays valid for what it describes (foreign Markdown zips) and is narrowed by
this document to exactly that role.

Status: **implemented** (2026-09-12) through Phase 3. Sections marked
**Decision** are settled; §9 records how the open questions were resolved.
Where the implementation departs from the original proposal the text below
has been updated to describe what shipped.

---

## 1. Problem

Today one format — an Outline-flavoured Markdown zip — serves two jobs that
pull in opposite directions:

| Job | What it needs | What the Markdown zip gives |
|---|---|---|
| Bring foreign content in (Outline, Obsidian, plain `.md`) | tolerant parsing, best-effort mapping | good fit |
| Move a Vibe subtree between operations or installations | lossless, every ID rewired, indexes intact | poor fit |

The second job is the one operators actually reach for ("export this
engagement's subtree, import it into next year's operation") and it is where
the current code fails. Concretely, as of commit `c3e6e03`:

1. **Imported attachments are invisible to the garbage collector.** The
   importer writes only `content`, `content_state`, `content_state_at`,
   `last_updated_at` (`wikiimport/orchestrator.go`, `processDocs`). It never
   writes `image_references` / `file_references`, which are the *only*
   liveness signal the sweepers use (`wiki/image_sweeper.go`). The sweepers
   ship disabled and dry-run, so no bytes have been lost yet. Arming them
   would delete every imported attachment older than the grace period. The
   same gap leaves `references`, `host_references`, `hash_references`,
   `credential_references` and the checklist counters empty, so imported
   pages have no backlinks and no checklist progress until someone opens and
   edits each one.
2. **Document chips are not remapped.** `[page](vibe://doc/<id>)` keeps the
   source ID; inside an exported subtree the target page now has a new ID,
   so every internal link breaks. Host and hash chips keep IDs from the
   source operation. Only credentials have a reconcile pass.
3. **The format cannot carry Vibe state.** Lost on the round trip: template
   flag and source template, exact sibling order (approximated by `001-`
   filename prefixes, capped at 999), timestamps, authorship, table cells
   with block content (dropped by the serializer), code-block wrap, rule
   variant. Icon and colour ride in an ad-hoc HTML comment. Every new field
   has meant a matched regex on three sides (Go export, Go import, sidecar).
4. **Import always lands in a holding pen.** `import/<timestamp>/<slug>/`,
   never at a chosen parent. Reparenting is manual.
5. **Three Markdown renderers with three link policies.** Zip export writes
   `uploads/<docId>/<attId>/…`, the single-page export writes absolute
   origin URLs, the MCP surface writes a third form.
6. **Everything runs inside one HTTP request.** Export streams the zip while
   rendering, so a failure after the first byte can only be reported inside
   the zip. Import holds a 5-minute browser timeout and a 200 MiB body cap.
   Concurrent imports serialise on a process-local mutex.
7. **No round-trip test.** Three export and four import orchestrator tests;
   nothing exports a tree and imports the result.

## 2. Goals and non-goals

**Goals**

- G1. A Vibe subtree exported and imported into any operation on any
  installation reproduces the same pages, order, chips, attachments and
  checklist state, with every ID rewired and every inverse index populated.
- G2. Foreign Markdown import keeps working and gets the same index
  guarantee as G1 (fixes problem 1 for both paths).
- G3. Import can target a chosen parent, or the root, in the target
  operation. The holding pen becomes an option, not the only outcome.
- G4. Export and import run as jobs with observable status; no request
  timeouts bound the size of a transfer.
- G5. One place defines how a page is serialised for each audience. Adding
  a node type touches the sidecar schema and at most one Go file.

**Non-goals**

- Merging into an existing subtree (update-in-place by matching IDs).
  Every import creates new documents. A later phase may add "skip pages
  already imported from this bundle" using the origin record in §4.3.
- Version history. Backups are not part of a bundle.
- Cross-installation user mapping. `createdById` becomes the importer.
- Live sync between installations.

## 3. Shape of the solution

Two formats, one pipeline.

```
                       ┌──────────────────────────┐
  Markdown zip  ──────►│  Foreign importer         │──┐
  (Outline, .md)       │  (parse → markdown)       │  │  per page:
                       └──────────────────────────┘  │  markdown ─► sidecar ─► yjs + projection
                                                     ▼
                       ┌──────────────────────────┐  ┌───────────────────────────────┐
  Vibe bundle   ──────►│  Bundle importer          │─►│  Materialiser                 │
  (.vibewiki.zip)      │  (manifest → id map)      │  │  create docs, ingest blobs,   │
                       └──────────────────────────┘  │  rebase yjs via sidecar,      │
                                                     │  write doc + all indexes,     │
                                                     │  publish events, report       │
                                                     └───────────────────────────────┘
```

**Decision.** The Markdown zip is the *foreign* format. It is what we accept
from other tools and what we hand to other tools. It stays lossy and we stop
extending it with Vibe-only metadata; the `vibe:meta` comment and the
credential fences are grandfathered, nothing else gets added.

**Decision.** The Markdown export is written for editors that know nothing
about Vibe (Obsidian, VS Code, GitHub), not for re-import — the bundle is
the round-trip format. Nothing in the archive uses the `vibe://` scheme:
a page chip becomes `[Title](relative/path.md)` pointing at the page's
own file in the zip (plain title text when the page is outside the
export), host and hash chips become their hostname or value as text, and
attachments are linked by their real relative path (`../uploads/…`) so
an unpacked zip previews correctly. The foreign importer tolerates such
an archive as ordinary Markdown: relative page links stay links, `../`
prefixed upload paths still resolve to their blobs.

**Decision.** The Vibe bundle is the *native* format. It carries
`content_state` bytes verbatim plus a manifest, and every ID the content
references. Lossless by construction: the bytes that come out are the bytes
the editor wrote.

**Decision.** Both formats feed one materialiser. The materialiser is the
only code that creates documents during an import, and it always writes the
full projection (content, all six reference arrays, checklist counters,
schema version). This is what closes problem 1 for both paths.

## 4. The Vibe bundle

File extension `.vibewiki.zip`. A zip so operators can look inside; no
custom container.

### 4.1 Layout

```
manifest.json
documents/<sourceDocId>.ystate        raw content_state bytes
documents/<sourceDocId>.md            human-readable rendering, informational only
attachments/<sourceAttId>             blob bytes, filename in manifest
credentials.json                      optional, see §4.4
REPORT.json                           what the exporter skipped and why
```

The `.md` copies exist so a bundle is inspectable and greppable. The
importer never reads them. **Decision:** they are emitted; a
`--no-markdown` option is not offered in v1 (they cost one sidecar call per
page, which the exporter already pays today).

### 4.2 Manifest

```jsonc
{
  "format": "vibe-wiki-bundle",
  "formatVersion": 1,
  "bundleId": "uuid",                    // fresh per export run
  "exportedAt": "2026-09-12T10:00:00Z",
  "source": {
    "installationId": "uuid",            // from a new stable value in settings; see Open O1
    "operationId": "uuid",
    "operationName": "ACME 2026",
    "scope": "subtree" | "tree",
    "rootDocumentId": "uuid|null"
  },
  "schemaVersion": 1,                    // WIKI_SCHEMA_VERSION the content_state was written under
  "documents": [
    {
      "id": "uuid",
      "parentId": "uuid|null",           // null = top of the exported scope
      "title": "…", "emoji": "…", "icon": "…", "color": "…",
      "sortOrder": "…",                  // verbatim fractional index
      "isTemplate": false,
      "sourceTemplateId": "uuid|null",   // only meaningful if that id is in this bundle
      "createdAt": "…", "updatedAt": "…",
      "contentStateFile": "documents/<id>.ystate",
      "contentStateBytes": 12345,
      "references": {                    // as stored on the source document
        "documents": ["uuid"], "hosts": ["uuid"], "hashes": ["uuid"],
        "credentials": ["uuid"], "images": ["uuid"], "files": ["uuid"]
      },
      "checklist": { "total": 3, "required": 2, "answered": 1 }
    }
  ],
  "attachments": [
    {
      "id": "uuid", "kind": "image" | "file",
      "ownerDocumentId": "uuid",
      "filename": "…", "contentType": "…", "sizeBytes": 1, "sha256": "…",
      "file": "attachments/<id>"
    }
  ],
  "hosts":  [ { "id": "uuid", "hostname": "…", "ip": "…" } ],   // identity hints only, see §5.3
  "hashes": [ { "id": "uuid", "value": "…", "type": "…" } ]
}
```

The `references` block is copied from the source document so the importer
can size the ID map and validate the bundle before touching the sidecar.
The sidecar remains the authority for what the bytes actually reference
(§5.1).

### 4.3 Origin record on imported documents

New optional field on `WikiDocument`:

```go
ImportOrigin *WikiImportOrigin `bson:"import_origin,omitempty" json:"-"`

type WikiImportOrigin struct {
    BundleID         uuid.UUID `bson:"bundle_id"`
    SourceDocumentID uuid.UUID `bson:"source_document_id"`
    ImportedAt       time.Time `bson:"imported_at"`
}
```

Cheap to write, and it is the hook for a future "already imported" check
and for support questions ("where did this page come from"). Not exposed in
GraphQL in v1.

### 4.4 Credentials

Credentials are operation-private (`persistence.ts` refuses chips in the
Public operation). Today's Markdown export already embeds full payloads in
`vibe-credential` fences, so the bundle changes nothing about the policy —
it just moves the payloads out of the page bodies into `credentials.json`:

```jsonc
[ { "id": "uuid", "payload": { …full models.Credential minus operation_id… } } ]
```

**Decision.** Export of credentials requires the operator role on the
source operation (viewer can export pages but not the credential file; the
manifest marks `credentialsIncluded: false` and chips import as tombstones).
Import reuses `wikiimport.CredentialReconciler` semantics: reuse by ID when
present in the target operation, else create, else tombstone. The
reconciler moves to a package both importers share (§7).

## 5. Import pipeline

Applies to both formats after their front half has produced a normalised
in-memory plan: an ordered list of pages with either `contentState []byte`
(bundle) or `markdown string` (foreign), plus attachment blobs.

### 5.1 ID map and rebase

1. Allocate a fresh `uuid` for every document, image and file in the plan.
   Build `idMap: source → target`.
2. Hosts and hashes: look up each source ID in the target operation. Same
   operation → identity. Different operation → try the identity hints from
   the manifest (`hostname`+`ip`, hash `value`); on a unique match use it,
   else drop the chip to its plain label (§5.3).
3. Credentials: reconcile as in §4.4, extending `idMap`.
4. For every page call one new sidecar route:

```
POST /internal/rebase-document
{
  "contentState": <base64>       // bundle path
  | "markdown": "…",              // foreign path
  "idMap": { "<source uuid>": "<target uuid>", … },
  "drop": ["<source uuid>", …],   // chips to lower to plain text
  "dropUnmappedKinds": ["doc","host","hash","credential"]
                                  // kinds whose unmapped ids are lowered too:
                                  // every kind on a cross-operation import,
                                  // none on a same-operation import
}
→ 200
{
  "contentState": <base64>,        // rewritten bytes, normalised
  "content": "…",                  // search projection, same as persistence.ts writes
  "references":   [...], "credentialReferences": [...], "hashReferences": [...],
  "hostReferences": [...], "imageReferences": [...], "fileReferences": [...],
  "checklist": { "total": n, "required": n, "answered": n },
  "schemaVersion": 1,
  "unmapped": ["<uuid>", …]        // ids seen in content but absent from idMap and drop
}
```

The route walks the ProseMirror tree once, rewrites the id-bearing
attributes (`documentId`, `hostId`, `hashId`, `credentialId`, `fileId`,
image `src`), applies `drop`, then runs the same `collect*ReferenceIds` and
`collectChecklistCoverage` functions `persistence.ts` uses. **The response is
the complete projection.** The Go side never derives any of it.

Existing `/internal/markdown-to-yjs` and `/internal/yjs-to-markdown` stay
for the MCP and single-page paths; the importers stop calling the former.

### 5.2 Materialise

Per page, in parent-first order:

1. Depth check against the chosen target parent (cap 10).
2. Ingest attachments owned by the page through the existing
   `IngestImage` / `IngestFile` helpers with the pre-allocated target IDs
   (helpers gain an optional `withID`). Same dedupe and deny-list as uploads.
3. Insert the `WikiDocument` in one `Create` with every field populated:
   metadata from the plan, `content`, `content_state`, all reference arrays,
   checklist counters, `content_state_schema_version`, `import_origin`.
   No second `Update`; a page either exists fully indexed or not at all.
4. On failure: record in the report, mark the page and its subtree skipped,
   continue. Attachments already ingested for a skipped page are deleted
   immediately (they would otherwise be unreferenced and swept later).

After the walk: publish one `WikiDocumentCreated` for the imported root(s)
so the sidebar refreshes, exactly as today.

### 5.3 Chip policy

| Chip | Same operation | Different operation |
|---|---|---|
| document, in bundle | remap | remap |
| document, not in bundle | keep id (still valid) | drop to label |
| host / hash | keep id | identity-hint match, else drop to label |
| credential | reconcile | reconcile |
| image / file | remap | remap |

"Drop to label" means the atom becomes its visible text (`host`, `hash`,
`page`) as plain text so the sentence still reads. The report lists every
dropped chip with page path and kind.

### 5.4 Target placement

Import request carries `targetParentId: uuid | null`. `null` means the
operation root. The holding pen is expressed by the frontend passing the
`import/<timestamp>` folder it asks the backend to create, so the backend
has one code path. Default in the dialog: foreign zips → holding pen; Vibe
bundles → user picks a parent (the existing move-dialog picker).

Sort order: bundle pages keep their `sortOrder` verbatim, which is correct
because siblings arrive together. The imported root(s) get a sort order
after the last existing child of the target parent.

## 6. Jobs

**Decision.** Both directions become jobs. A `wiki_transfer_jobs` collection:

```go
type WikiTransferJob struct {
    JobID        uuid.UUID
    OperationID  uuid.UUID
    Kind         string   // "export" | "import"
    Format       string   // "bundle" | "markdown"
    Status       string   // queued | running | done | failed
    RequestedBy  uuid.UUID
    Request      bson.Raw // scope / target parent / options
    Progress     struct{ Done, Total int }
    Report       bson.Raw // same shapes as today's Report structs
    ArtifactKey  string   // blob-store key of the produced zip (export) or the uploaded zip (import)
    ExpiresAt    time.Time
    CreatedAt, StartedAt, FinishedAt time.Time
}
```

Flow:

- **Export:** `POST /api/v1/wiki/transfer/exports` (JSON: `operationId`,
  optional `rootId`, `format` = `bundle` | `markdown`) creates the job and
  returns it with `202`. A worker goroutine owned by the app (package
  `wikitransfer/job`) claims it with an atomic status flip, renders to a
  temp file, uploads to the file bucket under `wiki-transfers/<jobId>.zip`,
  and marks it done. The client polls `GET /api/v1/wiki/transfer/jobs/:id`
  every 1.5 s and downloads via `GET /api/v1/wiki/transfer/jobs/:id/download`
  (cookie-authenticated GET, so it works as a plain link). Artifacts expire
  after `WIKI_TRANSFER_ARTIFACT_TTL` (24 h); the runner's tick sweeps them.
- **Import:** `POST /api/v1/wiki/transfer/imports?operationId=…` (multipart
  `file`; optional `targetParentId` or `holdingPen=true`) stages the upload
  in the file bucket under `wiki-transfers/uploads/<jobId>.zip`, creates the
  job, returns `202`. The worker spools the archive to disk, detects the
  format from the presence of `manifest.json`, runs the pipeline, deletes
  the upload and marks the job done. The dialog polls the same job route.
- `GET /api/v1/wiki/transfer/jobs?operationId=…` lists recent jobs.

Polling replaced the proposed GraphQL query and SSE event: the two dialogs
are the only consumers, a 1.5 s poll on a job row is negligible, and it
avoided touching the gqlgen schema for a feature that is not entity data.

Caps: 5,000 pages and 1 GiB of attachments per export (writer defaults),
`WIKI_IMPORT_ZIP_MAX_SIZE` on an upload. Concurrency: the controller refuses
a new job with `409` while one is queued or running for the operation;
claiming is a `findOneAndUpdate` so two processes never run the same job.
A job still marked running two hours after it started is failed by the
sweeper as orphaned.

## 7. Package layout

```
core/pkg/wikitransfer/
  plan.go, report.go     Plan / Page / Attachment / CredentialPayload, both reports
  scope.go               CollectScope — the document set an export covers
  materialise.go         §5 — id map, rebase client, single-write create
  credentials.go         resolve-or-create reconciler (root package, not a
                         subpackage: the materialiser needs it and the
                         subpackages import the root, so a subpackage would cycle)
  holdingpen.go          import/<timestamp>/ folders
  bundle/                manifest, writer, reader (native format)
  markdown/              parser + renderer moved from wikiimport/wikiexport,
                         ReadPlan (zip → Plan) and Exporter (Scope → zip)
  job/                   runner: claim loop, export/import execution, sweeper
  transfertest/          in-memory doubles shared by the tests above
core/pkg/controller/wiki_transfer_controller.go   the five routes
core/pkg/controller/wiki_transfer_ingestor.go     adapter onto the upload controllers
core/pkg/repository/wiki_transfer_job_repository.go
core/pkg/models/wiki_transfer_job.go
hocuspocus/src/rebase-document.ts, rebase-api.ts, projection.ts
```

`wikiexport` and `wikiimport` are gone. The attachment upload controllers
gained `IngestImageWithID` / `IngestFileWithID` and `DiscardImage` /
`DiscardFile` so the materialiser can ingest under pre-allocated ids and
clean up after a failed page.

Single-page Markdown export (`wikiDocumentMarkdown`) and the MCP surface are
unchanged.

## 8. Phases

Each phase is independently shippable and leaves the product working.

**Phase 1 — Stop the bleeding (small). Done.**
Add `/internal/rebase-document` with `idMap` and `drop` optional. Point the
existing `wikiimport` orchestrator at it instead of `markdown-to-yjs`, and
write the full projection in the create. Add a Go test that imports the
Outline fixture and asserts `image_references` is populated. Run the
existing backfill routes once in production for pages imported before the
fix — that step is operational and still has to be done. *Outcome: arming
the sweepers becomes safe.*

**Phase 2 — Bundle format. Done.**
Manifest types, bundle writer behind `GET /api/v1/wiki/export?format=bundle`,
bundle reader feeding the materialiser with ID remapping and chip policy,
`targetParentId` on the import route, `import_origin` field. Frontend:
format toggle on export, parent picker on import. Round-trip test:
export → import into a second operation → assert page count, order, chips
resolve, attachment bytes equal, checklist counters equal.
*Outcome: G1, G3 for bundles.*

**Phase 3 — Jobs. Done.**
`wiki_transfer_jobs`, worker, artifact store and sweeper, GraphQL query and
SSE event, frontend progress. Delete `wikiexport` / `wikiimport` packages.
*Outcome: G4, G5.*

**Phase 4 — Polish (not started).**
Identity-hint matching for hosts and hashes across operations,
"already imported from this bundle" skip, bundle inspection endpoint
(show what a zip contains before importing).

## 9. Open questions — resolved

- **O1. Installation identity.** `INSTALLATION_ID` env var, optional,
  stamped into `manifest.source.installationId` when set. No generated id;
  an operator who wants one sets one.
- **O2. Credential export by viewers.** Operator-only. Any viewer can start
  an export; `request.includeCredentials` is set from the caller's role and
  the manifest records `credentialsIncluded` so a receiving side knows why
  chips came back as text.
- **O3. Same-operation bundle import.** Allowed. It behaves as a duplicate
  with the same-operation chip policy (host, hash and out-of-bundle page
  ids kept). Folding `duplicateWikiDocument` onto the materialiser remains
  a Phase 4 option.
- **O4. Sidecar batching.** One call per page, as proposed. Not measured
  at scale yet; the runner's progress row makes a slow import visible
  rather than mysterious.

## 10. Test plan

- Unit, Go: manifest validation (missing files, size mismatch, unknown
  `formatVersion`), ID map construction, chip policy table, depth rejection,
  partial-failure cleanup of ingested attachments.
- Unit, sidecar: `rebase-document` remaps every attribute in
  `REFERENCE_CHIP_KINDS`, `wikiFile.fileId`, image `src`; `drop` lowers to
  text; returned projection equals what `persistence.ts` would write for the
  same doc (reuse the existing `references.test.ts` fixtures).
- Integration, Go: full round trip per Phase 2, plus foreign fixture
  `local-outline/test-export.markdown.zip` through the same materialiser
  asserting all reference arrays.
- Job: cancel mid-run leaves no half-indexed page; artifact sweeper removes
  expired zips; second concurrent import for the same operation is rejected.
