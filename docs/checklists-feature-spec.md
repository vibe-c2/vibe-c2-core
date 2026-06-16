# Checklists Feature — Design Spec

**Status:** Draft for review
**Date:** 2026-06-14
**Author:** design session (operator + Claude)

---

## 1. Problem

When a new host is pwned, an operator runs a large, repetitive recon sweep — network
config, user footprint, processes, interesting files, priv-esc vectors, etc. Today there
is **no standardized document** to capture that intel. Every operator invents their own
layout: some split intel into sub-documents per domain, some dump everything into one
page. The result is operation documentation that is inconsistent and hard to navigate,
and routine recon that is easy to do incompletely.

## 2. Solution

**Checklists.** A team defines a reusable checklist — an ordered, grouped set of questions
that need answering. From a checklist an operator generates a working document
pre-populated with those questions and answer placeholders. The checklist is a *template*
that standardizes routine work; operators pick a predefined sweep ("Linux Host Recon",
"Windows Host Recon", "AD Enumeration") instead of starting from a blank page.

The defining architectural choice (this revision): **a checklist is just a wiki document.**
Both the reusable *template* and the filled-in *instance* are `WikiDocument`s whose body
contains checklist-item nodes. They differ only by which tree they live in. This means
checklists inherit, with no new machinery, everything wiki documents already do:
tree placement, **child documents**, **full-text search**, backlinks, real-time
collaborative editing, presence, backup, trash/restore.

Two properties make a checklist more than a templated page:

1. **Coverage tracking.** Because checklist items share a known node schema, completion is
   measurable per-document (`7/12 required answered`) and aggregatable across an operation.
   Free-form docs can't be rolled up; a structured node schema can. This directly attacks
   the "hard to navigate documentation" pain.

2. **Findings can *be* the answer to a question.** Certain items are *typed* — the answer is
   a **reference** to an existing finding (a host, credential, hash), not prose. The findings
   graph stays the single source of truth; the checklist points at it. A checklist becomes a
   curated, question-organized index *into* the findings graph, with zero duplication.

## 3. Decisions (locked)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Everything is a `WikiDocument`.** Templates and instances are both wiki documents containing checklist-item nodes; they differ only by tree. | "Full integration into wiki documents" (operator's words). One collection, one editor, one sidecar room (`wiki/{id}`), one projection. Checklists get tree/children/search/backlinks/presence/backup for free. Reverses the earlier separate-entity model. |
| D2 | **Three wiki trees, one entity**, partitioned by `OperationID`: operation tree (real op), public tree (`PublicOperationID`), **Checklists tree** (`ChecklistsRootID`, a new global sentinel). | The wiki tree already filters by `OperationID`; a third tree is a new partition value, not new tree code. Templates live in the Checklists tree; instances live in operation trees. |
| D3 | **A checklist *instance* is an operation wiki document** with an optional `ChecklistTemplateID` provenance pointer. | Instantiation = create an operation wiki doc seeded from a template. Instances sit in the operation wiki tree, can have child docs, and are searchable — exactly the requested integration. An operator may also build an ad-hoc checklist inline (no template → `ChecklistTemplateID` null). |
| D4 | **Typed answers *reference* findings — never create or mutate them.** A finding can be the answer to a question. | The findings graph is the source of truth; the checklist is a read-side index. Referencing (not emitting) means no duplication, no write-back, no sync problem — and still closes the loop with the topology lenses. |
| D5 | **Instances are NOT bound to a host.** `ref:host` is one optional typed item among many. | Checklists stay general-purpose — some aren't host recon at all (pre-engagement, OPSEC). A checklist with no `ref:*` items is pure prose. |
| D6 | **Instantiation copies the template's content** into the new doc; the two are independent thereafter. | A template edit must never mutate a recon run already started. Copy-on-instantiate gives this for free — the instance is its own Yjs doc/CRDT (§9). Removes any need to version templates. |

## 4. Information architecture — three wiki trees

All three trees are the **same `WikiDocument` entity**, partitioned by `OperationID`:

| Tree | `OperationID` | Contents | Visibility |
|------|---------------|----------|------------|
| **Operation wiki** | a real operation | docs + **checklist instances** | operation members |
| **Public wiki** | `PublicOperationID` (`…0001`) | shared docs | every authed user |
| **Checklists** *(new)* | `ChecklistsRootID` (new sentinel, e.g. `…0002`) | checklist **templates**, in folders | read: every authed user; write: admin |

```
WikiDocument tree (one entity, three OperationID partitions)
├── Operation wiki      (real op)        ─ docs AND checklist instances live here
├── Public wiki         (PublicOperationID)
└── Checklists tree     (ChecklistsRootID)   ─ TEMPLATES, in folders
        Linux/
          ├── Linux Host Recon       (template doc)
          └── Container Escape
        Windows/  └── Windows Host Recon
        AD/       └── AD Enumeration
        OPSEC/    └── Pre-engagement Checklist

   instantiate ─(copy content into a new operation wiki doc, set ChecklistTemplateID)─►
        Operation wiki tree
          └── web-01 recon            (instance: a normal wiki doc, can have children)
                ├── nmap output        (ordinary child doc)
                └── creds dump         (ordinary child doc)
```

Key points:

- The Checklists tree is **its own top-level tree**, not a branch of either wiki tree — but
  mechanically it's the same model with a different `OperationID` partition. Hierarchical
  (folders group templates) via the wiki tree's existing `ParentDocumentID` / `PathIDs` /
  `SortOrder`.
- **Instances live in the operation wiki tree** (not a separate "Checklists tab"). They are
  ordinary wiki documents that happen to contain checklist nodes; they can be filed anywhere,
  have child documents, and appear in `wikiSearch`.

## 5. The data model

### 5.1 `WikiDocument` additions

The only schema change is on the existing model (`core/pkg/models/wiki_document.go`):

```
WikiDocument {
  … all existing fields (DocumentID, OperationID, ParentDocumentID, PathIDs,
    Title, Content, ContentState, References, …) …

  ChecklistTemplateID *uuid    // NEW. instances only: the template this was forked from
                               // (null for templates themselves and for ad-hoc/non-checklist docs)

  // NEW projection fields (sidecar-derived; meaningful only when the body has checklist nodes)
  ChecklistRequired   int      // count of required checklist items
  ChecklistAnswered   int      // count of required items in state answered|not_applicable
}
```

`OperationID == ChecklistsRootID` ⟺ the doc is a **template**.
`ChecklistTemplateID != null` ⟹ the doc is an **instance forked from a template**.
A doc "is a checklist" iff its content contains ≥1 checklist-item node (sidecar sets the
coverage fields; a non-checklist doc leaves them zero/absent).

### 5.2 Checklist-item nodes (ProseMirror / Yjs)

Checklist structure lives **inside the collaborative document** as custom ProseMirror nodes
— the same mechanism the codebase already uses for task-lists and credential/hash reference
nodes. Each item node carries attributes and an answer region:

```
checklistItem (node)
  attrs:
    key         string   // stable id, unique within the doc — survives the copy into instances
    prompt      string   // "Enumerate the host's routing table"
    commandHint string    // "ip route" / "Get-NetRoute"  — turns the checklist into a runbook
    required    bool      // drives coverage
    state       enum      // "" (derived) | not_applicable | flagged — operator override
  content:               // the answer region — block+ freeform markdown (§6)
    prose / code block / lists / embedded reference chips (credential, hash, host)
```

State is **derived** from the answer region by the projection: `unanswered` (empty),
`answered` (region holds content), or explicit `not_applicable` / `flagged` (the `state`
attribute the operator toggles). No separate answers collection — the answer is the node body,
edited live.

## 6. Answers are freeform markdown (no answer types)

There is **no `AnswerType`**. Because the answer region is already a full ProseMirror/markdown
content area, every question accepts any content: prose, a `/code` block of pasted console
output, lists, and — crucially — the same reference chips the wiki already supports
(`/credential`, `/hash`, and the forthcoming `/host`). A typed-answer enum would only duplicate
what the editor body can already express.

This means:

- **No findings-coupling machinery on the item.** A finding is referenced by inserting a
  `/credential` / `/hash` / `/host` chip into the answer, exactly as anywhere else in the wiki
  (D4 — read-only reference, never a write). The chip carries the finding id; the sidecar's
  reference walkers index it (§7).
- **Coverage stays simple.** `required` + derived state (answered = the region holds content,
  or `not_applicable`). One rule, no per-type branching.
- **`commandHint` is the runbook companion**, unchanged: the item shows the command, the
  operator pastes the unmodified output into the answer (a `/code` block).

> **Earlier revisions** carried an `answerType` enum (text/multiline/code/boolean/enum/ref:\*).
> Dropped — boolean/enum were the only non-markdown shapes, and storing them as node attributes
> forced a special case in the coverage walker for no real gain. If a constrained pick-one
> answer is ever needed, it returns as one optional node type rather than a pervasive lever.

## 7. Finding references (how reference answers work)

A `ref:*` answer is an **embedded reference node** holding a finding id — the same node
pattern as the existing credential/hash reference nodes. No write-back, no binding to a host
"subject," no emit.

```
hostReference (node)   // new; mirrors existing credentialReference / hashReference nodes
  attrs: hostId uuid
```

Flow for answering a `ref:host` item "Hosts on this segment?":

1. Operator opens the item → a finding picker **scoped to the document's `OperationID`**.
2. Picks one or more existing `Host` findings (or jumps to the host UI to create one, then
   comes back and picks it — creation stays in the findings surface, never in the checklist).
3. A `hostReference` node is inserted into the item's answer region.
4. The sidecar's reference walker extracts `hostId` into `WikiDocument.HostReferences`
   (a new inverse index, mirroring the existing `CredentialReferences`); rendering resolves
   it to live host data (current routes/logins included).

Because the answer is a pointer:

- **No duplication, no sync.** The finding lives once. The checklist shows current state every
  render.
- **Operation-scoped.** A `ref:host` can only point at hosts in the document's operation. The
  projection validates this and drops cross-operation / Public-tree refs (the credential-drop
  rule for global trees already exists — extend it to hosts).
- **General by construction (D5).** A doc with no `ref:*` items is pure prose/boolean.

**Dangling references.** If a referenced finding is later deleted, the stored id dangles.
Resolve at render time: show a "finding deleted" tombstone; the operator clears or re-points
the answer. No cascade — findings own their lifecycle; the checklist is a soft index.

## 8. Collaborative editing (total reuse, no new room type)

Because a checklist is a `WikiDocument`, it rides the **existing** Yjs + Hocuspocus stack
unchanged — same `wiki/{documentId}` room, same collab-ticket auth, same presence, same
backup. **No new realtime infrastructure and no new sidecar room type.**

What the wiki stack does today (verified):

- Edits sync over a WebSocket to the **Hocuspocus** sidecar (`hocuspocus/`), room
  `wiki/{documentId}`; Yjs CRDT; TipTap/ProseMirror editor with
  `@tiptap/extension-collaboration`.
- The sidecar is the **only** Yjs decoder. On a debounced `store()` it projects the doc to
  Mongo: `content_state` (binary), `content` (Markdown), reference arrays via pure node
  walkers (`hocuspocus/src/persistence.ts`, `references.ts`). **Go never decodes Yjs.**
- Presence: awareness + webhooks → in-memory Go `PresenceTracker` → GraphQL subscriptions.
- Backup: a Go scheduler snapshots `content`.

The **only** sidecar changes (no new rooms — templates and instances are all `wiki/{id}`):

1. **Checklist projection:** extend the existing wiki `store()` walk to also detect
   checklist-item nodes and write `ChecklistRequired` / `ChecklistAnswered` (count by derived
   state). Runs on every wiki doc; cheap no-op when there are no checklist nodes.
2. **`host` reference walker** in `references.ts` (credential/hash already exist) → populate
   `HostReferences`; extend the existing global-tree credential-drop to also drop host refs on
   Public/Checklists-tree docs.

Concurrency falls out for free: different operators on different items never conflict; two in
the same `code`/`multiline` answer get character-level merge; concurrent `state`/checkbox
toggles are last-writer-wins per node attribute (acceptable); concurrent `ref:host` picks
both survive (CRDT insert).

## 9. Instantiation (the copy)

`instantiateChecklist(templateDocId, targetOperationId, parentDocId)`:

1. Create a new `WikiDocument` in `targetOperationId`'s tree under `parentDocId`, title from
   the template, `ChecklistTemplateID = templateDocId`.
2. **Seed its content by copying the template's `content_state` bytes** as the new doc's
   initial Yjs state, and copy `content` (Markdown). Both docs share the same ProseMirror
   schema, so the binary is a valid starting state for an independent doc — **Go can byte-copy
   `content_state` without decoding Yjs.** Templates carry no answers, so the copy is clean.
3. The two docs are independent CRDTs thereafter; template edits never propagate (D6).

> **Reviewed — low risk (§16).** The Hocuspocus `fetch()` hook returns whatever
> `content_state` is in Mongo with no provenance check, and `store()` persists a *complete*
> Yjs encoding, so a byte-copied state loads as a valid standalone doc. Residual checks are
> mechanical (BSON binary subtype; copy `content` too so it's searchable pre-open). Fallbacks
> if a future Hocuspocus upgrade changes the contract: short-lived sidecar session, or
> client-seeds-on-first-open.

## 10. Coverage & rollups

Derived from the projection (§8), stored on the doc as `ChecklistRequired`/`ChecklistAnswered`:

- **Per-document coverage** = `ChecklistAnswered / ChecklistRequired`. Rendered as a progress
  bar on the instance (and on the template as a preview of its item count).
- **Operation rollup** — query the operation's wiki docs where the coverage fields are present
  (i.e. checklist docs) and aggregate. Powers a triage board: "web-01 7/12, db-02 3/9 … 14 hosts,
  62% overall." Concrete answer to the original navigation problem. Surfaced as a filtered view
  over the wiki tree (e.g. "Checklists" filter), not a separate collection. (Per-section
  breakdown — "Network 11/14, Priv-esc 4/14" — is a later refinement; with `group` removed it
  would key on the heading each item sits under, derived from the projection.)

## 11. Authorization

Reuses wiki authorization, with one special-case partition:

- **Operation tree** (instances): existing `authorizeForOperation` — read VIEWER, edit OPERATOR.
- **Public tree**: existing behavior (world-readable; edit gated as today).
- **Checklists tree** (`ChecklistsRootID`): add a special case next to the existing
  `PublicOperationID` handling in the wiki authorize path — **read = any authed user; create /
  edit / move / delete = a `checklist:manage` permission (admin)**. Mirrors "public wiki is
  world-readable but edit-restricted."

`ref:*` answers are read-only references — no new finding-write permission surface. The
projection only *validates* that a referenced id belongs to the document's operation.

## 12. Seed library (shipped templates)

Seed a small set as `WikiDocument`s in the Checklists tree (`ChecklistsRootID`), organized
into folder docs, at startup/migration — the same way the synthetic Public wiki space is made
available without a real operation row. Teams start from proven content and fork, rather than
facing a blank builder (the blank builder is the thing nobody fills in):

- `Linux/` → **Linux Host Recon** — System / Network (`ref:host` + `code` route/login dumps) /
  Users / Processes & services / Interesting files / Priv-esc / Persistence.
- `Windows/` → **Windows Host Recon** — Windows commands (`ipconfig /all`, `Get-NetRoute`,
  `whoami /all`, …).
- `AD/` → **AD Enumeration** — domain, trusts, users/groups, GPOs, kerberoast targets.
- `OPSEC/` → **Pre-engagement Checklist** — a deliberately *non-host* checklist (D5 generality).

## 13. Wiring (what to build)

Most of this feature is **extensions to the existing wiki**, not new entities.

**Go backend:**

1. `core/pkg/models/wiki_document.go` — add `ChecklistTemplateID`, `ChecklistRequired`,
   `ChecklistAnswered`, and a `HostReferences` inverse index (mirror `CredentialReferences`).
2. **`ChecklistsRootID` sentinel** + a synthesize/seed path mirroring
   `models/public_operation.go`; ensure wiki tree queries accept it as a valid partition.
3. Wiki authorize path — special-case `ChecklistsRootID` (§11).
4. `core/pkg/resolver/wiki_document_resolver.go` (or a small sibling) — **`instantiateChecklist`
   mutation** (§9: create doc, byte-copy `content_state`, set `ChecklistTemplateID`), plus a
   **coverage rollup query** for an operation, and a host-reference field resolver / `FindByIDs`
   resolution with dangling tombstones.
5. `core/pkg/graphql/schema/wiki.graphql` — extend `WikiDocument` (templateId, coverage,
   hostReferences/backlinks), add `instantiateChecklist`, the rollup query, host-reference
   types. `make gqlgen`.

**Hocuspocus sidecar (`hocuspocus/`):**

6. `persistence.ts` — extend the wiki projection: walk checklist-item nodes → coverage counts.
7. `references.ts` — add the `host` reference walker; extend the global-tree drop to host refs.

**Frontend:**

8. TipTap nodes/extensions for `checklistItem` and `hostReference` (mirror existing task-list /
   credential-reference extensions in `frontend/src/components/wiki/`). Reuse `useHocuspocus`,
   presence, cursors, the editor shell.
9. Checklists tree view (the existing wiki tree component pointed at `ChecklistsRootID`),
   an **"instantiate" action** (pick template → choose operation + parent), per-doc coverage
   bar, the host finding-picker, and the operation rollup/triage view.

## 14. Phased rollout

- **Phase 1 (shipped) — Checklists tree + freeform items.** `ChecklistsRootID` tree (reuse wiki
  tree), `wikiChecklistItem` node (prompt / command hint / required / state + a `block+` freeform
  answer region — no answer types, no group; sectioning is done with ordinary headings, which the
  "On this page" outline nests items under), coverage projection + per-doc bar,
  `instantiateChecklist` (operator-named). Ships standardization + coverage on top of the wiki.
  Findings can already be referenced in answers via the existing `/credential` and `/hash` chips.
- **Phase 2 — the `/host` chip.** A general `wikiHostReference` node + `/host` slash command +
  host finding-picker (operation-scoped) + host reference walker + inverse index + dangling
  tombstones. Usable in **any** wiki doc; checklists get host references for free. Proves D4
  against the existing topology lenses. (This is the only piece the "drop answer types" decision
  left outstanding — there is no checklist-specific work here.)
- **Phase 3 — operation rollup / triage board.** Aggregate per-document checklist coverage across
  an operation (per-doc + operation totals). `ref:credential` / `ref:hash` need no new work — they
  are already insertable as chips in any answer.
- **Phase 4 (optional) — template builder UX polish, OS filtering at instantiation, more ref
  chips (`/wiki-document`, …), per-heading-section coverage breakdown in the rollup.**

## 15. Resolved questions

1. **Where do instances live?** → In the **operation wiki tree** as ordinary wiki documents
   (D1/D3). Not a separate tab/collection. A "Checklists" *filter* over the tree surfaces them
   and the rollup.
2. **Are templates a separate entity?** → **No.** Templates are `WikiDocument`s in the global
   Checklists tree (`ChecklistsRootID`). One entity for everything (D1).
3. **Finding-picker reach?** → **Operation-scoped only**; cross-operation refs rejected.
4. **Cross-link an instance to a wiki document?** → Moot — an instance *is* a wiki document,
   with native backlinks.
5. **Template versioning / concurrency?** → Collaborative editing (§8) + copy-on-instantiate
   (D6). No shared live template to version.
6. **Reverse index ("from a finding, which checklists reference it")?** → Comes nearly for free
   via the `HostReferences` inverse index (same as wiki credential backlinks), but **not a v1
   surface** — no dedicated UI in scope.

## 16. Risk review — §9 content_state copy (resolved: low risk)

**Question:** when an operator first opens a checklist instance that Go created by
byte-copying the template's `content_state`, will Hocuspocus load those hand-written bytes
correctly — i.e. does Hocuspocus accept a *pre-seeded* `content_state` on a document that has
never had a live session?

**Conclusion: yes, low risk.** Confirmed by reading the persistence path
(`hocuspocus/src/persistence.ts`):

- `fetch()` (the document-load hook) simply reads the `content_state` buffer from
  `wiki_documents` and returns it as the starting Yjs state. **It does not distinguish bytes
  written by `store()` from bytes written by Go** — there is no provenance marker. The wiki
  already relies on this exact load path on every reconnect.
- `store()` reconstructs the full doc via `Y.applyUpdate(ydoc, state)`, so the persisted
  `content_state` is a **complete, standalone Yjs document encoding**, not an incremental
  delta. Copying that complete blob into a new row yields a valid, independently-loadable
  document.
- Forking by encoded-state copy carries the original's internal Yjs **client ids**, which is
  only a problem if two forks are ever merged back together — which never happens here
  (template and instance are separate rooms/docs that diverge permanently). New edits in the
  instance get fresh client ids.

**Residual checks (mechanical, not architectural):**

1. Go copies the column with the correct **BSON binary subtype**, so `fetch()`'s
   `doc.content_state.buffer` reads back intact.
2. The new instance row also gets a copied `content` (Markdown) at creation, so it is
   searchable *before* anyone opens it (the projection only refreshes on the first edit).

Fallbacks (§9) remain available if a future Hocuspocus upgrade changes the load contract:
open a short-lived sidecar session to apply the template update, or have the client seed on
first open.
