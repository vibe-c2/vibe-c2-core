# Wiki Feature Spec — Operation-Scoped Knowledge Base with Real-Time Collaborative Editing

## 1. Overview

The wiki provides operation-scoped collaborative documentation — playbooks, TTP notes, reconnaissance findings, infrastructure docs, and shared knowledge. Each operation has its own isolated wiki, accessible only to operation members based on their role.

Multiple operators can edit the same document simultaneously with automatic CRDT conflict resolution — no manual merge, no version conflicts, no "someone else is editing" locks.

**Core approach:** Y.js CRDT as the single source of truth for document content, with a pure Go WebSocket relay server. The Go server doesn't parse CRDT operations — it relays binary messages between connected clients and persists opaque snapshots. Markdown is provided by clients alongside Y.js state.

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

Document content is stored as **Y.js CRDT binary state** (`content_state`), not Markdown. The `content` field (Markdown string) still exists but is a **derived field** — provided by the client alongside Y.js updates. This derived Markdown powers full-text search, backups, and the GraphQL API for read-only consumers.

**Why:** Having two authoritative representations (Markdown + CRDT) creates two edit paths, race conditions ("is a collab room active?"), and a `version` field serving two masters. One source of truth is simpler. Y.js handles all conflict resolution — optimistic locking is unnecessary.

**How it works:**
- All content edits flow through Y.js, even single-user sessions
- The browser editor (TipTap/ProseMirror + y-prosemirror) produces Y.js updates
- The client derives Markdown from its Y.Doc (TipTap/ProseMirror serializer) and sends it to the server alongside Y.js binary updates
- The server persists `content_state` (opaque binary blob) and `content` (client-provided Markdown) on each snapshot persist
- The server never parses or decodes Y.js state — it treats `content_state` as an opaque blob
- GraphQL consumers read `content` (Markdown) — they never see `content_state`

### 2.6 No Optimistic Locking for Content

Y.js CRDT replaces optimistic locking for content edits. The `updateWikiDocument` GraphQL mutation handles **metadata only** (title, emoji, color, icon, parentDocumentId, sortOrder). Content is never set via GraphQL — all content edits go through the Y.js WebSocket.

**Why:** CRDT and optimistic locking solve the same problem (concurrent edit conflicts) with different mechanisms. Running both creates complexity with no benefit. CRDT is strictly superior for real-time collaboration.

**What replaces `version`?** Nothing — Y.js merges concurrent edits automatically. Two operators typing at the same time produces a deterministic merge with no user intervention.

### 2.7 Pure Go WebSocket Relay

The Go server acts as a **message relay**, not a CRDT engine. Y.js runs entirely in the browser. The server's job:

1. Maintain per-document "rooms" of connected WebSocket clients
2. Relay Y.js binary messages between clients in the same room
3. Accumulate Y.js binary state in memory (append incoming updates to an opaque byte buffer)
4. Periodically persist accumulated state and client-provided Markdown to MongoDB

**Why not Hocuspocus (Node.js sidecar)?** Adds a separate runtime, container, and cross-service auth to a pure Go stack for 2-10 concurrent users. Disproportionate operational complexity.

**Server does NOT parse Y.js state.** The Go server stores `content_state` as an opaque binary blob. It appends incoming Y.js update messages to the in-memory buffer and persists the accumulated result. Markdown is provided by the client — no server-side Y.js library or CRDT parsing is needed.

### 2.8 WebSocket Authentication

The WebSocket endpoint sits behind the same `middleware.JWTAuth` as GraphQL. JWT cookies are validated at connection upgrade time. No new auth mechanism.

**Why cookies, not tokens in query string?** Query string tokens appear in server logs, proxy logs, and browser history. Cookie-based auth (already used for GraphQL) avoids this.

**Long-lived connections:** JWT is validated only at upgrade time. If the token expires during an active session, the connection stays open (standard WebSocket behavior, same as every major collab tool). Forced disconnect is triggered by:
- Operation membership revocation via EventBus (`TopicOperationMemberRemoved`)
- Role demotion to `viewer` via EventBus (`TopicOperationMemberUpdated`) — see §2.9

### 2.9 Role Enforcement on Active Connections

The CollabManager subscribes to **both** `TopicOperationMemberRemoved` and `TopicOperationMemberUpdated` via EventBus. When a user's role is demoted to `viewer` (or any role below `operator`) while they have an active WebSocket connection:

1. CollabManager receives the role change event
2. Finds all active connections for that user in the affected operation
3. Sends WebSocket close frame with code `4403` and reason `"role-insufficient"`
4. Frontend receives the close frame and shows an appropriate message (e.g., "Your role has changed. This document is now read-only.")

**Why:** JWT is validated only at upgrade time. Without this, a demoted user retains editing access until they disconnect. For a C2 tool, role changes must take immediate effect.

### 2.10 Fractional Indexing for Sort Order

Documents use **fractional indexing** (lexicographic strings) for sort order instead of numeric floats. Fractional index strings (e.g. `"a0"`, `"a0V"`, `"Zz"`) allow unlimited insertions between any two positions without precision loss.

**Why:** Float-based ordering degrades after ~50 insertions in the same gap due to IEEE 754 precision limits. Fractional indexing is used by Figma, Linear, and other collaborative tools for this reason. No periodic rebalancing is needed.

**How it works:**
- New documents get an index after the last sibling
- Inserting between two documents generates a string lexicographically between their indices
- The `sortOrder` field is a string, sorted with standard string comparison

### 2.11 Content and Connection Limits

Conservative limits are enforced at the resolver and WebSocket handler levels:

| Limit | Value | Rationale | Enforcement |
|-------|-------|-----------|-------------|
| Content size | 1 MB | Bounds MongoDB documents, backups, and GraphQL responses | Resolver on create |
| Title length | 200 characters | Prevents abuse | Resolver on create/update |
| Max nesting depth | 10 levels | Prevents unusable deep trees, bounds recursive queries | Resolver on create/update |
| Max clients per room | 20 | Generous for 2-10 person teams; prevents memory abuse | WebSocket handler returns HTTP 503 with `X-Collab-Error: room-full` |
| Max active rooms | 100 | Memory bound for single-instance deployment | WebSocket handler returns HTTP 503 with `X-Collab-Error: server-capacity` |
| Snapshot interval | 30s (env configurable) | Bounds data loss on crash to 30s of edits | CollabManager ticker |
| WebSocket message size | 1 MB | Matches wiki content size limit | WebSocket read limit |
| Y.js state size budget | ~5 MB | CRDT overhead (~5x) on 1MB markdown content limit | See §2.12 CRDT State Compaction |

**Limit rejection behavior:** When max clients per room or max active rooms is reached, the WebSocket upgrade is rejected with HTTP 503. The frontend does **not** auto-retry (avoids thundering herd). The user manually retries. The error response includes the `X-Collab-Error` header so the frontend can show a specific message.

### 2.12 CRDT State Compaction

Y.js is a CRDT — it tracks every insert and delete operation as history, not just the current text. Deleted characters become "tombstones" that remain in the binary state. Over weeks of active editing, a 10KB document can accumulate hundreds of KB or megabytes of CRDT state. Without compaction, `content_state` grows unbounded.

**Server-coordinated, client-executed compaction:**

1. Server tracks `content_state` size on each snapshot persist
2. When a room closes (last client disconnects), if `content_state` size > 2x the derived Markdown (`content`) size, set `needs_compaction: true` on the document in MongoDB
3. On next room creation (first client connects), server checks the `needs_compaction` flag
4. If true, server sends a compaction request message to the connecting client (message type byte `3`)
5. Client performs compaction: creates a fresh Y.Doc, applies the current state (`Y.applyUpdate`), then encodes the compacted result (`Y.encodeStateAsUpdate`). This is built-in Y.js garbage collection — it removes tombstones and produces a minimal state
6. Client sends the compacted state back to the server (message type byte `3`)
7. Server persists the compacted `content_state` and clears `needs_compaction`

**Coordination:** Only the first client to connect gets the compaction request. If multiple clients connect simultaneously, the server assigns it to one (first-write-wins on clearing the flag). If multiple clients compact anyway, it's safe — Y.js compaction is deterministic and idempotent. Applying a compacted state twice is a no-op in CRDT terms.

**Safety thresholds:**
- Log warning when `content_state` exceeds 3 MB
- Hard reject new WebSocket connections at 5 MB with `X-Collab-Error: state-too-large` until compaction succeeds — prevents unbounded growth

## 3. Data Models

### 3.1 WikiDocument

```go
type WikiDocument struct {
    field.DefaultField `bson:",inline"`
    DocumentID         uuid.UUID  `bson:"document_id" json:"documentId"`
    OperationID        uuid.UUID  `bson:"operation_id" json:"operationId"`
    ParentDocumentID   *uuid.UUID `bson:"parent_document_id,omitempty" json:"parentDocumentId,omitempty"`
    Title              string     `bson:"title" json:"title"`
    Content            string     `bson:"content" json:"content"`                                     // Markdown — derived from Y.js state, provided by client
    ContentState       []byte     `bson:"content_state,omitempty" json:"-"`                           // Y.js encoded document state (binary) — SOURCE OF TRUTH
    ContentStateAt     *time.Time `bson:"content_state_at,omitempty" json:"-"`                        // when content_state was last persisted
    NeedsCompaction    bool       `bson:"needs_compaction,omitempty" json:"-"`                        // true if CRDT state needs client-side compaction
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

`json:"-"` on `ContentState`, `ContentStateAt`, `NeedsCompaction` — never exposed via GraphQL. Internal to the collab system.

**MongoDB collection:** `wiki_documents`

**Indexes:**
- `{document_id: 1}` (unique)
- `{operation_id: 1, deleted_at: 1}` (list docs in operation, filter active vs trashed)
- `{operation_id: 1, parent_document_id: 1, deleted_at: 1}` (tree queries — children, roots)
- `{createAt: -1, _id: -1}` (cursor pagination)
- `{operation_id: 1, title: "text", content: "text"}` (full-text search)
- `{last_backup_at: 1, updateAt: 1}` (auto-backup polling — find changed docs)
- `{content_state_at: 1, updateAt: 1}` (for finding docs needing snapshot persist)

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
    Trigger            WikiDocumentBackupTrigger `bson:"trigger" json:"trigger"`
    Description        string                    `bson:"description" json:"description"` // user-provided label for manual, system label for safety backups
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

  # Get active editors for a document. Reads CollabManager in-memory state (no DB query).
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

```
GET /api/v1/ws/wiki/:documentId
```

Protected by `middleware.JWTAuth` (same as GraphQL). Requires `operator` role or higher in the document's operation.

### 5.2 Connection Flow

```
Client                              Go Server
  |                                      |
  |  GET /ws/wiki/:docId                 |
  |  Cookie: access_token=<JWT>          |
  |  Connection: Upgrade                 |
  |------------------------------------->|
  |                                      |
  |              1. JWTAuth middleware    |
  |              2. Load WikiDocument    |
  |              3. Check membership     |
  |                 (role >= operator)   |
  |              4. Check room/server    |
  |                 capacity limits     |
  |              5. Check content_state  |
  |                 size (< 5MB)        |
  |              6. WebSocket upgrade    |
  |              7. Join/create Room     |
  |                                      |
  |<========= 101 Switching Protocols ==>|
  |                                      |
  |<-- stored content_state (sync s1) ---|
  |<-- compaction request (if needed) ---|
  |--- local updates (sync step 2) ---->|
  |                                      |
  |      [ real-time editing session ]   |
  |                                      |
  |--- Y.js update (typing) ----------->|--- relay to other clients
  |<-- Y.js update (from others) -------|
  |--- awareness (cursor pos) --------->|--- relay to other clients
  |<-- awareness (from others) ---------|
  |--- derived markdown (debounced) --->|--- stored in room memory
  |                                      |
```

### 5.3 Message Types

The WebSocket protocol uses a single prefix byte to identify message type:

| Byte | Type | Description |
|------|------|-------------|
| `0` | Sync | Y.js sync protocol (step 1, step 2, update) |
| `1` | Awareness | Cursor positions, user info, selections |
| `2` | Markdown | Client-derived Markdown string (UTF-8 encoded after the prefix byte) |
| `3` | Compaction | Compaction request (server->client) or compacted state (client->server) |

The server relays sync (`0`) and awareness (`1`) messages as-is to all other clients in the room. Markdown (`2`) messages are stored in room memory for the next snapshot persist — not relayed to other clients. Compaction (`3`) messages are point-to-point between server and the assigned client.

### 5.4 Room Lifecycle

1. **First client connects** -> Room created, `content_state` loaded from MongoDB into in-memory buffer. If `needs_compaction` is true, send compaction request to this client.
2. **Client connects to existing room** -> Server sends current in-memory state (sync step 1)
3. **Client sends sync update** -> Relayed to all other clients; appended to in-memory state buffer; room marked dirty
4. **Client sends markdown** -> Stored in room memory (latest wins); not relayed
5. **Client sends compacted state** -> Server persists compacted `content_state`, clears `needs_compaction` flag
6. **Snapshot tick (every 30s)** -> If dirty: persist in-memory state buffer + latest client-provided Markdown to MongoDB, clear dirty flag. Check state size for compaction threshold.
7. **Last client disconnects** -> Final snapshot persist. If `content_state` size > 2x `content` size, set `needs_compaction: true`. Room destroyed.
8. **Server shutdown** -> Snapshot all dirty rooms, close all connections

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

**Role enforcement on active connections:** Role is checked at WebSocket upgrade AND enforced via EventBus on role change. Demotion to `viewer` mid-session triggers immediate disconnect from collab (see §2.9).

## 7. Collab Package Architecture

### 7.1 Package Structure

```
core/pkg/collab/
├── manager.go    # CollabManager: room lifecycle, snapshot ticker, shutdown
├── room.go       # Room: per-document client tracking, broadcast, state
├── client.go     # Client: WebSocket read/write pumps
├── handler.go    # Gin handler: auth, membership check, WS upgrade
└── protocol.go   # WebSocket message type constants
```

### 7.2 CollabManager

```go
type CollabManager struct {
    rooms             map[uuid.UUID]*Room
    mu                sync.RWMutex
    wikiRepo          repository.IWikiDocumentRepository
    operationRepo     repository.IOperationRepository
    eventBus          eventbus.IEventBus
    logger            *zap.Logger
    snapshotInterval  time.Duration  // default 30s, env: WIKI_COLLAB_SNAPSHOT_INTERVAL
    maxClientsPerRoom int            // default 20
    maxActiveRooms    int            // default 100
}
```

**Responsibilities:**
- Create room on first client connect (load `content_state` from MongoDB)
- Destroy room on last client disconnect (final snapshot persist + compaction check)
- Snapshot ticker: every 30s, persist dirty rooms
- Graceful shutdown: snapshot all active rooms, close all connections
- EventBus subscriber on `TopicOperationMemberRemoved`: force-disconnect removed users
- EventBus subscriber on `TopicOperationMemberUpdated`: force-disconnect users demoted below `operator` (close code `4403`, reason `"role-insufficient"`)
- Publish `TopicWikiDocumentUpdated` on snapshot persist (keeps SSE subscribers in sync)
- Publish `TopicWikiPresenceJoined` / `TopicWikiPresenceLeft` on client join/leave

### 7.3 Room

```go
type Room struct {
    documentID      uuid.UUID
    operationID     uuid.UUID
    clients         map[string]*Client  // sessionID -> Client
    mu              sync.RWMutex
    stateBuffer     []byte              // accumulated Y.js binary state (opaque)
    latestMarkdown  string              // last client-provided Markdown
    dirty           bool
    logger          *zap.Logger
}
```

**Responsibilities:**
- Relay sync messages (type `0`) to all clients except sender
- Relay awareness messages (type `1`) to all clients except sender
- Store incoming markdown messages (type `2`) — latest wins
- Append incoming Y.js sync updates to `stateBuffer`
- Report dirty flag for snapshot ticker
- Return `stateBuffer` for persistence

### 7.4 Client

```go
type Client struct {
    conn      *websocket.Conn
    userID    uuid.UUID
    username  string
    sessionID string           // generated server-side (UUID) at WebSocket upgrade time; distinguishes multiple tabs from same user
    room      *Room
    send      chan []byte       // buffered outbound channel (64 capacity)
}
```

Two goroutines per client:
- **Read pump:** Read WebSocket messages -> forward to Room for broadcast + state accumulation
- **Write pump:** Drain `send` channel -> write to WebSocket

Disconnect handling: read pump detects close -> signals Room to remove client -> Room checks if empty -> triggers room destruction if last client.

## 8. Persistence Strategy

### 8.1 Snapshot Persist (every 30s + room close)

```go
func (m *CollabManager) persistRoom(ctx context.Context, room *Room) error {
    // 1. Get accumulated Y.js state (opaque binary)
    state := room.stateBuffer

    // 2. Get latest client-provided Markdown
    markdown := room.latestMarkdown

    // 3. Atomic write to MongoDB
    return m.wikiRepo.PersistCollabState(ctx, room.documentID, state, markdown)
}
```

### 8.2 Repository Method

Add to `IWikiDocumentRepository`:

```go
// PersistCollabState saves Y.js state and client-derived Markdown atomically.
// Updates content_state, content_state_at, content, and updateAt.
PersistCollabState(ctx context.Context, docID uuid.UUID, contentState []byte, markdownContent string) error
```

### 8.3 New Document Initialization

When a document is created via `createWikiDocument`, `content_state` is nil. On first collab session:
- Client creates a fresh Y.Doc
- If the document has `content` (Markdown) from the create mutation, the client can optionally initialize the Y.Doc from it (Markdown -> ProseMirror -> Y.Doc, all client-side)
- The first snapshot persist writes the initial `content_state`

## 9. Presence / Awareness

### 9.1 In-Editor Presence (Cursors, Selections)

Handled entirely by Y.js awareness protocol (message type `1`). Each client broadcasts:

```javascript
awareness.setLocalStateField('user', {
  name: 'alice',
  color: '#ff6600',
  cursor: { anchor: 42, head: 42 }  // ProseMirror selection
})
```

The server relays awareness messages as-is — zero parsing. The protocol includes automatic 30s timeout for stale clients.

### 9.2 Sidebar Presence (Who Is Editing What)

The `wikiDocumentPresence` GraphQL query reads CollabManager's in-memory room state. No database involved. Presence changes are published to EventBus and streamed via SSE subscription (`wikiDocumentPresenceChanged`).

### 9.3 Presence Consistency Note

Y.js awareness (in-editor cursors) and sidebar presence (EventBus) may have slightly different timing on unclean disconnect:
- Y.js awareness has a 30s timeout for stale clients (built into the protocol)
- EventBus `TopicWikiPresenceLeft` fires when Room removes the client (on read pump error detection)

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
    PersistCollabState(ctx context.Context, docID uuid.UUID, contentState []byte, markdownContent string) error
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

- Client joins room -> `TopicWikiPresenceJoined` -> SSE subscription delivers to sidebar
- Client leaves room -> `TopicWikiPresenceLeft` -> SSE subscription delivers to sidebar
- Snapshot persist -> `TopicWikiDocumentUpdated` -> SSE subscription notifies document list
- Operation member removed -> `TopicOperationMemberRemoved` -> CollabManager force-disconnects user
- Operation member role changed -> `TopicOperationMemberUpdated` -> CollabManager checks new role, force-disconnects if below `operator`

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

`restoreWikiDocumentBackup` replaces the document's `title` and `content` with the backup's values. A pre-restore safety backup is created first. This triggers a new auto-backup on the next cycle if the interval has elapsed.

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
| WebSocket disconnects mid-session | y-websocket auto-reconnects (exponential backoff). Client continues editing locally in Y.js. On reconnect, Y.js sync protocol merges local and server state automatically. Zero data loss — edits live in each client's local Y.Doc until sync completes. |
| Server restarts | Same as above — WS connections drop, auto-reconnect, re-sync. |
| Brand new document (no `content_state`) | Client creates fresh Y.Doc. Optionally initializes from existing `content` (Markdown) if present. First snapshot persist writes initial `content_state`. |

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

### CollabManager in `app.go`

```go
collabManager *collab.CollabManager
```

Initialize in `NewApp()`:

```go
collabManager := collab.NewCollabManager(
    repos.WikiDocument, repos.Operation,
    eventBus, logger,
    collab.WithSnapshotInterval(30 * time.Second),
    collab.WithMaxClientsPerRoom(20),
    collab.WithMaxActiveRooms(100),
)
```

Start/stop in `StartServerWithGracefulShutdown()`:

```go
a.collabManager.Start()       // starts snapshot ticker + EventBus subscribers
// ... on shutdown:
a.collabManager.Stop(ctx)     // snapshots all rooms, closes connections
```

### New resolver in `router.go`

```go
wikiDocRes := resolver.NewWikiDocumentResolver(
    repos.WikiDocument, repos.WikiDocumentBackup,
    repos.Operation, eventBus,
)
```

### WebSocket route in `router.go`

Inside the `v1.Use(middleware.JWTAuth(...))` protected group:

```go
v1.GET("/ws/wiki/:documentId", collabManager.HandleWebSocket)
```

### Reverse proxy config (if applicable)

```nginx
location /api/v1/ws/ {
    proxy_pass http://core-dev:8002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
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

### Go (new direct)

| Dependency | Purpose |
|------------|---------|
| `github.com/gorilla/websocket` | WebSocket upgrade + read/write (promote from indirect) |

### Frontend (new npm)

| Dependency | Purpose |
|------------|---------|
| `yjs` | CRDT core |
| `y-prosemirror` | ProseMirror <-> Y.js binding |
| `y-protocols` | Sync + awareness protocols |
| `y-websocket` | WebSocket transport provider |
| `@tiptap/*` or `prosemirror-*` | Rich text editor |

### Infrastructure

**No new services.** WebSocket runs inside the existing Go container on port 8002.

## 18. Implementation

### New files

| File | Purpose |
|------|---------|
| `core/pkg/authorization/operation_auth.go` | Shared operation authorization helper |
| `core/pkg/models/wiki_document.go` | WikiDocument model |
| `core/pkg/models/wiki_document_backup.go` | WikiDocumentBackup + trigger enum |
| `core/pkg/repository/wiki_document_repository.go` | Document data access + filter + tree ops + soft delete + collab state |
| `core/pkg/repository/wiki_backup_repository.go` | Backup data access |
| `core/pkg/resolver/wiki_document_resolver.go` | Document + backup + trash business logic |
| `core/pkg/graphql/schema/wiki.graphql` | GraphQL schema |
| `core/pkg/collab/manager.go` | CollabManager: room lifecycle, snapshot ticker, shutdown, EventBus |
| `core/pkg/collab/room.go` | Room: per-document client tracking, broadcast, state buffer |
| `core/pkg/collab/client.go` | Client: WebSocket read/write pumps |
| `core/pkg/collab/handler.go` | Gin handler: auth, membership, capacity check, WebSocket upgrade |
| `core/pkg/collab/protocol.go` | WebSocket message type constants |

### Modified files

| File | Change |
|------|--------|
| `core/pkg/resolver/operation_resolver.go` | Replace private `authorizeOperationRole` with shared `authorization.AuthorizeOperationRole`; cascade delete wiki data in DeleteOperation |
| `core/pkg/eventbus/eventbus.go` | Wiki document + presence topic constants |
| `core/pkg/eventbus/payloads.go` | Wiki document + presence payload structs + typed constructors |
| `core/pkg/app/app.go` | Wiki repos in Repositories + CollabManager field + init + start/stop lifecycle + auto-backup goroutine |
| `core/pkg/app/router.go` | Create wiki resolver, pass to NewHandler; add WebSocket route |
| `core/pkg/graphql/handler.go` | Accept wiki resolver |
| `core/pkg/graphql/resolver/resolver.go` | Wiki resolver field |
| `core/pkg/graphql/resolver/subscriptions.resolvers.go` | Wiki + presence subscription resolvers |
| `core/pkg/graphql/gqlgen.yml` | Wiki model mappings |
| `core/go.mod` | Add gorilla/websocket (direct) |

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
- WebSocket endpoint for Y.js collaborative editing
- Per-document rooms with client relay and opaque state accumulation
- Client-provided Markdown alongside Y.js state (no server-side CRDT parsing)
- Periodic snapshot persist (30s)
- Graceful shutdown with final snapshot for all active rooms
- Y.js awareness relay for cursor/selection indicators
- Presence query and subscription for sidebar "who is editing"
- Server-coordinated client-side CRDT state compaction
- Force-disconnect on operation membership revocation or role demotion
- Connection and room limits with clear error responses

## 19. Future Work

These features are explicitly out of scope for this implementation:

- **Per-character attribution:** Track which user typed each character (Y.js supports this via CRDT metadata, but UI for displaying it is deferred)
- **Multi-instance relay:** Redis pub/sub for relaying Y.js messages across multiple server instances (current design assumes single instance)
- **Periodic re-authentication:** Heartbeat that re-validates JWT during long WebSocket sessions
- **Per-document permissions:** Optional ACL overrides beyond operation roles
- **Public sharing links:** Token-based read access for external viewers
- **Document export:** Markdown, PDF export
- **Backup retention policies:** Auto-prune old backups (keep last N, time-based)
- **Trash auto-purge:** Configurable auto-purge period for trashed documents
