# Wiki Feature Spec — Operation-Scoped Knowledge Base

## 1. Overview

The wiki provides operation-scoped collaborative documentation — playbooks, TTP notes, reconnaissance findings, infrastructure docs, and shared knowledge. Each operation has its own isolated wiki, accessible only to operation members based on their role.

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
- Before soft-deleting a document → backup with description "Pre-delete snapshot"
- Before restoring from a backup → backup with description "Pre-restore snapshot"

**Why:** Revisions tied to saves are incompatible with continuous collaborative editing. Backups give predictable storage growth, meaningful restore points, and user control over what gets snapshotted. Safety backups ensure no data is lost even during delete/restore operations.

### 2.4 Permissions Inherit from Operation Membership

No per-document ACLs. The existing operation role hierarchy (admin > operator > viewer) governs all wiki access. All operation members see all wiki content at their role level.

**Authorization is extracted to a shared package** (`core/pkg/authorization`) so both the operation resolver and wiki resolver use the same logic. The existing private `authorizeOperationRole` method on `operationResolver` is refactored into a public `AuthorizeOperationRole` function in this shared package.

**Why:** C2 teams are small and trusted at their role level. Per-document ACLs add complexity with limited benefit. A shared authorization package prevents drift between resolvers.

### 2.5 Content Stored as Markdown

The `content` field stores Markdown as a plain string. This is the single source of truth. When real-time collaboration is added (future work), a parallel `contentState` field stores Y.js/ProseMirror CRDT state, and Markdown is regenerated on each save.

**Why:** Markdown is portable, grep-able, and simple to implement. ProseMirror JSON is only needed for real-time CRDT sync.

### 2.6 Fractional Indexing for Sort Order

Documents use **fractional indexing** (lexicographic strings) for sort order instead of numeric floats. Fractional index strings (e.g. `"a0"`, `"a0V"`, `"Zz"`) allow unlimited insertions between any two positions without precision loss.

**Why:** Float-based ordering degrades after ~50 insertions in the same gap due to IEEE 754 precision limits. Fractional indexing is used by Figma, Linear, and other collaborative tools for this reason. No periodic rebalancing is needed.

**How it works:**
- New documents get an index after the last sibling
- Inserting between two documents generates a string lexicographically between their indices
- The `sortOrder` field is a string, sorted with standard string comparison

### 2.7 Optimistic Locking

Documents have a `version` field (integer, starts at 1) that increments on every successful update. The `updateWikiDocument` mutation requires the caller to send the current `version` — if it doesn't match the stored version, the mutation returns a conflict error.

**Why:** Before real-time CRDT collaboration, two operators can edit the same document simultaneously. Without locking, the last write silently overwrites the first. Optimistic locking detects conflicts and lets the client handle them (e.g., reload and retry). This is a lightweight solution that works well for small teams.

### 2.8 Content and Tree Limits

Conservative limits are enforced at the resolver level on create and update:

| Limit | Value |
|-------|-------|
| Content size | 1 MB |
| Title length | 200 characters |
| Max nesting depth | 10 levels |

**Why:** Unbounded content could bloat MongoDB documents, backups, and GraphQL responses. Nesting depth limits prevent unusable deep trees and keep recursive queries bounded. Limits are enforced in the resolver (not DB-level constraints) so error messages are clear.

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
    Color              string     `bson:"color" json:"color"`            // hex color for UI
    Icon               string     `bson:"icon" json:"icon"`              // icon identifier
    SortOrder          string     `bson:"sort_order" json:"sortOrder"`   // fractional index string
    Version            int64      `bson:"version" json:"version"`        // optimistic locking, starts at 1
    CreatedByID        uuid.UUID  `bson:"created_by_id" json:"createdById"`
    LastEditedByID     uuid.UUID  `bson:"last_edited_by_id" json:"lastEditedById"`
    LastBackupAt       *time.Time `bson:"last_backup_at,omitempty" json:"lastBackupAt,omitempty"`
    DeletedAt          *time.Time `bson:"deleted_at,omitempty" json:"deletedAt,omitempty"`
    DeletedByID        *uuid.UUID `bson:"deleted_by_id,omitempty" json:"deletedById,omitempty"`
}
```

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
  sortOrder: String!                 # fractional index
  version: Int!                      # optimistic locking
  childCount: Int!                   # computed: number of active (non-deleted) children
  createdBy: User!
  lastEditedBy: User!
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
  content: String
  emoji: String
  color: String
  icon: String
  parentDocumentId: ID               # reparent (null = move to root)
  sortOrder: String                  # fractional index
  version: Int!                      # required — reject if stale
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
}
```

**Subscription filtering:** The `wikiDocumentChanged` subscription must verify the subscriber is a member of the specified operation, using the same `buildOperationFilter` pattern as the existing `OperationChanged` subscription. If membership is revoked mid-subscription, event delivery stops.

## 5. Permission Model

All wiki GraphQL fields use `@hasPermission(permission: "operation:member")` as the app-level gate. The resolver checks operation membership via the shared `authorization.AuthorizeOperationRole` function and enforces role requirements:

| Action | Minimum Role | Notes |
|--------|-------------|-------|
| Read documents | `viewer` | All operation members can read |
| Browse trash | `viewer` | View soft-deleted documents |
| Create document | `operator` | |
| Edit document | `operator` | |
| Move / reparent | `operator` | Via `updateWikiDocument` with `parentDocumentId` + `sortOrder` |
| Soft delete document | `operator` | Moves to trash; auto-creates pre-delete backup |
| Restore from trash | `operator` | Restores to original tree position |
| Permanently delete (from trash) | `admin` | Hard delete; irreversible |
| Empty trash | `admin` | Hard delete all trashed docs in operation |
| View backups | `viewer` | Read-only history |
| Create manual backup | `operator` | Snapshot current state |
| Restore from backup | `operator` | Replaces document content; auto-creates pre-restore backup |
| Delete backup | `admin` | |

## 6. Repository Interface

### 6.1 IWikiDocumentRepository

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
    Update(ctx context.Context, doc *models.WikiDocument, updates map[string]interface{}) error  // checks version for optimistic locking
    HardDelete(ctx context.Context, doc *models.WikiDocument) error
    HardDeleteByOperationID(ctx context.Context, opID uuid.UUID) error                          // cascade on operation delete
    HardDeleteTrashed(ctx context.Context, opID uuid.UUID) error                                // empty trash
    FindChangedSinceLastBackup(ctx context.Context, batchSize int64) ([]models.WikiDocument, error)  // for auto-backup job
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
TopicWikiDocumentCreated     Topic = "wiki.document.created"
TopicWikiDocumentUpdated     Topic = "wiki.document.updated"
TopicWikiDocumentSoftDeleted Topic = "wiki.document.soft_deleted"
TopicWikiDocumentRestored    Topic = "wiki.document.restored"
TopicWikiDocumentMoved       Topic = "wiki.document.moved"
TopicWikiDocumentHardDeleted Topic = "wiki.document.hard_deleted"
```

### Payload

```go
type WikiDocumentEventPayload struct {
    DocumentID       string
    OperationID      string
    ParentDocumentID string     // empty if root
    Title            string
    DeletedAt        string     // empty if active, ISO timestamp if soft-deleted
}
```

## 8. Backup Strategy

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

`restoreWikiDocumentBackup` replaces the document's `title` and `content` with the backup's values. A pre-restore safety backup is created first. The restore increments the document's `version` (it's a regular update). This triggers a new auto-backup on the next cycle if the interval has elapsed.

### Retention

MVP keeps all backups. Manual empty-trash purges backups for permanently deleted documents. Future retention policy options:
- Keep all manual backups indefinitely (user intentionally created them)
- Auto-backups: keep last N per document (e.g., 50) or time-based pruning
- Configurable per operation or globally

## 9. Search Strategy

Full-text search is available from day one via MongoDB text index on `{operation_id, title, content}`.

| Feature | Details |
|---------|---------|
| Title regex | Same pattern as `buildOperationSearchFilter` — case-insensitive, escaped. Used when `search` param is short or for prefix matching. |
| MongoDB text index | `$text` with `$search` on `{title, content}` — word-level full-text with stemming. Used for longer search queries. |
| Future: external engine | Meilisearch/Elasticsearch synced via EventBus subscribers (if needed for advanced ranking/highlighting). |

## 10. Cascade Deletion

### Operation deleted → hard delete all wiki data

In `OperationResolver.DeleteOperation`, call `HardDeleteByOperationID` on both wiki repositories (documents + backups). This deletes everything including trashed documents. Same pattern as SchemeNetworkPoint cascade.

### Document soft-deleted → cascade to children

1. Find all descendant documents via `FindDescendants`
2. Create pre-delete safety backups for each document (parent + descendants)
3. Soft-delete all descendants via `SoftDeleteBatch`
4. Soft-delete the document itself

### Document permanently deleted (from trash) → delete backups

1. Delete all backups for the document via `DeleteByDocumentID`
2. Hard-delete the document
3. Note: children were already soft-deleted with the parent; they remain in trash independently

### Empty trash → purge all trashed docs + their backups

1. Find all trashed documents in operation
2. Delete all backups for each trashed document
3. Hard-delete all trashed documents via `HardDeleteTrashed`

## 11. App Wiring

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

Map `WikiDocument`, `WikiDocumentBackup`, and `WikiDocumentBackupTrigger` to Go models with field resolvers for computed/formatted fields (id, timestamps, version, parentDocument, childDocuments, createdBy, lastEditedBy, deletedBy, childCount).

### Auto-backup background job

Started in `NewApp()` or `Run()` — a goroutine with a ticker that calls the backup logic. Accepts a `context.Context` for graceful shutdown. Uses batched processing with per-tick timeouts.

## 12. Implementation

### New files

| File | Purpose |
|------|---------|
| `core/pkg/authorization/operation_auth.go` | Shared operation authorization helper |
| `core/pkg/models/wiki_document.go` | WikiDocument model |
| `core/pkg/models/wiki_document_backup.go` | WikiDocumentBackup + trigger enum |
| `core/pkg/repository/wiki_document_repository.go` | Document data access + filter + tree ops + soft delete |
| `core/pkg/repository/wiki_backup_repository.go` | Backup data access |
| `core/pkg/resolver/wiki_document_resolver.go` | Document + backup + trash business logic |
| `core/pkg/graphql/schema/wiki.graphql` | GraphQL schema |

### Modified files

| File | Change |
|------|--------|
| `core/pkg/resolver/operation_resolver.go` | Replace private `authorizeOperationRole` with shared `authorization.AuthorizeOperationRole` |
| `core/pkg/eventbus/eventbus.go` | Wiki topic constants |
| `core/pkg/eventbus/payloads.go` | Wiki payload struct + typed constructors |
| `core/pkg/app/app.go` | Wiki repos in Repositories + NewApp + auto-backup goroutine |
| `core/pkg/app/router.go` | Create wiki resolver, pass to NewHandler |
| `core/pkg/graphql/handler.go` | Accept wiki resolver |
| `core/pkg/graphql/resolver/resolver.go` | Wiki resolver field |
| `core/pkg/graphql/resolver/subscriptions.resolvers.go` | Wiki subscription resolver |
| `core/pkg/graphql/gqlgen.yml` | Wiki model mappings |
| `core/pkg/resolver/operation_resolver.go` | Cascade delete wiki data in DeleteOperation |

### Deliverables

- Create documents at any level with fractional index ordering
- Nest documents in a tree (max 10 levels)
- Edit documents in Markdown with optimistic locking (version field)
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

## 13. Future Work

These features are explicitly out of scope for this implementation:

- **Real-time co-editing:** WebSocket endpoint for Y.js CRDT sync, `contentState` field alongside Markdown
- **Presence indicators:** Who is viewing/editing a document
- **Per-document permissions:** Optional ACL overrides beyond operation roles
- **Public sharing links:** Token-based read access for external viewers
- **Document export:** Markdown, PDF export
- **Backup retention policies:** Auto-prune old backups (keep last N, time-based)
- **Trash auto-purge:** Configurable auto-purge period for trashed documents
