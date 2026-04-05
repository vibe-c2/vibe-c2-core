# Wiki Feature Spec — Operation-Scoped Knowledge Base with Real-Time Collaborative Editing

## 1. Overview

The wiki provides operation-scoped collaborative documentation — playbooks, TTP notes, reconnaissance findings, infrastructure docs, and shared knowledge. Each operation has its own isolated wiki, accessible only to operation members based on their role.

Multiple operators can edit the same document simultaneously with automatic CRDT conflict resolution — no manual merge, no version conflicts, no "someone else is editing" locks.

**Core approach:** Y.js CRDT as the single source of truth for document content. A **Hocuspocus sidecar** (Node.js) handles real-time WebSocket collaboration, Y.js sync, awareness relay, and content persistence — including server-side Markdown derivation from Y.js state. The Go backend owns everything else: metadata CRUD, permissions, backups, search, and GraphQL API.

Inspired by [Outline](https://getoutline.com), adapted for the C2 team collaboration context: small trusted teams, operational security, and role-based access inherited from the existing operation membership model.

## 2. Design Decisions

### 2.1 Single-Entity Document Tree

The wiki uses a **single `WikiDocument` entity** that forms a recursive tree. Every document is equal — it can have content, children, an icon, and a color. Root-level documents (parentDocumentId = nil) appear as top-level entries in the sidebar; nested documents appear under their parent. There is no distinction between "collections" and "pages" — all documents are the same.

**Why:** A single uniform entity is simpler — one model, one repository, one resolver. Any document can gain children at any time, and reparenting is a single field update.

**How it works:**
- All documents have `icon` and `color` for visual identity
- Any document can have content AND children simultaneously
- Moving a document is just an update: `updateWikiDocument(id, {parentDocumentId: newParentId, sortOrder: newOrder})`
- The frontend decides rendering based on tree depth (indentation, expansion, etc.)

### 2.2 No Document Status / Lifecycle States

Documents have no draft/published/archived status. Every document is live and visible to all operation members once created. There is no publishing workflow.

**Deletion is soft delete** — deleting a document moves it to the operation's trash can. Trashed documents are hidden from all normal queries but can be browsed and restored. Children of a deleted document are also moved to trash alongside their parent.

**Trash can behavior:**
- Each operation has a trash view listing soft-deleted documents
- Restore from trash puts a document back at its original tree position (preserves `parentDocumentId`). If the original parent was also permanently deleted, the document is restored to root level.
- "Permanently delete" removes a single document from trash (admin only, hard delete)
- "Empty trash" permanently deletes all trashed documents in an operation (admin only)
- A pre-delete backup is auto-created before soft-deleting, so the document's state is always recoverable even after permanent deletion from trash

**Why:** In a C2 team context, documents are working artifacts — not publishing workflows. Draft/archive states add UI and backend complexity without clear value. Soft delete with trash provides an undo safety net without adding lifecycle complexity.

### 2.3 Backups Instead of Revisions

Documents use **periodic backups** instead of per-edit revisions. With real-time collaborative editing (Y.js CRDT), changes arrive as micro-operations — creating a revision per edit would generate thousands of entries per session. Backups capture meaningful snapshots at controlled intervals.

**Two trigger modes:**
- **Automatic** — the system creates a backup every N minutes (configurable, default 30min). Only created if content actually changed since the last backup.
- **Manual** — any operator can trigger a backup with an optional description (e.g., "Before restructuring section 3").

**Safety backups** are auto-created before destructive operations:
- Before soft-deleting a document -> backup with description "Pre-delete snapshot"
- Before restoring from a backup -> backup with description "Pre-restore snapshot"

**Why:** Revisions tied to saves are incompatible with continuous collaborative editing. Backups give predictable storage growth, meaningful restore points, and user control over what gets snapshotted. Safety backups ensure no data is lost even during delete/restore operations.

### 2.4 Permissions Inherit from Operation Membership

No per-document ACLs. The existing operation role hierarchy (admin > operator > viewer) governs all wiki access. All operation members see all wiki content at their role level.

**Authorization is extracted to a shared package** (`core/pkg/authorization`) so both the operation resolver and wiki resolver use the same logic. The existing private `authorizeOperationRole` method on `operationResolver` is refactored into a public `AuthorizeOperationRole` function in this shared package.

**Why:** C2 teams are small and trusted at their role level. Per-document ACLs add complexity with limited benefit. A shared authorization package prevents drift between resolvers.

### 2.5 Y.js as Single Source of Truth for Content

Document content is stored as **Y.js CRDT binary state** (`content_state`), not Markdown. The `content` field (Markdown string) still exists but is a **derived field** — generated server-side by the Hocuspocus sidecar using `@hocuspocus/transformer`. This derived Markdown powers full-text search, backups, and the GraphQL API for read-only consumers.

**Why:** Having two authoritative representations (Markdown + CRDT) creates two edit paths, race conditions ("is a collab room active?"), and a `version` field serving two masters. One source of truth is simpler. Y.js handles all conflict resolution — optimistic locking is unnecessary.

**How it works:**
- All content edits flow through Y.js via the Hocuspocus WebSocket, even single-user sessions
- The browser editor (TipTap/ProseMirror + y-prosemirror) produces Y.js updates
- Hocuspocus manages the Y.Doc server-side and syncs updates between clients
- On each persist (debounced, ~2s), Hocuspocus derives Markdown from the Y.Doc via `@hocuspocus/transformer` (Y.Doc -> ProseMirror JSON -> Markdown) and writes both `content_state` (binary) and `content` (Markdown) to MongoDB
- The Go backend reads `content` (Markdown) for search, backups, and GraphQL — it never touches `content_state`
- GraphQL consumers read `content` (Markdown) — they never see `content_state`

### 2.6 No Optimistic Locking for Content

Y.js CRDT replaces optimistic locking for content edits. The `updateWikiDocument` GraphQL mutation handles **metadata only** (title, emoji, color, icon, parentDocumentId, sortOrder). Content is never set via GraphQL — all content edits go through the Y.js WebSocket.

**Why:** CRDT and optimistic locking solve the same problem (concurrent edit conflicts) with different mechanisms. Running both creates complexity with no benefit. CRDT is strictly superior for real-time collaboration.

**What replaces `version`?** Nothing — Y.js merges concurrent edits automatically. Two operators typing at the same time produces a deterministic merge with no user intervention.

### 2.7 Hocuspocus Sidecar for Real-Time Collaboration

Real-time collaborative editing is handled by a **Hocuspocus sidecar** — a Node.js service running alongside the Go backend. Hocuspocus is TipTap's Y.js collaboration backend: it manages WebSocket connections, syncs Y.js CRDT state between clients, relays awareness (cursors/presence), and persists document content to MongoDB.

**Why Hocuspocus instead of a pure Go implementation?** A pure Go server could integrate Y.js via WASM bindings, but Hocuspocus is the pragmatic choice: it's battle-tested, maintained by the TipTap team, and provides a rich extension ecosystem (database persistence, webhook notifications, auth hooks) with the standard Y.js sync protocol out of the box. Building an equivalent from scratch — WASM integration, sync protocol, awareness relay, ProseMirror-to-Markdown transformation — is not worth the effort for a small-team tool. Concretely, Hocuspocus solves three problems that a custom implementation would need to reimplement: (1) server-side Markdown derivation from Y.js state, (2) automatic CRDT compaction and garbage collection, and (3) a standard wire protocol with no custom message types. The operational cost of one additional container is justified by the massive reduction in application complexity.

**Separation of concerns:**
- **Hocuspocus** (Node.js sidecar): WebSocket server, Y.js sync protocol, awareness relay, content persistence (`content_state` + derived `content`), collab ticket verification
- **Go backend**: Authentication, authorization, collab ticket issuance, metadata CRUD, permissions, backups, search, GraphQL API, role enforcement, presence tracking for GraphQL subscriptions
- **Shared**: MongoDB (Hocuspocus writes content fields, Go writes everything else), collab ticket secret (environment variable)

**Communication between services:**
- **Go -> Hocuspocus**: HTTP calls for force-disconnect on role demotion/removal (internal Docker network only)
- **Hocuspocus -> Go**: Webhooks for content change notifications (`onChange`) and connection events (`onConnect`, `onDisconnect`)
- **Shared state**: Both services read/write the same `wiki_documents` MongoDB collection, but to non-overlapping fields

**Webhook reliability:** Hocuspocus webhook calls use retry with exponential backoff (3 attempts: 1s, 2s, 4s delays). This is implemented in the custom Database extension's `store()` callback — the `@hocuspocus/extension-webhook` does not natively support retries, so webhook calls are made manually with retry logic alongside content persistence. If all retries fail, the failure is logged and the event is lost. Presence tracker and GraphQL subscriptions are best-effort — the presence tracker rebuilds from subsequent events, and missed document update notifications are acceptable for small teams.

### 2.8 WebSocket Authentication

Authentication uses a **collab ticket pattern** — all auth logic stays in Go, Hocuspocus only verifies a pre-signed ticket. This avoids duplicating membership checks across two services.

**Flow:**
1. Client calls Go REST endpoint: `POST /api/v1/wiki/collab-ticket` (behind `JWTAuth` middleware) with `{ documentId }` in the body
2. Go validates the JWT, loads the document, checks operation membership (`role >= operator`)
3. Go returns a short-lived **collab ticket** — a signed JWT (separate `HOCUSPOCUS_TICKET_SECRET`, ~30s expiry) scoped to `{ userId, username, operationId, documentId }`
4. Client passes the collab ticket to HocuspocusProvider as the `token` parameter
5. Hocuspocus `onAuthenticate` hook verifies the ticket signature and expiry using `HOCUSPOCUS_TICKET_SECRET` — no MongoDB query, no membership logic

**Why a collab ticket instead of passing the main JWT?** A collab ticket keeps all authorization logic in Go — there is exactly one implementation of membership checking. If the membership model changes (new roles, new conditions), only Go needs updating. Hocuspocus is a dumb verifier: valid signature + not expired = allow.

**Why not cookies or query strings?** Hocuspocus uses its own WebSocket provider protocol where the token is sent as a connection parameter. Query string tokens appear in logs and browser history.

**Long-lived connections:** The collab ticket is validated only at connection time. Once the WebSocket is established, the connection stays open regardless of ticket expiry (standard WebSocket behavior, same as every major collab tool). Forced disconnect is triggered by:
- Operation membership revocation — Go backend calls Hocuspocus disconnect API
- Role demotion to `viewer` — Go backend calls Hocuspocus disconnect API (see §2.9)

**Reconnect and token refresh:** HocuspocusProvider is configured with a `token` callback (not a static string) that fetches a fresh collab ticket before each connection attempt. On reconnect (e.g., after network interruption or Hocuspocus restart):
1. HocuspocusProvider calls the `token` callback
2. Callback calls `POST /api/v1/wiki/collab-ticket` with the current access token
3. If the access token has expired (401 response), the callback refreshes it via `/api/v1/login/refresh` first, then retries the ticket request
4. Fresh collab ticket is returned to the provider, connection proceeds

This means reconnects after access token expiry work transparently — the provider always gets a fresh ticket.

### 2.9 Role Enforcement on Active Connections

The Go backend subscribes to **both** `TopicOperationMemberRemoved` and `TopicOperationMemberUpdated` via EventBus. When a user's role is demoted to `viewer` (or any role below `operator`) while they have an active Hocuspocus WebSocket connection:

1. Go backend receives the role change event via EventBus
2. Calls Hocuspocus's internal HTTP endpoint: `POST http://hocuspocus:1234/api/disconnect` with `{ userId, operationId }`
3. Hocuspocus closes matching WebSocket connections with close code `4403` and reason `"role-insufficient"`
4. Frontend receives the close frame and shows an appropriate message (e.g., "Your role has changed. This document is now read-only.")

The Hocuspocus disconnect endpoint is internal-only (Docker network, not exposed via reverse proxy).

**Why:** JWT is validated only at connection time. Without this, a demoted user retains editing access until they disconnect. For a C2 tool, role changes must take immediate effect.

### 2.10 Fractional Indexing for Sort Order

Documents use **fractional indexing** (lexicographic strings) for sort order instead of numeric floats. Fractional index strings (e.g. `"a0"`, `"a0V"`, `"Zz"`) allow unlimited insertions between any two positions without precision loss.

**Why:** Float-based ordering degrades after ~50 insertions in the same gap due to IEEE 754 precision limits. Fractional indexing is used by Figma, Linear, and other collaborative tools for this reason. No periodic rebalancing is needed.

**How it works:**
- New documents get an index after the last sibling
- Inserting between two documents generates a string lexicographically between their indices
- The `sortOrder` field is a string, sorted with standard string comparison

### 2.11 Content and Connection Limits

Conservative limits are enforced at the resolver and Hocuspocus hook levels:

| Limit | Value | Rationale | Enforcement |
|-------|-------|-----------|-------------|
| Content size | 1 MB | Bounds MongoDB documents, backups, and GraphQL responses | Go resolver on create; Hocuspocus `onStoreDocument` as secondary check |
| Title length | 200 characters | Prevents abuse | Go resolver on create/update |
| Max nesting depth | 10 levels | Prevents unusable deep trees, bounds recursive queries | Go resolver on create/update |
| Max clients per room | 20 | Generous for 2-10 person teams; prevents memory abuse | Hocuspocus `onConnect` hook |
| Max active rooms | 100 | Memory bound for single-instance deployment | Hocuspocus `onConnect` hook |
| Persist debounce | 2s (env configurable) | Bounds data loss on crash to ~2s of edits | Hocuspocus Database extension `debounce` config |
| WebSocket message size | 1 MB | Matches wiki content size limit | Hocuspocus server config |

**Limit rejection behavior:** When max clients per room or max active rooms is reached, Hocuspocus rejects the connection. The frontend does **not** auto-retry (avoids thundering herd). The user manually retries.

**CRDT state size:** Y.js performs internal struct merging and tombstone garbage collection when Hocuspocus loads and manages the Y.Doc server-side. No custom compaction logic is needed. If state size becomes a concern in the future, Hocuspocus can call `Y.encodeStateAsUpdate(doc)` periodically in `onStoreDocument` to produce a compacted snapshot — a one-liner requiring no client involvement.

### 2.12 Nginx Reverse Proxy

All app services (frontend, Go backend, Hocuspocus) are unified behind a single **nginx reverse proxy** on port `8080`. No service exposes its own port to the host — all traffic flows through nginx.

**Why:** A single entry point eliminates CORS (frontend and API share the same origin), simplifies frontend configuration (`/api/v1` instead of `http://localhost:8002/api/v1`), and matches production topology where a reverse proxy is always present.

**Routing table:**

| Path | Upstream | Notes |
|------|----------|-------|
| `/api/v1/ws/wiki/` | `hocuspocus:1234` | WebSocket upgrade for Y.js collab |
| `/api/` | `core-dev:8002` | REST + GraphQL + internal webhooks |
| `/swagger/` | `core-dev:8002` | Swagger UI (dev only) |
| `/` | `frontend-dev:5173` | Vite dev server + HMR WebSocket |

Route order matters — `/api/v1/ws/wiki/` must match before the general `/api/` block, otherwise WebSocket upgrade requests hit the Go backend instead of Hocuspocus.

**WebSocket handling:** Two locations require WebSocket upgrade headers:
- `/api/v1/ws/wiki/` — Hocuspocus Y.js sync protocol. `proxy_read_timeout` set to 24h to keep long-lived collab connections alive.
- `/` — Vite dev server uses WebSocket for Hot Module Replacement (`/__vite_hmr`). Passing `Upgrade` headers on the catch-all location covers this transparently.

**Frontend environment:** With nginx, the frontend `VITE_API_URL` changes from `http://localhost:8002/api/v1` (cross-origin) to `/api/v1` (same origin, relative). This eliminates all CORS configuration for browser requests.

**Dev vs production:** In development, the `/` location proxies to the Vite dev server (with HMR). In production, nginx serves pre-built static files directly from disk instead. The API and WebSocket routes remain the same.

## 3. Data Models

### 3.1 WikiDocument

```go
type WikiDocument struct {
    field.DefaultField `bson:",inline"`
    DocumentID         uuid.UUID  `bson:"document_id" json:"documentId"`
    OperationID        uuid.UUID  `bson:"operation_id" json:"operationId"`
    ParentDocumentID   *uuid.UUID `bson:"parent_document_id,omitempty" json:"parentDocumentId,omitempty"`
    Title              string     `bson:"title" json:"title"`
    Content            string     `bson:"content" json:"content"`                                     // Markdown — derived by Hocuspocus from Y.js state
    ContentState       []byte     `bson:"content_state,omitempty" json:"-"`                           // Y.js binary state — written by Hocuspocus
    ContentStateAt     *time.Time `bson:"content_state_at,omitempty" json:"-"`                        // when Hocuspocus last persisted
    Emoji              string     `bson:"emoji" json:"emoji"`
    Color              string     `bson:"color" json:"color"`                                         // hex color for UI
    Icon               string     `bson:"icon" json:"icon"`                                           // icon identifier
    SortOrder          string     `bson:"sort_order" json:"sortOrder"`                                // fractional index string
    CreatedByID        uuid.UUID  `bson:"created_by_id" json:"createdById"`
    LastBackupAt       *time.Time `bson:"last_backup_at,omitempty" json:"lastBackupAt,omitempty"`
    DeletedAt          *time.Time `bson:"deleted_at,omitempty" json:"deletedAt,omitempty"`
    DeletedByID        *uuid.UUID `bson:"deleted_by_id,omitempty" json:"deletedById,omitempty"`
}
```

`json:"-"` on `ContentState`, `ContentStateAt` — never exposed via GraphQL. Written by Hocuspocus, internal to the collab system.

**MongoDB collection:** `wiki_documents`

**Indexes:**
- `{document_id: 1}` (unique)
- `{operation_id: 1, deleted_at: 1}` (list docs in operation, filter active vs trashed)
- `{operation_id: 1, parent_document_id: 1, deleted_at: 1}` (tree queries — children, roots)
- `{createAt: -1, _id: -1}` (cursor pagination)
- `{operation_id: 1, title: "text", content: "text"}` (full-text search)
- `{last_backup_at: 1, updateAt: 1}` (auto-backup polling — find changed docs)

### 3.2 WikiDocumentBackup

```go
type WikiDocumentBackupTrigger string

const (
    WikiDocumentBackupTriggerAuto   WikiDocumentBackupTrigger = "auto"
    WikiDocumentBackupTriggerManual WikiDocumentBackupTrigger = "manual"
)

type WikiDocumentBackup struct {
    field.DefaultField `bson:",inline"`
    BackupID           uuid.UUID                 `bson:"backup_id" json:"backupId"`
    DocumentID         uuid.UUID                 `bson:"document_id" json:"documentId"`
    OperationID        uuid.UUID                 `bson:"operation_id" json:"operationId"`
    Title              string                    `bson:"title" json:"title"`
    Content            string                    `bson:"content" json:"content"`
    ContentState       []byte                    `bson:"content_state,omitempty" json:"-"`  // Y.js binary state snapshot — enables lossless restore
    Trigger            WikiDocumentBackupTrigger `bson:"trigger" json:"trigger"`
    Description        string                    `bson:"description" json:"description"`    // user-provided label for manual, system label for safety backups
    CreatedByID        uuid.UUID                 `bson:"created_by_id" json:"createdById"`
}
```

**MongoDB collection:** `wiki_document_backups`

**Indexes:**
- `{backup_id: 1}` (unique)
- `{document_id: 1, createAt: -1}` (list backups for a document, newest first)
- `{operation_id: 1}`

## 4. GraphQL Schema

### 4.1 Types

```graphql
enum WikiDocumentBackupTrigger {
  AUTO
  MANUAL
}

enum PresenceAction {
  JOINED
  LEFT
}

type WikiDocument {
  id: ID!
  operationId: ID!
  parentDocument: WikiDocument       # null for root documents
  childDocuments: [WikiDocument!]!   # immediate children, sorted by sortOrder
  title: String!
  content: String!                   # Markdown — derived from Y.js state, read-only via GraphQL
  emoji: String!
  color: String!                     # hex color
  icon: String!                      # icon identifier
  sortOrder: String!                 # fractional index
  childCount: Int!                   # computed: number of active (non-deleted) children
  createdBy: User!
  lastBackupAt: String
  deletedAt: String                  # null if active, ISO timestamp if trashed
  deletedBy: User                    # null if active
  createdAt: String!
  updatedAt: String!
}

type WikiDocumentEdge {
  node: WikiDocument!
  cursor: String!
}

type WikiDocumentConnection {
  edges: [WikiDocumentEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type WikiDocumentBackup {
  id: ID!
  documentId: ID!
  title: String!
  content: String!
  trigger: WikiDocumentBackupTrigger!
  description: String!               # empty for auto backups, system label for safety backups
  createdBy: User!
  createdAt: String!
}

type WikiDocumentBackupEdge {
  node: WikiDocumentBackup!
  cursor: String!
}

type WikiDocumentBackupConnection {
  edges: [WikiDocumentBackupEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type WikiDocumentPresence {
  documentId: ID!
  activeEditors: [WikiDocumentEditor!]!
}

type WikiDocumentEditor {
  userId: ID!
  username: String!
  connectedAt: String!
}

type WikiDocumentPresenceEvent {
  documentId: ID!
  operationId: ID!
  userId: ID!
  username: String!
  action: PresenceAction!
}
```

### 4.2 Inputs

```graphql
input CreateWikiDocumentInput {
  parentDocumentId: ID               # null = root document
  title: String!
  content: String
  emoji: String
  color: String
  icon: String
  sortOrder: String                  # fractional index; server generates if omitted
}

input UpdateWikiDocumentInput {
  title: String
  emoji: String
  color: String
  icon: String
  parentDocumentId: ID               # reparent (null = move to root)
  sortOrder: String                  # fractional index
  # NOTE: no content field — content edits go through Y.js WebSocket only
  # NOTE: no version field — CRDT handles conflict resolution
}
```

### 4.3 Queries

```graphql
extend type Query {
  # Get a single wiki document by ID.
  wikiDocument(id: ID!): WikiDocument!
    @hasPermission(permission: "operation:member")

  # List wiki documents within an operation (active documents only).
  # Pass parentDocumentId to list children of a specific document.
  # Omit parentDocumentId to list all documents (flat, for search).
  wikiDocuments(
    operationId: ID!
    parentDocumentId: ID
    search: String
    first: Int = 20
    after: String
    last: Int
    before: String
  ): WikiDocumentConnection!
    @hasPermission(permission: "operation:member")

  # Get the full document tree for an operation (active documents only).
  # Returns a flat list; the frontend reconstructs the tree via parentDocument references.
  wikiDocumentTree(operationId: ID!): [WikiDocument!]!
    @hasPermission(permission: "operation:member")

  # List soft-deleted documents in the operation's trash.
  wikiDocumentTrash(
    operationId: ID!
    first: Int = 20
    after: String
    last: Int
    before: String
  ): WikiDocumentConnection!
    @hasPermission(permission: "operation:member")

  # List backups for a document, newest first.
  wikiDocumentBackups(
    documentId: ID!
    trigger: WikiDocumentBackupTrigger
    first: Int = 20
    after: String
    last: Int
    before: String
  ): WikiDocumentBackupConnection!
    @hasPermission(permission: "operation:member")

  # Get a specific backup.
  wikiDocumentBackup(id: ID!): WikiDocumentBackup!
    @hasPermission(permission: "operation:member")

  # Get active editors for a document. Reads PresenceTracker in-memory state (no DB query).
  wikiDocumentPresence(documentId: ID!): WikiDocumentPresence!
    @hasPermission(permission: "operation:member")
}
```

### 4.4 Mutations

```graphql
extend type Mutation {
  # Document CRUD
  createWikiDocument(operationId: ID!, input: CreateWikiDocumentInput!): WikiDocument!
    @hasPermission(permission: "operation:member")

  updateWikiDocument(id: ID!, input: UpdateWikiDocumentInput!): WikiDocument!
    @hasPermission(permission: "operation:member")

  # Soft delete — moves document and its children to trash.
  # Auto-creates a pre-delete backup for each affected document.
  deleteWikiDocument(id: ID!): Boolean!
    @hasPermission(permission: "operation:member")

  # Restore a soft-deleted document from trash.
  # Restores to original tree position; falls back to root if parent was permanently deleted.
  restoreWikiDocument(id: ID!): WikiDocument!
    @hasPermission(permission: "operation:member")

  # Permanently delete a single document from trash (hard delete). Admin only.
  permanentlyDeleteWikiDocument(id: ID!): Boolean!
    @hasPermission(permission: "operation:member")

  # Permanently delete all trashed documents in an operation. Admin only.
  emptyWikiDocumentTrash(operationId: ID!): Boolean!
    @hasPermission(permission: "operation:member")

  # Manual backup — snapshot the current document state with an optional description
  createWikiDocumentBackup(documentId: ID!, description: String): WikiDocumentBackup!
    @hasPermission(permission: "operation:member")

  # Restore from backup — replaces document content with the backup's content.
  # Auto-creates a pre-restore backup before overwriting.
  restoreWikiDocumentBackup(documentId: ID!, backupId: ID!): WikiDocument!
    @hasPermission(permission: "operation:member")

  # Delete a specific backup
  deleteWikiDocumentBackup(id: ID!): Boolean!
    @hasPermission(permission: "operation:member")
}
```

### 4.5 Subscriptions

```graphql
type WikiDocumentEvent {
  action: EventAction!
  documentId: ID!
  operationId: ID!
  parentDocumentId: ID
  document: WikiDocument
}

extend type Subscription {
  wikiDocumentChanged(operationId: ID!): WikiDocumentEvent!
    @hasPermission(permission: "operation:member")

  # Real-time editor join/leave events for documents in an operation.
  wikiDocumentPresenceChanged(operationId: ID!): WikiDocumentPresenceEvent!
    @hasPermission(permission: "operation:member")
}
```

**Subscription filtering:** The `wikiDocumentChanged` subscription must verify the subscriber is a member of the specified operation, using the same `buildOperationFilter` pattern as the existing `OperationChanged` subscription. If membership is revoked mid-subscription, event delivery stops.

## 5. WebSocket Protocol

### 5.1 Endpoint

The nginx reverse proxy (see §2.12) routes WebSocket traffic to the Hocuspocus sidecar:

```
Client -> nginx:8080/api/v1/ws/wiki/:documentId -> hocuspocus:1234
```

Hocuspocus uses the document ID as the room name. The collab ticket (obtained from Go beforehand, see §2.8) is verified in the `onAuthenticate` hook. The ticket already proves `operator` role or higher in the document's operation.

### 5.2 Connection Flow

```
Client (Browser)                     Go Backend                     Hocuspocus Sidecar
  |                                      |                              |
  |  POST /api/v1/wiki/collab-ticket     |                              |
  |  Authorization: Bearer <JWT>         |                              |
  |  { documentId }                      |                              |
  |------------------------------------->|                              |
  |                                      |                              |
  |              1. JWTAuth middleware    |                              |
  |              2. Load document         |                              |
  |              3. Check membership     |                              |
  |                 (role >= operator)    |                              |
  |              4. Sign collab ticket    |                              |
  |                 (~30s expiry)         |                              |
  |                                      |                              |
  |  { ticket: "<signed-ticket>" }       |                              |
  |<-------------------------------------|                              |
  |                                      |                              |
  |  WebSocket connect (HocuspocusProvider)                             |
  |  token: <collab-ticket>              |                              |
  |  documentName: wiki/{docId}          |                              |
  |------------------------------------------------------------>       |
  |                                         |                           |
  |              1. onAuthenticate:         |                           |
  |                 verify ticket signature |                           |
  |                 + expiry (no DB query)  |                           |
  |              2. onConnect:              |                           |
  |                 check room/server       |                           |
  |                 capacity limits         |                           |
  |              3. onLoadDocument:         |                           |
  |                 fetch content_state     |                           |
  |                 from MongoDB            |                           |
  |              4. WebSocket upgrade       |                           |
  |                                         |                           |
  |<======= Y.js sync step 1 =============>|                           |
  |<======= Y.js sync step 2 =============>|                           |
  |                                         |                           |
  |      [ real-time editing session ]      |                           |
  |                                         |                           |
  |--- Y.js update (typing) -------------->|--- relay to other clients  |
  |<-- Y.js update (from others) ----------|                           |
  |--- awareness (cursor) ---------------->|--- relay to other clients  |
  |<-- awareness (from others) ------------|                           |
  |                                         |                           |
  |              onStoreDocument (debounced, ~2s):                      |
  |              - persist content_state to MongoDB                     |
  |              - derive markdown via transformer                      |
  |              - persist content to MongoDB                           |
  |                                         |-- webhook: onChange ----->|
  |                                         |                publish EventBus
  |                                         |                           |
```

### 5.3 Protocol

The WebSocket protocol is the **standard Hocuspocus/Y.js sync protocol** — no custom message types. Hocuspocus handles Y.js sync messages (step 1, step 2, update) and awareness messages natively. The client uses `@hocuspocus/provider` (HocuspocusProvider) which implements the protocol automatically.

### 5.4 Room Lifecycle

1. **First client connects** -> Hocuspocus creates room, calls `onLoadDocument` to fetch `content_state` from MongoDB, loads Y.Doc from binary state
2. **Client connects to existing room** -> Hocuspocus syncs current Y.Doc state to new client (Y.js sync step 1/2)
3. **Client sends sync update** -> Hocuspocus applies to Y.Doc, relays to all other clients
4. **Persist debounce fires (~2s after last change)** -> Hocuspocus calls `onStoreDocument`: encodes Y.Doc to binary, derives Markdown via transformer, writes both to MongoDB, sends webhook to Go backend
5. **Last client disconnects** -> Hocuspocus persists immediately (built-in behavior), destroys room, sends `onDisconnect` webhook
6. **Hocuspocus shutdown** -> Persists all open documents, closes all connections

## 6. Permission Model

All wiki GraphQL fields use `@hasPermission(permission: "operation:member")` as the app-level gate. The resolver checks operation membership via the shared `authorization.AuthorizeOperationRole` function and enforces role requirements:

| Action | Minimum Role | Notes |
|--------|-------------|-------|
| Read documents | `viewer` | All operation members can read via GraphQL |
| Browse trash | `viewer` | View soft-deleted documents |
| Create document | `operator` | |
| Edit document metadata | `operator` | Via `updateWikiDocument` (title, emoji, color, icon, sortOrder) |
| Edit document content | `operator` | Via collab WebSocket only |
| Connect to collab WebSocket | `operator` | Viewers read via GraphQL only |
| Move / reparent | `operator` | Via `updateWikiDocument` with `parentDocumentId` + `sortOrder` |
| Soft delete document | `operator` | Moves to trash; auto-creates pre-delete backup |
| Restore from trash | `operator` | Restores to original tree position |
| Permanently delete (from trash) | `admin` | Hard delete; irreversible |
| Empty trash | `admin` | Hard delete all trashed docs in operation |
| View backups | `viewer` | Read-only history |
| Create manual backup | `operator` | Snapshot current state |
| Restore from backup | `operator` | Replaces document content; auto-creates pre-restore backup |
| Delete backup | `admin` | |
| View presence (who is editing) | `viewer` | Via GraphQL query/subscription |

**Role enforcement on active connections:** Role is checked by Go at collab ticket issuance time (before WebSocket connect) AND enforced by the Go backend on role change via Hocuspocus disconnect API. Demotion to `viewer` mid-session triggers immediate disconnect from collab (see §2.9).

## 7. Wiki Integration Package (Go Side)

### 7.1 Package Structure

The Go backend does **not** handle WebSocket connections — Hocuspocus does. The Go side has a lightweight integration package:

```
core/pkg/wiki/
├── presence.go           # PresenceTracker: in-memory presence map, queried by GraphQL
├── webhook.go            # Gin handler for Hocuspocus webhook callbacks
└── hocuspocus_client.go  # HTTP client for Hocuspocus disconnect API
```

### 7.2 PresenceTracker

```go
type Editor struct {
    UserID      uuid.UUID
    Username    string
    ConnectedAt time.Time
}

type PresenceTracker struct {
    editors map[uuid.UUID][]Editor  // documentID -> active editors
    mu      sync.RWMutex
    logger  *zap.Logger
}
```

**Responsibilities:**
- Updated by Hocuspocus webhook `onConnect`/`onDisconnect` events
- Queried by `wikiDocumentPresence` GraphQL resolver (no DB query)
- Publishes `TopicWikiPresenceJoined` / `TopicWikiPresenceLeft` on EventBus

### 7.3 WebhookHandler

```go
type WebhookHandler struct {
    presenceTracker *PresenceTracker
    eventBus        eventbus.IEventBus
    webhookSecret   string           // HMAC-SHA256 shared secret
    logger          *zap.Logger
}
```

Gin handler for `POST /api/v1/internal/wiki/webhook`:
- Validates HMAC-SHA256 signature (`X-Hocuspocus-Signature-256` header) using shared `HOCUSPOCUS_WEBHOOK_SECRET`
- On `onChange`: publishes `TopicWikiDocumentUpdated` on EventBus (triggers GraphQL subscriptions)
- On `onConnect`: updates PresenceTracker, publishes `TopicWikiPresenceJoined`
- On `onDisconnect`: updates PresenceTracker, publishes `TopicWikiPresenceLeft`

This endpoint is internal-only — not behind JWTAuth, but behind HMAC signature validation.

### 7.4 HocuspocusClient

```go
type HocuspocusClient struct {
    baseURL       string   // e.g., "http://hocuspocus:1234"
    webhookSecret string
    httpClient    *http.Client
    logger        *zap.Logger
}
```

**Responsibilities:**
- `DisconnectUser(ctx, userID, operationID)` — calls `POST http://hocuspocus:1234/api/disconnect` to force-close WebSocket connections for a user (see §2.9)
- Called by Go EventBus subscribers when operation membership is revoked or role is demoted below `operator`

## 8. Persistence Strategy

### 8.1 Hocuspocus Content Persistence

Hocuspocus owns persistence of content fields using the **Database extension** with custom `fetch()`/`store()` callbacks:

**`fetch(documentName)`:**
- Reads `content_state` from the `wiki_documents` collection by `document_id`
- Returns the binary Y.js state (Uint8Array) or null for new documents

**`store(documentName, state)`:**
- Encodes the Y.Doc as binary (`Y.encodeStateAsUpdate`)
- Derives Markdown from the Y.Doc via `@hocuspocus/transformer` (Y.Doc -> ProseMirror JSON -> Markdown)
- Writes `content_state`, `content`, and `content_state_at` to MongoDB via `$set` — leaving Go-owned fields untouched
- Debounced (~2s by default, configurable via `HOCUSPOCUS_DEBOUNCE_MS` env var)
- Fires immediately on last client disconnect (built-in Hocuspocus behavior)

### 8.2 Go Backend Content Access

The Go backend reads `content` (Markdown) from MongoDB for backups, search, and GraphQL. It never reads or writes `content_state` during normal operation.

**Backup restore:** When `restoreWikiDocumentBackup` restores a document, the Go backend writes both the backup's `content` and `content_state` back to the document. On the next client open, Hocuspocus's `onLoadDocument` loads the restored `content_state` and the Y.Doc is fully reconstructed — lossless, no client-side conversion needed.

**Fallback for legacy backups:** If a backup has no `content_state` (created before this field existed, or edge case), the Go backend writes the backup's `content` and sets `content_state` to nil. On the next client open, Hocuspocus's `onLoadDocument` sees nil `content_state`, and the frontend initializes a fresh Y.Doc from the Markdown content (Markdown -> ProseMirror -> Y.Doc, client-side). This round-trip may be slightly lossy for rich content but is acceptable as a fallback.

**Storage note:** Backups with `content_state` are larger (~2-5x the Markdown size due to CRDT overhead), but lossless restore is worth the storage cost.

### 8.3 New Document Initialization

When a document is created via `createWikiDocument`, `content_state` is nil. On first collab session:
- Hocuspocus's `onLoadDocument` returns null (no binary state to load)
- Client creates a fresh Y.Doc via HocuspocusProvider
- If the document has `content` (Markdown) from the create mutation, the client initializes the Y.Doc from it (Markdown -> ProseMirror -> Y.Doc, all client-side)
- The first `onStoreDocument` writes the initial `content_state` + derived `content` to MongoDB

## 9. Presence / Awareness

### 9.1 In-Editor Presence (Cursors, Selections)

Handled entirely by Hocuspocus's built-in Y.js awareness relay. Each client broadcasts:

```javascript
awareness.setLocalStateField('user', {
  name: 'alice',
  color: '#ff6600',
  cursor: { anchor: 42, head: 42 }  // ProseMirror selection
})
```

Hocuspocus relays awareness messages between clients automatically. The protocol includes automatic 30s timeout for stale clients.

### 9.2 Sidebar Presence (Who Is Editing What)

The `wikiDocumentPresence` GraphQL query reads the Go backend's `PresenceTracker` in-memory map (see §7.2). No database involved. The map is updated by Hocuspocus webhooks on `onConnect`/`onDisconnect`. Presence changes are published to EventBus and streamed via SSE subscription (`wikiDocumentPresenceChanged`).

### 9.3 Presence Consistency Note

Y.js awareness (in-editor cursors) and sidebar presence (Go PresenceTracker) may have slightly different timing on unclean disconnect:
- Y.js awareness has a 30s timeout for stale clients (built into the protocol)
- Hocuspocus fires the `onDisconnect` webhook when it detects connection loss, which updates the Go PresenceTracker

Both are triggered by WebSocket close, so they happen at roughly the same time for clean disconnects. For network-level disconnects where the close frame is never received, there is a known ~30s window where the sidebar may show a ghost editor while the Y.js awareness timeout fires. This is acceptable — the ghost clears automatically.

## 10. Repository Interface

### 10.1 IWikiDocumentRepository

```go
type WikiDocumentFilter struct {
    ParentDocumentID *uuid.UUID  // set = children of that doc
    RootsOnly        bool        // true = only root documents (parentDocumentID is nil)
    Search           string
    Trashed          bool        // true = only soft-deleted docs, false = only active docs
}

type IWikiDocumentRepository interface {
    Create(ctx context.Context, doc *models.WikiDocument) error
    FindByID(ctx context.Context, id uuid.UUID) (models.WikiDocument, error)
    FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter WikiDocumentFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.WikiDocument, error)
    CountByOperationID(ctx context.Context, opID uuid.UUID, filter WikiDocumentFilter) (int64, error)
    FindChildDocuments(ctx context.Context, parentID uuid.UUID) ([]models.WikiDocument, error)
    FindAllByOperationID(ctx context.Context, opID uuid.UUID) ([]models.WikiDocument, error)  // for tree query (active only)
    CountChildDocuments(ctx context.Context, parentID uuid.UUID) (int64, error)                // for childCount field (active only)
    FindDescendants(ctx context.Context, docID uuid.UUID) ([]models.WikiDocument, error)       // for cascading soft-delete to children
    NestingDepth(ctx context.Context, parentID uuid.UUID) (int, error)                         // for enforcing max depth
    SoftDelete(ctx context.Context, doc *models.WikiDocument, deletedByID uuid.UUID) error
    SoftDeleteBatch(ctx context.Context, docIDs []uuid.UUID, deletedByID uuid.UUID) error      // for cascading children
    Restore(ctx context.Context, doc *models.WikiDocument) error
    Update(ctx context.Context, doc *models.WikiDocument, updates map[string]interface{}) error
    HardDelete(ctx context.Context, doc *models.WikiDocument) error
    HardDeleteByOperationID(ctx context.Context, opID uuid.UUID) error                          // cascade on operation delete
    HardDeleteTrashed(ctx context.Context, opID uuid.UUID) error                                // empty trash
    FindChangedSinceLastBackup(ctx context.Context, batchSize int64) ([]models.WikiDocument, error)  // for auto-backup job
    RestoreFromBackup(ctx context.Context, docID uuid.UUID, content string, contentState []byte) error  // for backup restore: writes content + content_state (nil content_state triggers client-side re-init as fallback)
}
```

### 10.2 IWikiDocumentBackupRepository

```go
type IWikiDocumentBackupRepository interface {
    Create(ctx context.Context, backup *models.WikiDocumentBackup) error
    FindByID(ctx context.Context, id uuid.UUID) (models.WikiDocumentBackup, error)
    FindByDocumentIDWithCursor(ctx context.Context, docID uuid.UUID, trigger *models.WikiDocumentBackupTrigger, cursor *pagination.Cursor, limit int64, forward bool) ([]models.WikiDocumentBackup, error)
    CountByDocumentID(ctx context.Context, docID uuid.UUID, trigger *models.WikiDocumentBackupTrigger) (int64, error)
    FindLatestByDocumentID(ctx context.Context, docID uuid.UUID) (*models.WikiDocumentBackup, error)  // for auto-backup change detection
    Delete(ctx context.Context, backup *models.WikiDocumentBackup) error
    DeleteByDocumentID(ctx context.Context, docID uuid.UUID) error
    DeleteByOperationID(ctx context.Context, opID uuid.UUID) error
}
```

## 11. EventBus Integration

### 11.1 Wiki Document Topics

```go
TopicWikiDocumentCreated     Topic = "wiki.document.created"
TopicWikiDocumentUpdated     Topic = "wiki.document.updated"
TopicWikiDocumentSoftDeleted Topic = "wiki.document.soft_deleted"
TopicWikiDocumentRestored    Topic = "wiki.document.restored"
TopicWikiDocumentMoved       Topic = "wiki.document.moved"
TopicWikiDocumentHardDeleted Topic = "wiki.document.hard_deleted"
```

### 11.2 Wiki Document Payload

```go
type WikiDocumentEventPayload struct {
    DocumentID       string
    OperationID      string
    ParentDocumentID string     // empty if root
    Title            string
    DeletedAt        string     // empty if active, ISO timestamp if soft-deleted
}
```

### 11.3 Presence Topics

```go
TopicWikiPresenceJoined Topic = "wiki.presence.joined"
TopicWikiPresenceLeft   Topic = "wiki.presence.left"
```

### 11.4 Presence Payload

```go
type WikiPresencePayload struct {
    DocumentID  string
    OperationID string
    UserID      string
    Username    string
}
```

### 11.5 Event Flow

- Client joins room -> Hocuspocus webhook `onConnect` -> Go PresenceTracker + `TopicWikiPresenceJoined` -> SSE subscription delivers to sidebar
- Client leaves room -> Hocuspocus webhook `onDisconnect` -> Go PresenceTracker + `TopicWikiPresenceLeft` -> SSE subscription delivers to sidebar
- Content persisted -> Hocuspocus webhook `onChange` -> Go publishes `TopicWikiDocumentUpdated` -> SSE subscription notifies document list
- Operation member removed -> `TopicOperationMemberRemoved` -> Go calls Hocuspocus disconnect API -> user's WebSocket closed
- Operation member role changed -> `TopicOperationMemberUpdated` -> Go checks new role, calls Hocuspocus disconnect API if below `operator`

## 12. Backup Strategy

### Automatic Backups

A background goroutine runs on a configurable interval (default: 30 minutes). On each tick:

1. Call `FindChangedSinceLastBackup` to find documents where `updateAt > lastBackupAt` (or `lastBackupAt` is nil), limited to a batch size (default: 100)
2. For each changed document, create a `WikiDocumentBackup` with `trigger: auto`
3. Update the document's `lastBackupAt` timestamp
4. If any individual backup fails, log the error and continue with the next document

**Design constraints:**
- Uses the `{last_backup_at: 1, updateAt: 1}` index for efficient polling
- Processes in batches to prevent long-running ticks
- Each tick has a context timeout to prevent overlap with the next tick
- Uses `ActorSystem()` for event bus events

The interval is configurable via environment variable (e.g., `WIKI_AUTO_BACKUP_INTERVAL=30m`).

### Safety Backups

Auto-created before destructive operations:
- **Pre-delete:** Before `deleteWikiDocument` soft-deletes a document, create a backup with `trigger: auto` and `description: "Pre-delete snapshot"`. Applied to each document being moved to trash (parent + descendants).
- **Pre-restore:** Before `restoreWikiDocumentBackup` overwrites document content, create a backup with `trigger: auto` and `description: "Pre-restore snapshot"`.

### Manual Backups

Any operator can call `createWikiDocumentBackup(documentId, description)` to snapshot the current state. Manual backups always succeed regardless of whether content changed — the user explicitly wants a checkpoint.

### Restore from Backup

`restoreWikiDocumentBackup` replaces the document's `title`, `content`, and `content_state` with the backup's values (see §8.2). If the backup has `content_state`, the restore is lossless. If not (legacy backups), `content_state` is set to nil so Hocuspocus reinitializes from Markdown on the next client connection. A pre-restore safety backup is created first. This triggers a new auto-backup on the next cycle if the interval has elapsed.

### Retention

MVP keeps all backups. Manual empty-trash purges backups for permanently deleted documents. Future retention policy options:
- Keep all manual backups indefinitely (user intentionally created them)
- Auto-backups: keep last N per document (e.g., 50) or time-based pruning
- Configurable per operation or globally

## 13. Search Strategy

Full-text search is available from day one via MongoDB text index on `{operation_id, title, content}`.

| Feature | Details |
|---------|---------|
| Title regex | Same pattern as `buildOperationSearchFilter` — case-insensitive, escaped. Used when `search` param is short or for prefix matching. |
| MongoDB text index | `$text` with `$search` on `{title, content}` — word-level full-text with stemming. Used for longer search queries. |
| Future: external engine | Meilisearch/Elasticsearch synced via EventBus subscribers (if needed for advanced ranking/highlighting). |

## 14. Cascade Deletion

### Operation deleted -> hard delete all wiki data

In `OperationResolver.DeleteOperation`, call `HardDeleteByOperationID` on both wiki repositories (documents + backups). This deletes everything including trashed documents. Same pattern as SchemeNetworkPoint cascade.

### Document soft-deleted -> cascade to children

1. Find all descendant documents via `FindDescendants`
2. Create pre-delete safety backups for each document (parent + descendants)
3. Soft-delete all descendants via `SoftDeleteBatch`
4. Soft-delete the document itself

### Document permanently deleted (from trash) -> delete backups

1. Delete all backups for the document via `DeleteByDocumentID`
2. Hard-delete the document
3. Note: children were already soft-deleted with the parent; they remain in trash independently

### Empty trash -> purge all trashed docs + their backups

1. Find all trashed documents in operation
2. Delete all backups for each trashed document
3. Hard-delete all trashed documents via `HardDeleteTrashed`

## 15. Degradation / Reconnection

Documents can only be edited through the collab WebSocket. There is no offline editing fallback mutation. If the WebSocket is unavailable, the document is effectively read-only until the connection is restored.

| Scenario | Behavior |
|----------|----------|
| WebSocket disconnects mid-session | HocuspocusProvider auto-reconnects (exponential backoff). Client continues editing locally in Y.js. On reconnect, Y.js sync protocol merges local and server state automatically. Zero data loss — edits live in each client's local Y.Doc until sync completes. |
| Hocuspocus restarts | Same as above — WS connections drop, auto-reconnect, re-sync. Hocuspocus persists on shutdown, so at most ~2s of edits may need re-sync from client state. |
| Go backend restarts | No effect on active editing sessions — Hocuspocus handles collaboration independently. Webhooks may fail temporarily; Hocuspocus continues operating. Presence tracker rebuilds from subsequent webhook events. |
| Brand new document (no `content_state`) | Hocuspocus `onLoadDocument` returns null. Client creates fresh Y.Doc via HocuspocusProvider. Optionally initializes from existing `content` (Markdown) if present. First `onStoreDocument` writes initial `content_state`. |

## 16. App Wiring

### New shared authorization package

```
core/pkg/authorization/operation_auth.go
```

Extract `authorizeOperationRole` from `operationResolver` into:
```go
func AuthorizeOperationRole(ctx context.Context, op *models.Operation, minRole models.OperationRole) error
```

Both `operationResolver` and `wikiDocumentResolver` import and call this function. The existing `operationResolver.authorizeOperationRole` private method is replaced with a call to the shared function.

### New fields in `app.go` Repositories struct

```go
WikiDocument       repository.IWikiDocumentRepository
WikiDocumentBackup repository.IWikiDocumentBackupRepository
```

### Wiki integration in `app.go`

```go
presenceTracker *wiki.PresenceTracker
hpClient        *wiki.HocuspocusClient
```

Initialize in `NewApp()`:

```go
presenceTracker := wiki.NewPresenceTracker(logger)
hpClient := wiki.NewHocuspocusClient(
    env.Get("HOCUSPOCUS_URL", "http://hocuspocus:1234"),
    env.Get("HOCUSPOCUS_WEBHOOK_SECRET", ""),
    logger,
)
```

EventBus subscribers for role enforcement (started in `NewApp()` or `Run()`):

```go
// Subscribe to membership changes -> call Hocuspocus disconnect API
eventBus.Subscribe(TopicOperationMemberRemoved, func(payload interface{}) {
    // extract userID, operationID from payload
    hpClient.DisconnectUser(ctx, userID, operationID)
})
eventBus.Subscribe(TopicOperationMemberUpdated, func(payload interface{}) {
    // if new role < operator, disconnect
    hpClient.DisconnectUser(ctx, userID, operationID)
})
```

### New resolver in `router.go`

```go
wikiDocRes := resolver.NewWikiDocumentResolver(
    repos.WikiDocument, repos.WikiDocumentBackup,
    repos.Operation, eventBus,
)
```

### Collab ticket route in `router.go`

Protected by JWTAuth (same as GraphQL):

```go
wikiGroup := v1.Group("/wiki")
wikiGroup.Use(middleware.JWTAuth(authProvider))
wikiGroup.POST("/collab-ticket", controller.NewWikiController(repos.WikiDocument, repos.Operation, ticketSecret, logger))
```

### Webhook route in `router.go`

Internal webhook endpoint (not behind JWTAuth, behind HMAC validation):

```go
internal := v1.Group("/internal")
internal.POST("/wiki/webhook", wiki.NewWebhookHandler(presenceTracker, eventBus, webhookSecret, logger))
```

### Nginx reverse proxy config (`nginx/default.conf`)

Full nginx configuration unifying all app services behind port 8080 (see §2.12):

```nginx
upstream backend {
    server core-dev:8002;
}

upstream hocuspocus {
    server hocuspocus:1234;
}

upstream frontend {
    server frontend-dev:5173;
}

server {
    listen 80;

    # Hocuspocus WebSocket — MUST come before /api/ to match first
    location /api/v1/ws/wiki/ {
        proxy_pass http://hocuspocus;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
    }

    # Go backend REST + GraphQL
    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Swagger UI
    location /swagger/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
    }

    # Frontend (Vite dev server + HMR WebSocket)
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### Extended `Resolver` struct in `graphql/resolver/resolver.go`

```go
WikiDocumentResolver resolver.IWikiDocumentResolver
```

### gqlgen.yml additions

Map `WikiDocument`, `WikiDocumentBackup`, and `WikiDocumentBackupTrigger` to Go models with field resolvers for computed/formatted fields (id, timestamps, parentDocument, childDocuments, createdBy, deletedBy, childCount).

### Auto-backup background job

Started in `NewApp()` or `Run()` — a goroutine with a ticker that calls the backup logic. Accepts a `context.Context` for graceful shutdown. Uses batched processing with per-tick timeouts.

## 17. Dependencies

### Go

No new direct dependencies for collaborative editing. The Go backend uses only the standard library `net/http` client for webhook handling and Hocuspocus API calls.

### Frontend (new npm)

| Dependency | Purpose |
|------------|---------|
| `yjs` | CRDT core |
| `y-prosemirror` | ProseMirror <-> Y.js binding |
| `y-protocols` | Sync + awareness protocols |
| `@hocuspocus/provider` | WebSocket transport provider (replaces `y-websocket`) |
| `@tiptap/*` or `prosemirror-*` | Rich text editor |

### Hocuspocus sidecar (new npm)

| Dependency | Purpose |
|------------|---------|
| `@hocuspocus/server` | Y.js collaboration server |
| `@hocuspocus/extension-database` | Generic database persistence driver |
| `@hocuspocus/transformer` | Y.Doc -> ProseMirror JSON -> Markdown conversion |
| `mongodb` | MongoDB driver for persistence |
| `jsonwebtoken` | Collab ticket signature verification |

### Infrastructure

**New service: Hocuspocus sidecar.** Node.js container on the internal Docker network. Shares MongoDB connection and collab ticket secret with the Go backend. See Docker Compose addition in §18.

**New service: Nginx reverse proxy.** All app traffic flows through nginx on port 8080 (see §2.12). Routes `/api/v1/ws/wiki/` to Hocuspocus, `/api/` to Go backend, `/` to frontend. No app service exposes its own host port. See Docker Compose addition and nginx config in §18.

## 18. Implementation

### New Go files

| File | Purpose |
|------|---------|
| `core/pkg/authorization/operation_auth.go` | Shared operation authorization helper |
| `core/pkg/models/wiki_document.go` | WikiDocument model |
| `core/pkg/models/wiki_document_backup.go` | WikiDocumentBackup + trigger enum |
| `core/pkg/repository/wiki_document_repository.go` | Document data access + filter + tree ops + soft delete |
| `core/pkg/repository/wiki_backup_repository.go` | Backup data access |
| `core/pkg/resolver/wiki_document_resolver.go` | Document + backup + trash business logic |
| `core/pkg/graphql/schema/wiki.graphql` | GraphQL schema |
| `core/pkg/wiki/presence.go` | PresenceTracker: in-memory presence map, queried by GraphQL |
| `core/pkg/wiki/webhook.go` | Gin handler for Hocuspocus webhook callbacks |
| `core/pkg/wiki/hocuspocus_client.go` | HTTP client for Hocuspocus disconnect API |
| `core/pkg/controller/wiki_controller.go` | REST handler for `POST /api/v1/wiki/collab-ticket` (auth ticket issuance) |

### New Hocuspocus files

| File | Purpose |
|------|---------|
| `hocuspocus/package.json` | Node.js dependencies |
| `hocuspocus/tsconfig.json` | TypeScript config |
| `hocuspocus/src/index.ts` | Server entry point: wires extensions, hooks, internal HTTP endpoint |
| `hocuspocus/src/auth.ts` | `onAuthenticate`: collab ticket signature + expiry verification (no MongoDB query) |
| `hocuspocus/src/persistence.ts` | Database extension: `fetch()` reads `content_state`, `store()` writes `content_state` + derived markdown + sends webhook to Go with retry |
| `hocuspocus/src/disconnect.ts` | Internal `POST /api/disconnect` handler (called by Go for role enforcement) |
| `hocuspocus/Dockerfile` | Production image |
| `hocuspocus/dev.Dockerfile` | Development image with hot reload |

### New nginx files

| File | Purpose |
|------|---------|
| `nginx/default.conf` | Reverse proxy config — routes to frontend, Go backend, and Hocuspocus (see §16) |

### Modified files

| File | Change |
|------|--------|
| `core/pkg/resolver/operation_resolver.go` | Replace private `authorizeOperationRole` with shared `authorization.AuthorizeOperationRole`; cascade delete wiki data in DeleteOperation |
| `core/pkg/eventbus/eventbus.go` | Wiki document + presence topic constants |
| `core/pkg/eventbus/payloads.go` | Wiki document + presence payload structs + typed constructors |
| `core/pkg/app/app.go` | Wiki repos in Repositories + PresenceTracker + HocuspocusClient fields + init + EventBus subscribers for role enforcement + auto-backup goroutine |
| `core/pkg/app/router.go` | Create wiki resolver, pass to NewHandler; add internal webhook route; add collab ticket REST route |
| `core/pkg/graphql/handler.go` | Accept wiki resolver |
| `core/pkg/graphql/resolver/resolver.go` | Wiki resolver field |
| `core/pkg/graphql/resolver/subscriptions.resolvers.go` | Wiki + presence subscription resolvers |
| `core/pkg/graphql/gqlgen.yml` | Wiki model mappings |
| `docker-compose.yml` | Add hocuspocus service |

### Docker Compose additions

```yaml
hocuspocus:
  build:
    context: ./hocuspocus
    dockerfile: dev.Dockerfile
  container_name: vibec2-hocuspocus
  restart: unless-stopped
  profiles:
    - development
  environment:
    MONGO_URI: mongodb://${MONGO_INITDB_ROOT_USERNAME}:${MONGO_INITDB_ROOT_PASSWORD}@mongodb:27017
    MONGO_DATABASE: ${MONGO_DATABASE}
    HOCUSPOCUS_TICKET_SECRET: ${HOCUSPOCUS_TICKET_SECRET}
    HOCUSPOCUS_WEBHOOK_SECRET: ${HOCUSPOCUS_WEBHOOK_SECRET}
    HOCUSPOCUS_WEBHOOK_URL: http://core-dev:8002/api/v1/internal/wiki/webhook
    HOCUSPOCUS_DEBOUNCE_MS: 2000
    PORT: 1234
  depends_on:
    mongodb:
      condition: service_healthy
  networks:
    - vibec2

nginx:
  image: nginx:alpine
  container_name: vibec2-nginx
  restart: unless-stopped
  profiles:
    - development
  ports:
    - "8080:80"
  volumes:
    - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
  depends_on:
    - core-dev
    - frontend-dev
    - hocuspocus
  networks:
    - vibec2
```

### Docker Compose modifications

The following existing services lose their host port mappings — all app traffic goes through nginx:

- **core-dev**: remove `ports: ["8002:8002"]`
- **frontend-dev**: remove `ports: ["5173:5173"]`
- **seaweedfs-master**: remove `ports: ["9333:9333"]` (internal only)
- **seaweedfs-volume**: remove `ports: ["8080:8080"]` (internal only)
- **seaweedfs-filer**: remove `ports: ["8888:8888"]` (internal only)
- **seaweedfs-s3**: remove `ports: ["8333:8333"]` (internal only)

Frontend environment change: `VITE_API_URL` changes from `http://localhost:8002/api/v1` to `/api/v1` (same-origin through nginx, no CORS needed).

### Deliverables

- Create documents at any level with fractional index ordering
- Nest documents in a tree (max 10 levels)
- Content limits (1MB content, 200-char title)
- Soft delete with trash can (browse, restore, permanently delete, empty trash)
- Automatic periodic backups with batched processing
- Manual backups with descriptions
- Safety backups before delete and restore operations
- Restore from backup
- Move/reparent via `updateWikiDocument`
- Full-text search via MongoDB text index
- Real-time subscriptions with operation membership filtering
- Cascade deletion on operation delete
- Hocuspocus sidecar for Y.js collaborative editing (WebSocket, sync, persistence)
- Server-side Markdown derivation from Y.js state via `@hocuspocus/transformer`
- Content persistence with ~2s debounce + immediate persist on last disconnect
- Y.js awareness relay for cursor/selection indicators (Hocuspocus built-in)
- Presence query and subscription for sidebar "who is editing" (Go PresenceTracker via webhooks)
- Force-disconnect on operation membership revocation or role demotion (Go -> Hocuspocus API)
- Connection and room limits enforced in Hocuspocus hooks
- Nginx reverse proxy unifying frontend, backend, and Hocuspocus on port 8080

## 19. Future Work

These features are explicitly out of scope for this implementation:

- **Per-character attribution:** Track which user typed each character (Y.js supports this via CRDT metadata, but UI for displaying it is deferred)
- **Multi-instance Hocuspocus:** Redis extension for syncing Y.js state across multiple Hocuspocus instances behind a load balancer (current design assumes single Hocuspocus instance)
- **Periodic re-authentication:** Heartbeat that re-validates JWT during long WebSocket sessions
- **Per-document permissions:** Optional ACL overrides beyond operation roles
- **Public sharing links:** Token-based read access for external viewers
- **Document export:** Markdown, PDF export
- **Backup retention policies:** Auto-prune old backups (keep last N, time-based)
- **Trash auto-purge:** Configurable auto-purge period for trashed documents
