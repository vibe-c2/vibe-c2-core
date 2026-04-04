# Wiki Feature Spec — Operation-Scoped Knowledge Base

## 1. Overview

The wiki provides operation-scoped collaborative documentation — playbooks, TTP notes, reconnaissance findings, infrastructure docs, and shared knowledge. Each operation has its own isolated wiki, accessible only to operation members based on their role.

Inspired by [Outline](https://getoutline.com), adapted for the C2 team collaboration context: small trusted teams, operational security, and role-based access inherited from the existing operation membership model.

## 2. Design Decisions

### 2.1 Single-Entity Document Tree

The wiki uses a **single `WikiDocument` entity** that forms a recursive tree. Every document is equal — it can have content, children, an icon, and a color. Root-level documents (parentDocumentId = nil) appear as top-level entries in the sidebar; nested documents appear under their parent. There is no distinction between "collections" and "pages" — all documents are the same.

**Why:** A single uniform entity is simpler — one model, one repository, one resolver. Any document can gain children at any time, nesting depth is unlimited, and reparenting is a single field update.

**How it works:**
- All documents have `icon` and `color` for visual identity
- Any document can have content AND children simultaneously
- Moving a document is just reparenting: `updateWikiDocument(id, {parentDocumentId: newParentId})`
- The frontend decides rendering based on tree depth (indentation, expansion, etc.)

### 2.2 No Document Status / Lifecycle States

Documents have no draft/published/archived status. Every document is live and visible to all operation members once created. Deletion is permanent (hard delete).

**Why:** In a C2 team context, documents are working artifacts — not publishing workflows. Draft/archive states add UI and backend complexity without clear value. If a document isn't ready, the author simply doesn't share the link. If it's obsolete, delete it.

### 2.3 Backups Instead of Revisions

Documents use **periodic backups** instead of per-edit revisions. With real-time collaborative editing (Y.js CRDT), changes arrive as micro-operations — creating a revision per edit would generate thousands of entries per session. Backups capture meaningful snapshots at controlled intervals.

**Two trigger modes:**
- **Automatic** — the system creates a backup every N minutes (configurable, default 30min). Only created if content actually changed since the last backup.
- **Manual** — any operator can trigger a backup with an optional description (e.g., "Before restructuring section 3").

**Why:** Revisions tied to saves are incompatible with continuous collaborative editing. Backups give predictable storage growth, meaningful restore points, and user control over what gets snapshotted.

### 2.4 Permissions Inherit from Operation Membership

No per-document ACLs in MVP. The existing operation role hierarchy (admin > operator > viewer) governs all wiki access. All operation members see all wiki content at their role level.

**Why:** C2 teams are small and trusted at their role level. Per-document ACLs add complexity with limited benefit. Can be added in Phase 3 if needed.

### 2.5 Content Stored as Markdown

The `content` field stores Markdown as a plain string. This is the single source of truth for MVP. When real-time collaboration is added (Phase 3), a parallel `contentState` field stores Y.js/ProseMirror CRDT state, and Markdown is regenerated on each save.

**Why:** Markdown is portable, grep-able, and simple to implement. ProseMirror JSON is only needed for real-time CRDT sync.

### 2.6 Real-Time Collaboration in Phase 3

Real-time co-editing requires WebSocket with Y.js CRDT — a dedicated WebSocket endpoint alongside existing GraphQL SSE subscriptions. Not in MVP.

## 3. Data Models

### 3.1 WikiDocument

```go
type WikiDocument struct {
    field.DefaultField `bson:",inline"`
    DocumentID         uuid.UUID  `bson:"document_id" json:"documentId"`
    OperationID        uuid.UUID  `bson:"operation_id" json:"operationId"`
    ParentDocumentID   *uuid.UUID `bson:"parent_document_id,omitempty" json:"parentDocumentId,omitempty"`
    Title              string     `bson:"title" json:"title"`
    Content            string     `bson:"content" json:"content"`
    Emoji              string     `bson:"emoji" json:"emoji"`
    Color              string     `bson:"color" json:"color"`          // hex color for UI
    Icon               string     `bson:"icon" json:"icon"`            // icon identifier
    SortOrder          float64    `bson:"sort_order" json:"sortOrder"` // float for insertions between
    CreatedByID        uuid.UUID  `bson:"created_by_id" json:"createdById"`
    LastEditedByID     uuid.UUID  `bson:"last_edited_by_id" json:"lastEditedById"`
    LastBackupAt       *time.Time `bson:"last_backup_at,omitempty" json:"lastBackupAt,omitempty"`
}
```

**MongoDB collection:** `wiki_documents`

**Indexes:**
- `{document_id: 1}` (unique)
- `{operation_id: 1}` (list all docs in operation)
- `{operation_id: 1, parent_document_id: 1}` (tree queries — list children, list roots when null)
- `{createAt: -1, _id: -1}` (cursor pagination)
- `{operation_id: 1, title: "text", content: "text"}` (text search — Phase 2)

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
    Description        string                    `bson:"description" json:"description"` // user-provided label for manual backups
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

type WikiDocument {
  id: ID!
  operationId: ID!
  parentDocument: WikiDocument       # null for root documents
  childDocuments: [WikiDocument!]!   # immediate children, sorted by sortOrder
  title: String!
  content: String!                   # Markdown
  emoji: String!
  color: String!                     # hex color
  icon: String!                      # icon identifier
  sortOrder: Float!
  childCount: Int!                   # computed: number of children
  createdBy: User!
  lastEditedBy: User!
  lastBackupAt: String
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
  description: String!               # empty for auto backups
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
}

input UpdateWikiDocumentInput {
  title: String
  content: String
  emoji: String
  color: String
  icon: String
  parentDocumentId: ID               # reparent (null = move to root)
  sortOrder: Float
}
```

### 4.3 Queries

```graphql
extend type Query {
  # Get a single wiki document by ID.
  wikiDocument(id: ID!): WikiDocument!
    @hasPermission(permission: "operation:member")

  # List wiki documents within an operation.
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

  # Get the full document tree for an operation.
  # Returns a flat list; the frontend reconstructs the tree via parentDocument references.
  wikiDocumentTree(operationId: ID!): [WikiDocument!]!
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

  deleteWikiDocument(id: ID!): Boolean!
    @hasPermission(permission: "operation:member")

  # Manual backup — snapshot the current document state with an optional description
  createWikiDocumentBackup(documentId: ID!, description: String): WikiDocumentBackup!
    @hasPermission(permission: "operation:member")

  # Restore from backup — replaces document content with the backup's content
  restoreWikiDocumentBackup(documentId: ID!, backupId: ID!): WikiDocument!
    @hasPermission(permission: "operation:member")

  # Delete a specific backup
  deleteWikiDocumentBackup(id: ID!): Boolean!
    @hasPermission(permission: "operation:member")

  # Move a document to a new parent (convenience mutation for drag-and-drop)
  moveWikiDocument(id: ID!, parentDocumentId: ID, sortOrder: Float!): WikiDocument!
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
}
```

## 5. Permission Model

All wiki GraphQL fields use `@hasPermission(permission: "operation:member")` as the app-level gate. The resolver checks operation membership and enforces role requirements:

| Action | Minimum Role | Notes |
|--------|-------------|-------|
| Read documents | `viewer` | All operation members can read |
| Create document | `operator` | |
| Edit document | `operator` | |
| Move / reparent | `operator` | Rearrange tree structure |
| Delete document | `admin` | Hard delete; reparents children |
| View backups | `viewer` | Read-only history |
| Create manual backup | `operator` | Snapshot current state |
| Restore from backup | `operator` | Replaces document content |
| Delete backup | `admin` | |

Reuses the existing `authorizeForOperation` pattern from `SchemeNetworkPointResolver`.

## 6. Repository Interface

### 6.1 IWikiDocumentRepository

```go
type WikiDocumentFilter struct {
    ParentDocumentID *uuid.UUID  // set = children of that doc
    RootsOnly        bool        // true = only root documents (parentDocumentID is nil)
    Search           string
}

type IWikiDocumentRepository interface {
    Create(ctx context.Context, doc *models.WikiDocument) error
    FindByID(ctx context.Context, id uuid.UUID) (models.WikiDocument, error)
    FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter WikiDocumentFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.WikiDocument, error)
    CountByOperationID(ctx context.Context, opID uuid.UUID, filter WikiDocumentFilter) (int64, error)
    FindChildDocuments(ctx context.Context, parentID uuid.UUID) ([]models.WikiDocument, error)
    FindAllByOperationID(ctx context.Context, opID uuid.UUID) ([]models.WikiDocument, error)  // for tree query
    CountChildDocuments(ctx context.Context, parentID uuid.UUID) (int64, error)                // for childCount field
    ReparentChildren(ctx context.Context, oldParentID uuid.UUID, newParentID *uuid.UUID) error // for cascade on delete
    Update(ctx context.Context, doc *models.WikiDocument, updates map[string]interface{}) error
    Delete(ctx context.Context, doc *models.WikiDocument) error
    DeleteByOperationID(ctx context.Context, opID uuid.UUID) error
}
```

### 6.2 IWikiDocumentBackupRepository

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

## 7. EventBus Integration

### Topics

```go
TopicWikiDocumentCreated Topic = "wiki.document.created"
TopicWikiDocumentUpdated Topic = "wiki.document.updated"
TopicWikiDocumentDeleted Topic = "wiki.document.deleted"
TopicWikiDocumentMoved   Topic = "wiki.document.moved"
```

### Payload

```go
type WikiDocumentEventPayload struct {
    DocumentID       string
    OperationID      string
    ParentDocumentID string  // empty if root
    Title            string
}
```

## 8. Backup Strategy

### Automatic Backups

A background goroutine runs on a configurable interval (default: 30 minutes). On each tick:

1. Find all documents where `updatedAt > lastBackupAt` (or `lastBackupAt` is nil)
2. For each changed document, create a `WikiDocumentBackup` with `trigger: auto`
3. Update the document's `lastBackupAt` timestamp

The interval is configurable via environment variable (e.g., `WIKI_AUTO_BACKUP_INTERVAL=30m`).

### Manual Backups

Any operator can call `createWikiDocumentBackup(documentId, description)` to snapshot the current state. Manual backups always succeed regardless of whether content changed — the user explicitly wants a checkpoint.

### Restore

`restoreWikiDocumentBackup` replaces the document's `title` and `content` with the backup's values. This is a regular edit — it triggers a new auto-backup on the next cycle if the interval has elapsed.

### Retention (Phase 2+)

MVP keeps all backups. Future retention policy options:
- Keep all manual backups indefinitely (user intentionally created them)
- Auto-backups: keep last N per document (e.g., 50) or time-based pruning
- Configurable per operation or globally

## 9. Search Strategy

| Phase | Approach | Details |
|-------|----------|---------|
| Phase 1 | Regex on title | Same pattern as `buildOperationSearchFilter` — case-insensitive, escaped |
| Phase 2 | MongoDB text index | `$text` with `$search` on `{title, content}` — word-level full-text with stemming |
| Phase 3 | External engine (optional) | Meilisearch/Elasticsearch synced via EventBus subscribers |

## 10. Cascade Deletion

### Operation deleted → delete all wiki data

In `OperationResolver.DeleteOperation`, call `DeleteByOperationID` on both wiki repositories (documents + backups). Same pattern as SchemeNetworkPoint cascade.

### Document deleted → reparent children + delete backups

1. Reparent child documents to the deleted document's parent (or `nil` for root-level) via `ReparentChildren`
2. Delete all backups for the document via `DeleteByDocumentID`
3. Delete the document

## 11. App Wiring

### New fields in `app.go` Repositories struct

```go
WikiDocument       repository.IWikiDocumentRepository
WikiDocumentBackup repository.IWikiDocumentBackupRepository
```

### New resolver in `router.go`

```go
wikiDocRes := resolver.NewWikiDocumentResolver(
    repos.WikiDocument, repos.WikiDocumentBackup,
    repos.Operation, eventBus,
)
```

### Extended `Resolver` struct in `graphql/resolver/resolver.go`

```go
WikiDocumentResolver resolver.IWikiDocumentResolver
```

### gqlgen.yml additions

Map `WikiDocument`, `WikiDocumentBackup`, and `WikiDocumentBackupTrigger` to Go models with field resolvers for computed/formatted fields (id, timestamps, parentDocument, childDocuments, createdBy, lastEditedBy, childCount).

### Auto-backup background job

Started in `NewApp()` or `Run()` — a goroutine with a ticker that calls the backup logic. Accepts a `context.Context` for graceful shutdown.

## 12. Phased Implementation

### Phase 1 — MVP: Document Tree + Backups

**New files:**
| File | Purpose |
|------|---------|
| `core/pkg/models/wiki_document.go` | WikiDocument model |
| `core/pkg/models/wiki_document_backup.go` | WikiDocumentBackup + trigger enum |
| `core/pkg/repository/wiki_document_repository.go` | Document data access + filter + tree ops |
| `core/pkg/repository/wiki_backup_repository.go` | Backup data access |
| `core/pkg/resolver/wiki_document_resolver.go` | Document + backup business logic |
| `core/pkg/graphql/schema/wiki.graphql` | GraphQL schema |

**Modified files:**
| File | Change |
|------|--------|
| `core/pkg/eventbus/eventbus.go` | Wiki topic constants |
| `core/pkg/eventbus/payloads.go` | Wiki payload struct |
| `core/pkg/app/app.go` | Wiki repos in Repositories + NewApp + auto-backup goroutine |
| `core/pkg/app/router.go` | Create wiki resolver, pass to NewHandler |
| `core/pkg/graphql/handler.go` | Accept wiki resolver |
| `core/pkg/graphql/resolver/resolver.go` | Wiki resolver field |
| `core/pkg/graphql/gqlgen.yml` | Wiki model mappings |
| `core/pkg/resolver/operation_resolver.go` | Cascade delete wiki data |

**Deliverables:** Create documents at any level, nest documents in a tree, edit documents in Markdown, automatic periodic backups, manual backups with descriptions, restore from backup, move/reparent via drag-and-drop.

### Phase 2 — Search + Real-Time Notifications + Backup Retention

- MongoDB text index on `wiki_documents`
- Full-text search via `$text` query
- GraphQL subscription for `wikiDocumentChanged`
- Subscription resolver wired to EventBus
- Backup retention policy (prune old auto-backups)

### Phase 3 — Real-Time Collaboration + Advanced

- WebSocket endpoint for Y.js CRDT sync
- `contentState` field (Y.js state) alongside Markdown
- Presence indicators (who is viewing/editing)
- Per-document permission overrides (optional ACL)
- Public sharing links (token-based read access)
- Document export (Markdown, PDF)
