# Checklists Feature — Implementation Plan

**Status:** Phase 1 shipped. Phase 2 `/host` chip shipped (inverse host-backlinks
surface deferred). Phase 3 planned.
**Date:** 2026-06-14 (revised 2026-06-15)
**Companion to:** [`checklists-feature-spec.md`](./checklists-feature-spec.md) (design; read first)

This plan turns the spec into ordered, file-anchored work. **Phase 1** ships standardization +
coverage on top of the wiki (shipped); **Phase 2** adds the general `/host` reference chip;
**Phase 3** adds the operation rollup board. Every task lists the concrete file and the existing
symbol it mirrors.

> **Revision 2026-06-15 — answer types dropped.** The original plan gave each checklist item an
> `answerType` (text/multiline/code/boolean/enum/ref:\*). That was removed: the answer region is
> already freeform markdown, so a question accepts any content — prose, a `/code` block, or a
> `/credential`/`/hash`/`/host` reference chip — and "answer types" only duplicated the editor
> body (boolean/enum, the only non-markdown shapes, were stored as node attrs and forced a
> coverage-walker special case). See spec §6. Net effect below: the `wikiChecklistItem` node
> keeps only `key / group / prompt / commandHint / required / state`; the NodeView has no type
> selector / boolean / enum controls; there is a single "Checklist item" slash command; and the
> coverage walker derives `answered` purely from "region non-empty (or N/A)". **Phase 2's
> `ref:host` is no longer a checklist answer type — it is a general `/host` wiki chip** that
> happens to be usable in answers like any other chip.

---

## 0. Naming & schema decisions (resolve before coding)

These tighten the spec's generic names to the codebase's actual conventions. Locking them now
avoids a rename churn across Go/TS/React.

| Spec name | **Use this** | Why |
|-----------|--------------|-----|
| `checklistItem` node | **`wikiChecklistItem`** | Matches `wikiCredentialReference` / `wikiHashReference` / `wikiDocumentReference` prefix convention (`hocuspocus/src/references.ts`, `frontend/.../wiki-*-reference-node.tsx`). |
| `hostReference` node | **`wikiHostReference`**, attr `hostId` | Same convention; mirrors `wikiHashReference`/`hashId`. |
| `ChecklistRequired`/`ChecklistAnswered` | `int` (**not bool**) | They are counts. bson `checklist_required` / `checklist_answered`. |
| `HostReferences` | `[]uuid.UUID`, bson `host_references,omitempty`, json `-` | Mirrors `CredentialReferences` exactly. |

**Critical editor decision — the answer region.** Every existing reference node is an
**inline atom** (`atom: true`, no content). The checklist item is different: it is a **block
node with a content region** (the answer). ProseMirror schemas cannot vary content by
attribute, so:

- `wikiChecklistItem` is a **block node** with `content: "block+"` (permissive).
- The `answerType` attribute + the React NodeView + the item toolbar **steer** what goes into
  the region (a code block for `code`, paragraphs for `multiline`, a `wikiHostReference` for
  `ref:host`). The schema does not enforce it; the UI does.
- **Coverage is derived from the region's content**, not from a separate answer field (§5.2).

This is the only new editor primitive. Everything else is a copy of an existing pattern.

---

## Phase 1 — Checklists tree + scalar items + coverage + instantiate

Goal: a global Checklists tree of template docs; a `wikiChecklistItem` node supporting
`text | multiline | code | boolean | enum`; per-doc coverage; `instantiateChecklist`. No
findings coupling.

### 1A. Go — sentinel + model

1. **`core/pkg/models/public_operation.go`** — add the Checklists-root sentinel mirroring
   `PublicOperationID` (`public_operation.go:18`). New:
   ```go
   var ChecklistsRootID = uuid.MustParse("00000000-0000-0000-0000-000000000002")
   func IsChecklistsRoot(id uuid.UUID) bool { return id == ChecklistsRootID }
   func SynthesizeChecklistsRoot() models.Operation { /* mirror SynthesizePublicOperation, name "Checklists" */ }
   ```
   (Keep it in this file or a sibling `checklists_root.go`; the synthesize helper returns an
   in-memory `Operation` with no Mongo row — same as Public.)

2. **`core/pkg/repository/operation_repository.go:115`** — extend `FindByID`'s synthetic
   short-circuit (currently only `IsPublicOperation`) to also return
   `SynthesizeChecklistsRoot()` for `IsChecklistsRoot(id)`. This makes every downstream caller
   (authz, resolvers, wiki tree) treat it like any operation.

3. **`core/pkg/models/wiki_document.go:19`** — add four fields after the existing reference
   arrays (`FileReferences` is the last, ~line 82):
   ```go
   ChecklistTemplateID *uuid.UUID  `bson:"checklist_template_id,omitempty" json:"checklistTemplateId,omitempty"`
   ChecklistRequired   int         `bson:"checklist_required"             json:"checklistRequired"`
   ChecklistAnswered   int         `bson:"checklist_answered"             json:"checklistAnswered"`
   HostReferences      []uuid.UUID `bson:"host_references,omitempty"      json:"-"`   // Phase 2, add now or then
   ```

### 1B. Go — authorization

4. **`core/pkg/authorization/operation_auth.go:21`** — add a `ChecklistsRoot` branch to
   `AuthorizeOperationRole`, **next to but distinct from** the Public branch (`:36`). Public
   grants implicit OPERATOR to everyone; Checklists must grant **read to all, write to global
   admin only**:
   ```go
   if models.IsChecklistsRoot(op.OperationID) {
       if minRole == models.OperationRoleViewer { return nil }      // read: any authed user
       if callerIsGlobalAdmin(ctx) { return nil }                   // write/move/delete: admin
       return fmt.Errorf("forbidden: checklists are admin-managed")
   }
   ```
   Use the existing global-admin check used elsewhere in auth (grep the RBAC `admin` wildcard
   in `pkg/auth/permissions/`); if a `checklist:manage` permission is preferred over the admin
   wildcard, add it there and check it here. The wiki resolver reaches this via
   `wiki_document_resolver.go:192 authorizeForOperation` unchanged.

### 1C. Hocuspocus — coverage projection

5. **`hocuspocus/src/references.ts`** — add a **coverage walker** (new shape — not a
   `collectNodeAttrIds` wrapper, because it inspects content not just an attr). Model it on
   `walkImage` (`references.ts:151`):
   ```ts
   const CHECKLIST_ITEM_NODE = "wikiChecklistItem";
   export function collectChecklistCoverage(node): { required: number; answered: number } {
     // walk; for each child.nodeName === CHECKLIST_ITEM_NODE:
     //   required += getAttribute("required") ? 1 : 0
     //   state    = deriveState(child)   // see below
     //   if required && (state === "answered" || state === "not_applicable") answered += 1
     //   (do NOT descend into the item's answer region for nested checklist items)
   }
   ```
   `deriveState(item)`: read attr `state`; if `"not_applicable"`/`"flagged"` use it; else
   inspect the content region — empty (only an empty paragraph / whitespace) ⇒ `unanswered`,
   otherwise `answered`. Keep this pure and well-commented; it is the single source of the
   coverage numbers.

6. **`hocuspocus/src/persistence.ts:176`** — inside the `xmlFragment.length > 0` block, call
   `collectChecklistCoverage(xmlFragment)` and add to the `updates` object (`:217`):
   ```ts
   const cov = collectChecklistCoverage(xmlFragment);
   updates.checklist_required = cov.required;
   updates.checklist_answered = cov.answered;
   ```
   Cheap no-op on ordinary docs (walker finds zero items → writes 0/0). No public-tree gating
   needed for coverage (it's not sensitive).

### 1D. Go — GraphQL: instantiate + coverage fields

7. **`core/pkg/graphql/schema/wiki.graphql`** — extend `WikiDocument` (`:37`) with
   `checklistTemplateId: ID`, `checklistRequired: Int!`, `checklistAnswered: Int!`; add the
   mutation (near `:365`):
   ```graphql
   instantiateChecklist(templateId: ID!, targetOperationId: ID!, parentDocumentId: ID): WikiDocument!
   ```
   Run **`make gqlgen`**. (Generated dirs `graphql/generated/`, `graphql/model/` are
   regenerated — never hand-edit; `gqlgen.yml:21,28`.)

8. **`core/pkg/resolver/wiki_document_resolver.go`** — implement
   `InstantiateChecklist`. It is `CreateWikiDocument` (`:218`) + a content byte-copy:
   - `authorizeForOperation(ctx, targetOperationId, OperationRoleOperator)` (write target).
   - Load the template (`WikiDocument(:1338)` / repo `FindByID`); reject if its `OperationID !=
     ChecklistsRootID` (only templates are instantiable).
   - Create a new doc in `targetOperationId` under `parentDocumentId`, `Title` from template,
     `ChecklistTemplateID = templateId`.
   - **Byte-copy** `template.ContentState` → new doc's `ContentState`, and copy
     `template.Content` (Markdown) so it is searchable before first open. **Go does not decode
     Yjs** — verified low-risk in spec §16. Copy `ChecklistRequired`/`ChecklistAnswered` too so
     the coverage bar is correct pre-open (the sidecar refreshes them on first edit).
   - Return the new doc. It now lives in the operation wiki tree with children/search/backlinks
     for free.

### 1E. Frontend — node + tree + instantiate

9. **`frontend/src/components/wiki/wiki-checklist-item-node.tsx`** (new) — the block node.
   Unlike `wiki-credential-reference-node.tsx:17` (inline atom), this is:
   ```ts
   Node.create({
     name: "wikiChecklistItem",
     group: "block",
     content: "block+",          // the answer region
     defining: true,
     addAttributes() { /* key, group, prompt, answerType, commandHint, required, state,
                          language, enumOptions, multiple */ },
     parseHTML/renderHTML,        // data-* round-trip like the credential node
     addNodeView() { return ReactNodeViewRenderer(ChecklistItemView) },  // renders prompt,
       // commandHint, required badge, state toggle, and NodeViewContent for the answer region
   })
   ```
   The NodeView (`ChecklistItemView`) renders chrome + `<NodeViewContent>` for the answer, and
   switches the region's affordance by `answerType` (code block button for `code`, checkbox for
   `boolean`, select for `enum`). Register it in **`wiki-editor.tsx:374`** alongside the other
   custom extensions.

10. **`frontend/src/components/wiki/wiki-slash-command/items.ts:104`** — add a "Checklist
    item" slash item (and per-type variants or a submenu) mirroring the credential item
    (`:254`): delete range, insert a `wikiChecklistItem` with the chosen `answerType`.

11. **Checklists tree view** — fork **`wiki-tree-sidebar.tsx:161`** (or parameterize it) with
    `operationId = ChecklistsRootID`. Reuse `useWikiDocumentChildren` (`:186`), DnD, reorder.
    Gate create/edit/DnD behind the admin check (read-only tree for non-admins).

12. **Instantiate action** — a button in the Checklists tree header + a target picker (operation
    + parent). On confirm call a new `useInstantiateChecklist` hook:
    - **`frontend/src/graphql/operations/wiki.ts:371`** — add `InstantiateChecklistMutation`.
    - **`frontend/src/graphql/hooks/wiki.ts:504`** — add `useInstantiateChecklist`, invalidate
      the target operation's tree keys (`wikiKeys`, `:45`), then navigate to the new doc.

13. **Per-doc coverage bar** — render `checklistRequired`/`checklistAnswered` as a progress bar
    on the document header (instance and template). Pure presentational; data already on
    `WikiDocument`.

**Phase 1 exit:** an admin authors "Linux Host Recon" as a template doc with grouped scalar
items; an operator instantiates it into an operation; both edit collaboratively; the coverage
bar moves as items are answered; the instance is a normal wiki doc (children, search, backlinks).

---

## Phase 2 — `/host` reference chip

> **Shipped 2026-06-15 (commit `a4eda68`)**, with two deltas from the plan below:
> - **No `answerType` gating.** Since answer types were dropped (see the revision
>   banner), `/host` is a plain inline chip usable anywhere prose is — exactly like
>   `/credential` and `/hash` — not an item-mode affordance. Slash item +
>   operation-scoped picker (`wiki-host-picker.tsx` + reusable `HostPickerList`).
> - **Drops on the Public tree only**, matching the existing credential/hash drop
>   block (the plan's "Public *and* Checklists" was aspirational — credentials/hashes
>   never gated on Checklists, so host follows the same boundary).
> - **Step 16 reduced to the cleanup path.** `CleanupHostReferences` strips dangling
>   ids on host hard-delete; the inverse surface (`hostReferences` field / tombstones /
>   `Host.backlinks` "Referenced in" section) is **deferred** — credentials/hashes
>   expose `X.backlinks` + a standalone query, which for hosts also needs a
>   host-details UI surface. Repo has `FindHostReferrers` ready for when that lands.
> The click target opens the host **form/detail dialog** (`openEditDialog`) — hosts
> have no read-only details panel, so the edit dialog is the app's host detail surface.

14. **Hocuspocus** — `references.ts`: add `HOST_REFERENCE_SELECTOR { nodeName:
    "wikiHostReference", attrName: "hostId" }` and `collectHostReferenceIds` (one-line wrapper
    over `collectNodeAttrIds`, mirroring `collectHashReferenceIds:117`). In
    `persistence.ts:176` invoke it → `updates.host_references = idsToBinaries(...)`; **extend the
    global-tree drop block (`:208`)** so Public *and* Checklists-tree docs drop host refs (hosts
    are operation-private, like credentials).

15. **Go repository** — `wiki_document_repository.go`: add `FindHostReferrers` +
    `PullHostReference` + (optional) `CountHostReferrersBatch`, mirroring the credential trio
    (`:818`, `:869`, `:832`). Add the index `{operation_id, host_references, deleted_at}`
    (`:171` block).

16. **Go resolver/schema** — add `hostReferences: [Host!]!` to `WikiDocument` and a field
    resolver `WikiDocumentHostReferences` resolving `obj.HostReferences` via host repo
    `FindByIDs`, **rendering deleted ids as tombstones** (spec §7) rather than dropping silently.
    Mark `hostReferences: { resolver: true }` in `gqlgen.yml`, `make gqlgen`. Wire host hard-
    delete to `PullHostReference` (mirror `CleanupCredentialReferences:1833`).

17. **Frontend** — `wiki-host-reference-node.tsx` (inline atom, mirrors
    `wiki-hash-reference-node.tsx:17`, attr `hostId`, renders a host chip resolving live
    host data). A **host picker** scoped to `operationId` mirroring
    `wiki-credential-picker.tsx` + `credential-picker-dialog.tsx` (list-only like the hash
    picker is fine). Slash/NodeView affordance: when an item's `answerType === "ref:host"`, the
    answer region's action opens the host picker and inserts a `wikiHostReference`.

**Phase 2 exit:** an operator answers "Hosts on this segment?" by referencing existing Host
findings; the chip resolves live (current routes/logins); cross-operation/global-tree refs are
dropped; deleted hosts tombstone.

---

## Phase 3 — `ref:credential` + `ref:hash` + operation rollup

18. `ref:credential` / `ref:hash` answer types: **config, not plumbing** — the credential/hash
    reference nodes, walkers (`references.ts`), inverse indexes, and pickers already exist.
    Add them as selectable `answerType`s that insert the existing `wikiCredentialReference` /
    `wikiHashReference` nodes into an item's answer region, and count them in `deriveState`.

19. **Operation rollup** — schema query `checklistCoverageRollup(operationId): ...` aggregating
    the operation's checklist docs (`checklist_required > 0`) by group; a triage board view over
    the wiki tree (a "Checklists" filter), not a new collection. Mongo aggregation in the repo;
    field/group breakdown if the projection is extended to per-group counts.

---

## Phase 4 (optional polish)

Template builder UX, OS filtering at instantiation, more ref kinds (`ref:wiki-document`), and a
"from a finding, which checklists reference it" surface (data is already free via the inverse
indexes — see spec §15.6).

---

## Cross-cutting checklist

- **Migration:** new `WikiDocument` fields are additive/omitempty — no backfill needed; existing
  docs read as `checklist_required: 0`. Seed the Checklists-tree folder docs + starter templates
  (spec §12) at startup, mirroring how the Public space is made available without a Mongo op row.
- **Indexes:** add the `host_references` compound index (Phase 2) in the repo index block
  (`wiki_document_repository.go:171`).
- **Generated code:** after every `*.graphql` edit run `make gqlgen`; never hand-edit
  `graphql/generated/` or `graphql/model/`.
- **Tests (per testing rules, 80%):** Go — `AuthorizeOperationRole` Checklists branch
  (read-all/write-admin), `InstantiateChecklist` (byte-copy, template-only guard, target authz),
  host-reference repo + tombstone resolver. Hocuspocus — `collectChecklistCoverage` /
  `deriveState` truth table (required/optional × empty/filled/n-a/flagged) and
  `collectHostReferenceIds`. Frontend — node round-trip (parse/render), coverage bar, instantiate
  flow. Source `core/.env` before `go test` (JWT_SECRET_KEY required).
- **Security review triggers:** the authz branch (1B), the global-tree host-ref drop (Phase 2,
  step 14), and operation-scoping of the host picker all touch the operation-isolation boundary —
  route through the security-reviewer agent before commit.

## Build order (dependency-true)

```
1A sentinel+model ─► 1B authz ─► 1D instantiate (Go)
            └─► 1C coverage projection (sidecar) ─► 1D coverage fields
1D ─► 1E node + tree + instantiate (frontend)            ◄── Phase 1 shippable
Phase 2: 14 walker ─► 15 repo ─► 16 resolver ─► 17 frontend node+picker
Phase 3: 18 ref types ─► 19 rollup
```
