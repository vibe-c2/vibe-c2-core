# Collaborative Editing Spec — Real-Time Co-Editing for Wiki

## 1. Overview

This spec extends the wiki feature (`wiki-feature-spec.md`) with real-time collaborative editing. Multiple operators can edit the same document simultaneously with automatic CRDT conflict resolution — no manual merge, no version conflicts, no "someone else is editing" locks.

The approach: **Y.js CRDT as the single source of truth**, with a pure Go WebSocket relay server. The Go server doesn't parse CRDT operations — it relays binary messages between connected clients and persists opaque snapshots. Markdown is a derived format, regenerated server-side on every persist.

## 2. Design Decisions

### 2.1 Y.js as Single Source of Truth

Document content is stored as **Y.js CRDT binary state** (`content_state`), not Markdown. The `content` field (Markdown string) still exists but is a **derived field** — regenerated server-side from Y.js state on every persist. This derived Markdown powers full-text search, backups, and the GraphQL API for read-only consumers.

**Why:** Having two authoritative representations (Markdown + CRDT) creates two edit paths, race conditions ("is a collab room active?"), and a `version` field serving two masters. One source of truth is simpler. Y.js handles all conflict resolution — optimistic locking is unnecessary.

**How it works:**
- All content edits flow through Y.js, even single-user sessions
- The browser editor (TipTap/ProseMirror + y-prosemirror) produces Y.js updates
- The server persists `content_state` (binary blob) and derives `content` (Markdown) server-side using a Go Y.js library
- GraphQL consumers read `content` (Markdown) — they never see `content_state`

### 2.2 Pure Go WebSocket Relay

The Go server acts as a **message relay**, not a CRDT engine. Y.js runs entirely in the browser. The server's job:

1. Maintain per-document "rooms" of connected WebSocket clients
2. Relay Y.js binary messages between clients in the same room
3. Accumulate Y.js state in memory (via Go Y.js library)
4. Periodically persist state to MongoDB and derive Markdown

**Why not Hocuspocus (Node.js sidecar)?** Adds a separate runtime, container, and cross-service auth to a pure Go stack for 2-10 concurrent users. Disproportionate operational complexity.

**Why not a full Go Y.js implementation?** No mature Go implementation exists that handles the full sync protocol. The relay approach needs only basic Y.js state accumulation (applying updates to a Y.Doc), which existing Go libraries support.

### 2.3 Server-Side Markdown Derivation

On every snapshot persist (periodic + room close), the server decodes Y.js state into Markdown using a Go Y.js library. No client round-trip needed.

**Pipeline:**
```
Y.js binary state ([]byte)
  → Go Y.js library decodes to YDoc
  → Extract Y.XmlFragment (ProseMirror document tree)
  → Tree-walk: convert ProseMirror nodes to Markdown
  → string
```

**Go library candidates** (evaluate during implementation):

| Library | Notes |
|---------|-------|
| `github.com/skyterra/y-crdt` | Most complete native Go Y.js implementation, cross-language compat testing |
| `github.com/wakflo/yjsgo` | Native Go, supports `ApplyUpdate` + `ToString` |
| `github.com/averyyan/YJS-GO` | Supports Y.Array, Y.Map, Y.Text |
| `github.com/nicksrandall/prosemirror-go` | ProseMirror JSON → HTML/Markdown/plaintext conversion |

**Fallback:** If decoding fails (edge case, library bug), `content_state` is still persisted — it's the source of truth. Markdown will be stale until the next successful decode. Log the error and continue.

### 2.4 No Optimistic Locking for Content

The wiki spec's `version` field and optimistic locking are **replaced** by Y.js CRDT for content edits. The `updateWikiDocument` GraphQL mutation handles **metadata only** (title, emoji, color, icon, parentDocumentId, sortOrder). Content is never set via GraphQL.

**Why:** CRDT and optimistic locking solve the same problem (concurrent edit conflicts) with different mechanisms. Running both creates complexity with no benefit. CRDT is strictly superior for real-time collaboration.

**What replaces `version`?** Nothing — Y.js merges concurrent edits automatically. Two operators typing at the same time produces a deterministic merge with no user intervention.

### 2.5 WebSocket Authentication

The WebSocket endpoint sits behind the same `middleware.JWTAuth` as GraphQL. JWT cookies are validated at connection upgrade time. No new auth mechanism.

**Why cookies, not tokens in query string?** Query string tokens appear in server logs, proxy logs, and browser history. Cookie-based auth (already used for GraphQL) avoids this.

**Long-lived connections:** JWT is validated only at upgrade time. If the token expires during an active session, the connection stays open (standard WebSocket behavior, same as every major collab tool). Forced disconnect is triggered by operation membership revocation via EventBus.

### 2.6 Content and Connection Limits

| Limit | Value | Rationale |
|-------|-------|-----------|
| Max clients per room | 20 | Generous for 2-10 person teams; prevents memory abuse |
| Max active rooms | 100 | Memory bound for single-instance deployment |
| Snapshot interval | 30s (env configurable) | Bounds data loss on crash to 30s of edits |
| WebSocket message size | 1 MB | Matches wiki content size limit |
| Y.js state size budget | ~5 MB | CRDT overhead (~5x) on 1MB markdown content limit |

## 3. Data Model Changes

### 3.1 WikiDocument — Modified Fields

These changes apply on top of the WikiDocument model defined in `wiki-feature-spec.md`:

**Added fields:**

```go
ContentState   []byte     `bson:"content_state,omitempty" json:"-"`    // Y.js encoded document state (binary) — SOURCE OF TRUTH
ContentStateAt *time.Time `bson:"content_state_at,omitempty" json:"-"` // when content_state was last persisted
```

`json:"-"` — never exposed via GraphQL. Internal to the collab system.

**Removed fields:**

```go
// REMOVED: Version int64 — no optimistic locking, CRDT handles conflicts
// REMOVED: LastEditedByID uuid.UUID — collab makes single-author tracking meaningless;
//          awareness protocol shows who is currently editing
```

**Changed semantics:**

- `Content` (string) — was source of truth, now **derived** from `content_state`. Still stored in MongoDB for full-text search, backups, and read-only API consumers.

### 3.2 New MongoDB Index

```
{content_state_at: 1, updateAt: 1}  // for finding docs needing snapshot persist
```

## 4. GraphQL Schema Changes

These changes apply on top of the GraphQL schema defined in `wiki-feature-spec.md`.

### 4.1 Modified Types

```graphql
type WikiDocument {
  # ... all fields from wiki-feature-spec.md EXCEPT:
  # REMOVED: version: Int!
  # REMOVED: lastEditedBy: User!
  # CHANGED: content is now read-only (derived from Y.js state)
  content: String!  # Markdown — derived from Y.js state, read-only via GraphQL
}
```

### 4.2 Modified Inputs

```graphql
input UpdateWikiDocumentInput {
  title: String
  emoji: String
  color: String
  icon: String
  parentDocumentId: ID
  sortOrder: String
  # REMOVED: version: Int! — no optimistic locking
  # REMOVED: content: String — content edits go through Y.js WebSocket only
}
```

### 4.3 New Types — Presence

```graphql
enum PresenceAction {
  JOINED
  LEFT
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

### 4.4 New Query — Presence

```graphql
extend type Query {
  # Get active editors for a document. Reads CollabManager in-memory state (no DB query).
  wikiDocumentPresence(documentId: ID!): WikiDocumentPresence!
    @hasPermission(permission: "operation:member")
}
```

### 4.5 New Subscription — Presence

```graphql
extend type Subscription {
  # Real-time editor join/leave events for documents in an operation.
  wikiDocumentPresenceChanged(operationId: ID!): WikiDocumentPresenceEvent!
    @hasPermission(permission: "operation:member")
}
```

### 4.6 New Mutation — Offline State Sync

```graphql
extend type Mutation {
  # Sync Y.js state when WebSocket is unavailable (offline/degraded mode).
  # Accepts base64-encoded Y.js document state.
  # Server persists content_state and derives Markdown.
  syncWikiDocumentState(documentId: ID!, state: String!): WikiDocument!
    @hasPermission(permission: "operation:member")
}
```

## 5. WebSocket Protocol

### 5.1 Endpoint

```
GET /api/v1/ws/wiki/:documentId
```

Protected by `middleware.JWTAuth` (same as GraphQL). Requires `operator` role or higher in the document's operation.

### 5.2 Connection Flow

```
Client                              Go Server
  │                                      │
  │  GET /ws/wiki/:docId                 │
  │  Cookie: access_token=<JWT>          │
  │  Connection: Upgrade                 │
  │─────────────────────────────────────▶│
  │                                      │
  │              1. JWTAuth middleware    │
  │              2. Load WikiDocument    │
  │              3. Check membership     │
  │                 (role >= operator)   │
  │              4. WebSocket upgrade    │
  │              5. Join/create Room     │
  │                                      │
  │◀════════ 101 Switching Protocols ═══▶│
  │                                      │
  │◀── stored content_state (sync s1) ──│
  │── local updates (sync step 2) ─────▶│
  │                                      │
  │      [ real-time editing session ]   │
  │                                      │
  │── Y.js update (typing) ────────────▶│── relay to other clients
  │◀── Y.js update (from others) ───────│
  │── awareness (cursor pos) ──────────▶│── relay to other clients
  │◀── awareness (from others) ─────────│
  │                                      │
```

### 5.3 Message Types

Y.js WebSocket protocol uses a single prefix byte to identify message type:

| Byte | Type | Description |
|------|------|-------------|
| `0` | Sync | Y.js sync protocol (step 1, step 2, update) |
| `1` | Awareness | Cursor positions, user info, selections |

The server relays both types as-is to all other clients in the room. The only server-side interpretation is applying sync updates to the in-memory Y.Doc (via Go Y.js library) for state accumulation.

### 5.4 Room Lifecycle

1. **First client connects** → Room created, `content_state` loaded from MongoDB into in-memory Y.Doc
2. **Client connects to existing room** → Server sends current in-memory state (sync step 1)
3. **Client sends update** → Relayed to all other clients; applied to in-memory Y.Doc; room marked dirty
4. **Snapshot tick (every 30s)** → If dirty: encode in-memory Y.Doc, decode to Markdown, persist both to MongoDB, clear dirty flag
5. **Last client disconnects** → Final snapshot persist, room destroyed
6. **Server shutdown** → Snapshot all dirty rooms, close all connections

## 6. Collab Package Architecture

### 6.1 Package Structure

```
core/pkg/collab/
├── manager.go    # CollabManager: room lifecycle, snapshot ticker, shutdown
├── room.go       # Room: per-document client tracking, broadcast, state
├── client.go     # Client: WebSocket read/write pumps
├── handler.go    # Gin handler: auth, membership check, WS upgrade
└── protocol.go   # Y.js protocol constants + state-to-Markdown decoder
```

### 6.2 CollabManager

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
}
```

**Responsibilities:**
- Create room on first client connect (load `content_state` from MongoDB)
- Destroy room on last client disconnect (final snapshot persist)
- Snapshot ticker: every 30s, persist dirty rooms
- Graceful shutdown: snapshot all active rooms, close all connections
- EventBus subscriber on `TopicOperationMemberRemoved`: force-disconnect removed users
- Publish `TopicWikiDocumentUpdated` on snapshot persist (keeps SSE subscribers in sync)
- Publish `TopicWikiPresenceJoined` / `TopicWikiPresenceLeft` on client join/leave

### 6.3 Room

```go
type Room struct {
    documentID  uuid.UUID
    operationID uuid.UUID
    clients     map[string]*Client  // sessionID → Client
    mu          sync.RWMutex
    doc         *ycrdt.Doc          // in-memory Y.Doc (Go Y.js library)
    dirty       bool
    logger      *zap.Logger
}
```

**Responsibilities:**
- Relay sync messages (type `0`) to all clients except sender
- Relay awareness messages (type `1`) to all clients except sender
- Apply incoming Y.js updates to in-memory `doc` for state accumulation
- Report dirty flag for snapshot ticker
- Encode current state for persistence (`doc.EncodeStateAsUpdate()`)

### 6.4 Client

```go
type Client struct {
    conn      *websocket.Conn
    userID    uuid.UUID
    username  string
    sessionID string
    room      *Room
    send      chan []byte  // buffered outbound channel (64 capacity)
}
```

Two goroutines per client:
- **Read pump:** Read WebSocket messages → forward to Room for broadcast + state accumulation
- **Write pump:** Drain `send` channel → write to WebSocket

Disconnect handling: read pump detects close → signals Room to remove client → Room checks if empty → triggers room destruction if last client.

## 7. Persistence Strategy

### 7.1 Snapshot Persist (every 30s + room close)

```go
func (m *CollabManager) persistRoom(ctx context.Context, room *Room) error {
    // 1. Encode Y.Doc state
    state := room.doc.EncodeStateAsUpdate()

    // 2. Decode to Markdown (server-side, no client round-trip)
    markdown := decodeYDocToMarkdown(room.doc)

    // 3. Atomic write to MongoDB
    return m.wikiRepo.PersistCollabState(ctx, room.documentID, state, markdown)
}
```

### 7.2 Repository Method

Add to `IWikiDocumentRepository`:

```go
// PersistCollabState saves Y.js state and derived Markdown atomically.
// Updates content_state, content_state_at, content, and updateAt.
PersistCollabState(ctx context.Context, docID uuid.UUID, contentState []byte, markdownContent string) error
```

### 7.3 New Document Initialization

When a document is created via `createWikiDocument`, `content_state` is nil. On first collab session:
- Client creates a fresh Y.Doc
- If the document has `content` (Markdown) from the create mutation, the client can optionally initialize the Y.Doc from it (Markdown → ProseMirror → Y.Doc, all client-side)
- The first snapshot persist writes the initial `content_state`

## 8. Presence / Awareness

### 8.1 In-Editor Presence (Cursors, Selections)

Handled entirely by Y.js awareness protocol (message type `1`). Each client broadcasts:

```javascript
awareness.setLocalStateField('user', {
  name: 'alice',
  color: '#ff6600',
  cursor: { anchor: 42, head: 42 }  // ProseMirror selection
})
```

The server relays awareness messages as-is — zero parsing. The protocol includes automatic 30s timeout for stale clients.

### 8.2 Sidebar Presence (Who Is Editing What)

The `wikiDocumentPresence` GraphQL query reads CollabManager's in-memory room state. No database involved. Presence changes are published to EventBus and streamed via SSE subscription (`wikiDocumentPresenceChanged`).

## 9. EventBus Integration

### 9.1 New Topics

```go
TopicWikiPresenceJoined Topic = "wiki.presence.joined"
TopicWikiPresenceLeft   Topic = "wiki.presence.left"
```

### 9.2 New Payload

```go
type WikiPresencePayload struct {
    DocumentID  string
    OperationID string
    UserID      string
    Username    string
}
```

### 9.3 Event Flow

- Client joins room → `TopicWikiPresenceJoined` → SSE subscription delivers to sidebar
- Client leaves room → `TopicWikiPresenceLeft` → SSE subscription delivers to sidebar
- Snapshot persist → `TopicWikiDocumentUpdated` (from wiki spec) → SSE subscription notifies document list

## 10. Fallback / Degradation

The collab layer is entirely additive. If unavailable, the wiki works with reduced functionality.

| Scenario | Behavior |
|----------|----------|
| WebSocket fails to connect | Frontend uses local Y.Doc (single-user). On save (blur/timer), serializes state and sends via `syncWikiDocumentState` GraphQL mutation (base64 blob). Server persists + derives Markdown. |
| Server restarts mid-session | WS connections drop. y-websocket auto-reconnects (exponential backoff). Clients re-sync local state with server's last persisted `content_state`. Zero data loss — edits live in each client's local Y.Doc. |
| Brand new document (no `content_state`) | Client creates fresh Y.Doc. Optionally initializes from existing `content` (Markdown) if present. |
| Frontend doesn't support collab | Read `content` (Markdown) via GraphQL. Content is read-only without Y.js editor. |

## 11. Permission Model

Extends the wiki spec's permission table:

| Action | Minimum Role | Notes |
|--------|-------------|-------|
| Connect to collab WebSocket | `operator` | Viewers read via GraphQL only |
| View presence (who is editing) | `viewer` | Via GraphQL query/subscription |
| Sync state offline (fallback mutation) | `operator` | Same as edit |

## 12. App Wiring

### 12.1 New fields in `app.go`

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
)
```

Start/stop in `StartServerWithGracefulShutdown()`:

```go
a.collabManager.Start()       // starts snapshot ticker + EventBus subscriber
// ... on shutdown:
a.collabManager.Stop(ctx)     // snapshots all rooms, closes connections
```

### 12.2 New route in `router.go`

Inside the `v1.Use(middleware.JWTAuth(...))` protected group:

```go
v1.GET("/ws/wiki/:documentId", collabManager.HandleWebSocket)
```

### 12.3 Reverse proxy config (if applicable)

```nginx
location /api/v1/ws/ {
    proxy_pass http://core-dev:8002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## 13. Dependencies

### Go (new direct)

| Dependency | Purpose |
|------------|---------|
| `github.com/gorilla/websocket` | WebSocket upgrade + read/write (promote from indirect) |
| Go Y.js library (evaluate candidates in §2.3) | Decode Y.js state server-side for Markdown derivation |

### Frontend (new npm)

| Dependency | Purpose |
|------------|---------|
| `yjs` | CRDT core |
| `y-prosemirror` | ProseMirror ↔ Y.js binding |
| `y-protocols` | Sync + awareness protocols |
| `y-websocket` | WebSocket transport provider |
| `@tiptap/*` or `prosemirror-*` | Rich text editor |

### Infrastructure

**No new services.** WebSocket runs inside the existing Go container on port 8002.

## 14. Implementation

### New files

| File | Purpose |
|------|---------|
| `core/pkg/collab/manager.go` | CollabManager: room lifecycle, snapshot ticker, shutdown, EventBus |
| `core/pkg/collab/room.go` | Room: per-document client tracking, broadcast, Y.Doc state |
| `core/pkg/collab/client.go` | Client: WebSocket read/write pumps |
| `core/pkg/collab/handler.go` | Gin handler: auth, membership, WebSocket upgrade |
| `core/pkg/collab/protocol.go` | Y.js protocol constants + state-to-Markdown decoder |

### Modified files (on top of wiki spec changes)

| File | Change |
|------|--------|
| `core/pkg/models/wiki_document.go` | Add `ContentState`, `ContentStateAt`; remove `Version`, `LastEditedByID` |
| `core/pkg/repository/wiki_document_repository.go` | Add `PersistCollabState` method to interface |
| `core/pkg/app/app.go` | Add `collabManager` field, init, start/stop lifecycle |
| `core/pkg/app/router.go` | Add WebSocket route |
| `core/pkg/graphql/schema/wiki.graphql` | Remove version/content from update input; add presence types; add `syncWikiDocumentState` mutation |
| `core/pkg/eventbus/eventbus.go` | Add `TopicWikiPresenceJoined`, `TopicWikiPresenceLeft` |
| `core/pkg/eventbus/payloads.go` | Add `WikiPresencePayload` struct + constructors |
| `core/go.mod` | Add gorilla/websocket (direct), Go Y.js library |

### Deliverables

- WebSocket endpoint for Y.js collaborative editing
- Per-document rooms with client relay and state accumulation
- Periodic snapshot persist with server-side Markdown derivation
- Graceful shutdown with final snapshot for all active rooms
- Y.js awareness relay for cursor/selection indicators
- Presence query and subscription for sidebar "who is editing"
- Fallback `syncWikiDocumentState` mutation for offline mode
- Force-disconnect on operation membership revocation
- Connection and room limits

## 15. Wiki Spec Sections Superseded

This spec supersedes or modifies the following sections of `wiki-feature-spec.md`:

| Section | Change |
|---------|--------|
| §2.5 Content Stored as Markdown | `content_state` (Y.js binary) is now source of truth; `content` (Markdown) is derived |
| §2.7 Optimistic Locking | Removed entirely — CRDT handles conflicts |
| §2.8 Content and Tree Limits | Content size limit still applies; add Y.js state size budget (~5MB) |
| §3.1 WikiDocument model | Add `ContentState`, `ContentStateAt`; remove `Version`, `LastEditedByID` |
| §4.1 WikiDocument type | Remove `version`, `lastEditedBy`; `content` becomes read-only |
| §4.2 UpdateWikiDocumentInput | Remove `version`, `content` fields |
| §5 Permission Model | Add collab WebSocket and presence permissions |
| §6.1 IWikiDocumentRepository | Add `PersistCollabState` method |
| §7 EventBus Integration | Add presence topics and payload |
| §11 App Wiring | Add CollabManager init, WebSocket route |
| §12 Implementation | Add collab package files |
| §13 Future Work | Remove "Real-time co-editing" and "Presence indicators" (now implemented) |

## 16. Future Work

These features are explicitly out of scope for this implementation:

- **Per-character attribution:** Track which user typed each character (Y.js supports this via CRDT metadata, but UI for displaying it is deferred)
- **Offline-first editing:** Full offline support with background sync queue (current fallback is best-effort via `syncWikiDocumentState`)
- **Y.js state compaction:** Periodic garbage collection of CRDT tombstones to reduce `content_state` blob size
- **Multi-instance relay:** Redis pub/sub for relaying Y.js messages across multiple server instances (current design assumes single instance)
- **Periodic re-authentication:** Heartbeat that re-validates JWT during long WebSocket sessions
