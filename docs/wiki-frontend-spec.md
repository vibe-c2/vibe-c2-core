# Wiki Frontend Spec — Operation-Scoped Wiki Page with Collaborative Editor

## 1. Overview

The wiki frontend is an operation-scoped page with two panels: a **document tree sidebar** on the left and a **collaborative TipTap editor** on the right. Documents are organized as a recursive tree; selecting a document opens it in the editor with real-time collaborative editing via Y.js + Hocuspocus WebSocket.

The Go backend and Hocuspocus sidecar are already implemented. This spec covers the frontend only.

**Tech stack:** React, TipTap, Y.js, @hocuspocus/provider, Zustand, React Query, existing shadcn/base-ui components.

## 2. Architecture

```
+-----------------------------------------------------+
| AppLayout (existing)                                |
| +----------+ +------------------------------------+ |
| |AppSidebar| | WikiPage                           | |
| |(existing)| | +----------+ +-------------------+ | |
| |          | | |WikiTree  | |WikiEditorPane     | | |
| | Dashboard| | |Sidebar   | |                   | | |
| | Wiki  <--| | |(resizable| | TipTap + Y.js     | | |
| | -------- | | | w/ drag  | | collaborative     | | |
| | Ops      | | | handle)  | | editor            | | |
| | Users    | | |          | |                   | | |
| |          | | | > Doc A  | | [Connection banner]| | |
| |          | | | v Doc B  | |                   | | |
| |          | | |   > B.1  | |                   | | |
| |          | | |   > B.2  | |                   | | |
| |          | | | > Doc C  | |                   | | |
| |          | | |[🗑 Trash]| |                   | | |
| |          | | +----------+ +-------------------+ | |
| +----------+ +------------------------------------+ |
+-----------------------------------------------------+
```

The wiki page lives inside the existing `AppLayout` (app sidebar + content area). The wiki's own tree sidebar is a **resizable panel within the page content area**, not a second app-level sidebar.

The main content area (right side) can show one of three views:
1. **Editor** — TipTap collaborative editor (default when a document is selected)
2. **Search results** — content search results scoped to a folder
3. **Empty state** — when no document is selected

## 3. Design Decisions

### 3.1 Document Tree: Collapsible with Drag-and-Drop Reordering

The document tree is built using the existing `Collapsible` component from `@base-ui/react` (already in `components/ui/collapsible.tsx`). Each tree node is a `Collapsible` with a trigger (chevron + emoji + title) and a panel (children rendered recursively).

**Drag-and-drop reordering** uses `@dnd-kit/core` + `@dnd-kit/sortable`. Each `WikiTreeNode` is a draggable/droppable item. Drop targets support two actions:
- **Between siblings:** reorder within the same parent (updates `sortOrder` via fractional indexing)
- **Onto a node:** reparent as a child (updates `parentDocumentId` + `sortOrder`)

On drop, the frontend calculates the new `sortOrder` by computing the midpoint between the two adjacent siblings' sort strings, then calls `updateWikiDocument` with the new `sortOrder` (and optionally new `parentDocumentId`). The tree updates optimistically and reverts on mutation error.

### 3.2 Resizable Tree Sidebar

The tree sidebar has a drag handle on its right edge for resizing. The width is persisted to localStorage per user. This uses a simple mouse event handler (no library needed) — `onMouseDown` on the handle starts tracking, `onMouseMove` updates the width, `onMouseUp` stops and persists.

**Default width:** 256px (w-64). **Min:** 200px. **Max:** 480px.

### 3.3 Operation Scoping

The wiki page requires a scoped operation (from `useScopedOperationStore`). If no operation is scoped, the user is redirected to `/operations` to select one. The scoped operation ID is passed to all wiki GraphQL queries.

### 3.4 URL Routing

```
/wiki                — wiki page with no document selected (shows empty state)
/wiki/:documentId    — wiki page with a specific document open in the editor
```

Selecting a document in the tree navigates to `/wiki/:documentId` (updates the URL). This makes documents linkable and supports browser back/forward.

### 3.5 Collaborative Editing via TipTap + Hocuspocus

All content editing goes through the Hocuspocus WebSocket (Y.js CRDT). The editor uses TipTap with the `Collaboration` and `CollaborationCursor` extensions. The collab ticket is obtained from the Go backend via `POST /api/v1/wiki/collab-ticket` before connecting.

### 3.6 Read-Only Mode

Users with role below operator see the document in **read-only TipTap mode** (`editable: false`). They do not connect to the Hocuspocus WebSocket — content is loaded from the `wikiDocument` GraphQL query instead. A "Read-only" badge is shown in the editor header. The same TipTap rendering is used for consistent formatting between editors and viewers.

### 3.7 Two-Tier Search

**Tier 1 — Title filter (tree sidebar):** A search input at the top of the tree sidebar filters nodes client-side by title. Matching nodes and their ancestors are shown. Always visible, instant filtering.

**Tier 2 — Content search (main content area):** Triggered from a tree node's context menu ("Search in [folder]...") or a root-level search action. Replaces the editor pane with a `WikiSearchResults` component. Uses the `wikiDocuments(operationId, parentDocumentId, search)` backend query to search title + content. The `parentDocumentId` scopes results to the selected folder and its descendants recursively. Results are shown as a flat list with breadcrumb paths (e.g., "Parent > Child > Doc Title"). Clicking a result navigates to `/wiki/:documentId`.

### 3.8 Connection Status

When the Hocuspocus WebSocket disconnects, a non-blocking amber banner appears at the top of the editor: **"Reconnecting... your edits are saved locally."** Y.js buffers edits locally and syncs on reconnect. When reconnected but not yet synced, the banner shows **"Syncing..."**. The banner dismisses automatically when `isConnected && isSynced`.

## 4. New Dependencies

```
# TipTap rich text editor
@tiptap/react
@tiptap/pm
@tiptap/starter-kit
@tiptap/extension-collaboration
@tiptap/extension-collaboration-cursor
@tiptap/extension-placeholder
@tiptap/extension-heading
@tiptap/extension-bullet-list
@tiptap/extension-ordered-list
@tiptap/extension-code-block
@tiptap/extension-task-list
@tiptap/extension-task-item

# Y.js + Hocuspocus client
yjs
@hocuspocus/provider

# Drag-and-drop tree reordering
@dnd-kit/core
@dnd-kit/sortable

# Emoji picker
@emoji-mart/react
@emoji-mart/data
```

No new dependencies for the tree sidebar structure — uses existing `@base-ui/react` Collapsible.

## 5. GraphQL Operations

All operations match `core/pkg/graphql/schema/wiki.graphql` exactly.

### 5.1 Queries

```graphql
# Fetch all active documents for tree rendering (flat list, frontend builds tree)
query WikiDocumentTree($operationId: ID!) {
  wikiDocumentTree(operationId: $operationId) {
    id
    operationId
    parentDocument { id }
    title
    emoji
    icon
    color
    sortOrder
    childCount
    createdAt
    updatedAt
  }
}

# Fetch a single document for the editor
query WikiDocumentDetail($id: ID!) {
  wikiDocument(id: $id) {
    id
    operationId
    parentDocument { id }
    title
    content
    emoji
    color
    icon
    sortOrder
    createdBy { id username }
    lastBackupAt
    createdAt
    updatedAt
  }
}

# Paginated document listing with optional search and parent scoping
query WikiDocuments(
  $operationId: ID!
  $parentDocumentId: ID
  $search: String
  $first: Int
  $after: String
) {
  wikiDocuments(
    operationId: $operationId
    parentDocumentId: $parentDocumentId
    search: $search
    first: $first
    after: $after
  ) {
    edges {
      node {
        id
        operationId
        parentDocument { id }
        title
        emoji
        sortOrder
        createdBy { id username }
        createdAt
        updatedAt
      }
      cursor
    }
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}

# Fetch trashed documents for trash panel
query WikiDocumentTrash($operationId: ID!, $first: Int, $after: String) {
  wikiDocumentTrash(operationId: $operationId, first: $first, after: $after) {
    edges {
      node {
        id
        title
        emoji
        deletedAt
        deletedBy { id username }
        createdAt
      }
      cursor
    }
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}

# Fetch backups for a document
query WikiDocumentBackups($documentId: ID!, $first: Int, $after: String) {
  wikiDocumentBackups(documentId: $documentId, first: $first, after: $after) {
    edges {
      node {
        id
        documentId
        title
        trigger
        description
        createdBy { id username }
        createdAt
      }
      cursor
    }
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}

# Fetch a single backup
query WikiDocumentBackup($id: ID!) {
  wikiDocumentBackup(id: $id) {
    id
    documentId
    title
    content
    trigger
    description
    createdBy { id username }
    createdAt
  }
}

# Presence: who is editing a document
query WikiDocumentPresence($documentId: ID!) {
  wikiDocumentPresence(documentId: $documentId) {
    documentId
    activeEditors { userId username connectedAt }
  }
}
```

### 5.2 Mutations

```graphql
mutation CreateWikiDocument($operationId: ID!, $input: CreateWikiDocumentInput!) {
  createWikiDocument(operationId: $operationId, input: $input) {
    id operationId title emoji color icon sortOrder
    parentDocument { id }
    createdBy { id username }
    createdAt updatedAt
  }
}

mutation UpdateWikiDocument($id: ID!, $input: UpdateWikiDocumentInput!) {
  updateWikiDocument(id: $id, input: $input) {
    id title emoji color icon sortOrder
    parentDocument { id }
    updatedAt
  }
}

mutation DeleteWikiDocument($id: ID!) {
  deleteWikiDocument(id: $id)
}

mutation RestoreWikiDocument($id: ID!) {
  restoreWikiDocument(id: $id) {
    id operationId title emoji sortOrder
    parentDocument { id }
  }
}

mutation PermanentlyDeleteWikiDocument($id: ID!) {
  permanentlyDeleteWikiDocument(id: $id)
}

mutation EmptyWikiDocumentTrash($operationId: ID!) {
  emptyWikiDocumentTrash(operationId: $operationId)
}

mutation CreateWikiDocumentBackup($documentId: ID!, $description: String) {
  createWikiDocumentBackup(documentId: $documentId, description: $description) {
    id documentId title trigger description
    createdBy { id username }
    createdAt
  }
}

mutation RestoreWikiDocumentBackup($documentId: ID!, $backupId: ID!) {
  restoreWikiDocumentBackup(documentId: $documentId, backupId: $backupId) {
    id title content
  }
}

mutation DeleteWikiDocumentBackup($id: ID!) {
  deleteWikiDocumentBackup(id: $id)
}
```

### 5.3 Subscriptions

```graphql
subscription WikiDocumentChanged($operationId: ID!) {
  wikiDocumentChanged(operationId: $operationId) {
    action
    documentId
    operationId
    parentDocumentId
    document { id title emoji sortOrder parentDocument { id } }
  }
}

subscription WikiDocumentPresenceChanged($operationId: ID!) {
  wikiDocumentPresenceChanged(operationId: $operationId) {
    documentId operationId userId username action
  }
}
```

## 6. React Query Hooks

**File:** `frontend/src/graphql/hooks/wiki.ts`

| Hook | Type | Purpose |
|------|------|---------|
| `useWikiDocumentTree(operationId)` | `useQuery` | Fetches flat doc list for tree rendering |
| `useWikiDocument(documentId)` | `useQuery` | Fetches single doc for editor header / read-only view |
| `useWikiDocuments(operationId, parentDocumentId, search)` | `useInfiniteQuery` | Paginated doc listing with search + parent scoping |
| `useWikiDocumentTrash(operationId)` | `useInfiniteQuery` | Paginated trashed documents |
| `useWikiDocumentBackups(documentId)` | `useInfiniteQuery` | Paginated backup list |
| `useWikiDocumentBackup(backupId)` | `useQuery` | Single backup detail (for preview) |
| `useWikiDocumentPresence(documentId)` | `useQuery` | Active editors (polled or subscription-driven) |
| `useCreateWikiDocument()` | `useMutation` | Create doc, invalidates tree cache |
| `useUpdateWikiDocument()` | `useMutation` | Update metadata, invalidates tree cache |
| `useDeleteWikiDocument()` | `useMutation` | Soft delete, invalidates tree + trash cache |
| `useRestoreWikiDocument()` | `useMutation` | Restore from trash, invalidates tree + trash cache |
| `usePermanentlyDeleteWikiDocument()` | `useMutation` | Hard delete, invalidates trash cache |
| `useEmptyWikiDocumentTrash()` | `useMutation` | Empty all trash, invalidates trash cache |
| `useCreateWikiDocumentBackup()` | `useMutation` | Manual backup, invalidates backups cache |
| `useRestoreWikiDocumentBackup()` | `useMutation` | Restore from backup |
| `useDeleteWikiDocumentBackup()` | `useMutation` | Delete backup, invalidates backups cache |

Cache keys follow the existing pattern: `wikiKeys.tree(operationId)`, `wikiKeys.detail(documentId)`, `wikiKeys.trash(operationId)`, `wikiKeys.backups(documentId)`, etc.

## 7. Wiki Store (Zustand)

**File:** `frontend/src/stores/wiki.ts`

```typescript
interface WikiStoreState {
  // Tree state
  expandedNodes: Set<string>           // persisted as string[] in localStorage, hydrated to Set
  toggleNode: (id: string) => void

  // Selection (synced with URL param)
  selectedDocumentId: string | null
  selectDocument: (id: string | null) => void

  // Create dialog
  createDialogOpen: boolean
  createParentId: string | null        // parent for new doc (null = root)
  openCreateDialog: (parentId?: string) => void
  closeCreateDialog: () => void

  // Delete dialog (soft delete)
  deleteDialogOpen: boolean
  deleteTarget: { id: string; title: string } | null
  openDeleteDialog: (target: { id: string; title: string }) => void
  closeDeleteDialog: () => void

  // Permanent delete dialog
  permanentDeleteDialogOpen: boolean
  permanentDeleteTarget: { id: string; title: string } | null
  openPermanentDeleteDialog: (target: { id: string; title: string }) => void
  closePermanentDeleteDialog: () => void

  // Trash panel
  trashPanelOpen: boolean
  openTrashPanel: () => void
  closeTrashPanel: () => void

  // Backup panel
  backupPanelOpen: boolean
  openBackupPanel: () => void
  closeBackupPanel: () => void

  // Content search (replaces editor pane when active)
  searchScope: {
    parentDocumentId: string | null    // null = search from root
    parentTitle: string                // display label, e.g. "All Documents"
  } | null
  openContentSearch: (parentDocumentId: string | null, parentTitle: string) => void
  closeContentSearch: () => void

  // Sidebar width (persisted to localStorage)
  sidebarWidth: number
  setSidebarWidth: (width: number) => void
}
```

## 8. Component Structure

### 8.1 Page Shell

**File:** `frontend/src/pages/wiki.tsx`

```
WikiPage
  - Requires scoped operation (redirects to /operations if none)
  - Mounts WikiDocumentChanged subscription
  - Mounts WikiDocumentPresenceChanged subscription
  - Renders: WikiTreeSidebar | ResizeHandle | WikiContentArea
  - Mounts: CreateWikiDocumentDialog, DeleteWikiDocumentDialog,
            PermanentDeleteWikiDocumentDialog
```

### 8.2 Tree Sidebar

**File:** `frontend/src/components/wiki/wiki-tree-sidebar.tsx`

```
WikiTreeSidebar
  +-- Header: "Documents" label + "+" create button + 🗑 trash button (with badge count)
  +-- Search input (filters tree by title, client-side)
  +-- Scrollable tree area (wrapped in DndContext + SortableContext)
       +-- WikiTreeNode (recursive, each is a SortableItem)
            +-- Collapsible
                 +-- CollapsibleTrigger: drag handle + chevron + emoji + title + context menu
                 +-- CollapsibleContent: children WikiTreeNodes
```

**Loading state:** 3–5 skeleton shimmer bars matching the tree node height.

**File:** `frontend/src/components/wiki/wiki-tree-node.tsx`

Each node:
- Click title: selects document (navigates to `/wiki/:id`)
- Click chevron: expands/collapses children
- Drag handle: initiates drag-and-drop reorder/reparent
- Right-click / "..." button: context menu:
  - New child document
  - Rename
  - Change emoji (opens emoji picker popover)
  - Search in [folder]... (opens content search scoped to this node)
  - Delete (soft delete)
- Visual indicators: selected state (highlight), has-children (chevron), active editors (dot)

**Tree building:** The backend returns a flat list via `wikiDocumentTree`. The frontend groups by `parentDocument.id`, sorts by `sortOrder`, and builds a recursive `TreeNode[]` structure in a `useMemo`.

### 8.3 Resize Handle

**File:** `frontend/src/components/wiki/resize-handle.tsx`

A thin vertical strip (4px wide, `cursor-col-resize`) between the tree sidebar and editor. On `mousedown`, starts tracking mouse position. On `mousemove`, updates sidebar width (clamped to min 200px / max 480px). On `mouseup`, persists to store (which saves to localStorage).

### 8.4 Content Area

**File:** `frontend/src/components/wiki/wiki-content-area.tsx`

Routes between three views based on state:

1. **Content search active** (`searchScope !== null`): renders `WikiSearchResults`
2. **Document selected** (`selectedDocumentId !== null`): renders `WikiEditorPane`
3. **Neither**: renders `WikiEmptyState` ("Select or create a document")

### 8.5 Editor Pane

**File:** `frontend/src/components/wiki/wiki-editor-pane.tsx`

```
WikiEditorPane
  +-- WikiEditorHeader: title (inline editable), emoji (clickable → picker),
  |   presence avatars, backup button (🕓), "Read-only" badge (if applicable)
  +-- ConnectionBanner (shown when isConnected === false or isSynced === false)
  +-- WikiEditor: TipTap collaborative editor (or read-only TipTap)
```

**Loading state:** Skeleton header bar + skeleton content block.

### 8.6 Editor Header

**File:** `frontend/src/components/wiki/wiki-editor-header.tsx`

```
WikiEditorHeader
  +-- Emoji button (clickable → EmojiPicker popover)
  +-- Title (contentEditable span or controlled input)
  |     - Save on blur or Enter key press → calls updateWikiDocument({ title })
  |     - Escape → reverts to last saved value
  |     - Validation: non-empty, max 200 characters (matches backend)
  |     - Optimistic update: tree node title updates immediately, reverts on error
  |     - Auto-selects text on focus for quick replacement
  +-- Presence avatars (active editors)
  +-- Backup button (🕓 icon → opens backup panel)
  +-- "Read-only" badge (shown for non-operator viewers)
```

### 8.7 TipTap Editor

**File:** `frontend/src/components/wiki/wiki-editor.tsx`

```
WikiEditor (key={documentId} to remount on doc switch)
  - Checks user operation role:
    - role >= operator (editor):
        useHocuspocus(documentId) -> { provider, ydoc, isConnected, isSynced }
        useEditor({
          extensions: [
            StarterKit.configure({ history: false }),  // Y.js handles undo
            Collaboration.configure({ document: ydoc }),
            CollaborationCursor.configure({ provider, user: { name, color } }),
            Placeholder.configure({ placeholder: "Start writing..." }),
          ]
        })
    - role < operator (viewer):
        Loads content from useWikiDocument(documentId) query
        useEditor({
          editable: false,
          content: document.content,  // Markdown from GraphQL
          extensions: [StarterKit],
        })
  - Renders: WikiEditorToolbar (editors only) + EditorContent
```

### 8.8 Connection Banner

**File:** `frontend/src/components/wiki/connection-banner.tsx`

Non-blocking amber banner at the top of the editor pane:
- `isConnected === false`: "Reconnecting... your edits are saved locally"
- `isSynced === false` (after reconnect): "Syncing..."
- Automatically dismisses when `isConnected && isSynced`

### 8.9 Editor Toolbar

**File:** `frontend/src/components/wiki/wiki-editor-toolbar.tsx`

Formatting buttons using TipTap's `editor.chain().focus().toggleBold().run()` pattern:
- Text: Bold, Italic, Strikethrough, Code
- Blocks: Heading 1/2/3, Bullet list, Ordered list, Task list, Code block, Blockquote
- Actions: Undo, Redo (via Y.js undo manager)

### 8.10 Emoji Picker

**File:** `frontend/src/components/wiki/emoji-picker.tsx`

Popover wrapping `@emoji-mart/react` Picker component:
- Triggered by clicking the emoji in `WikiEditorHeader` or via tree node context menu "Change emoji"
- On select: calls `updateWikiDocument` mutation with new `emoji`
- Also available in `CreateWikiDocumentDialog` as an optional emoji field

### 8.11 Hocuspocus Connection Hook

**File:** `frontend/src/hooks/use-hocuspocus.ts`

```typescript
function useHocuspocus(documentId: string) {
  // 1. Create Y.Doc
  // 2. Create HocuspocusProvider with:
  //    - url: "/api/v1/ws/wiki/" (through nginx)
  //    - name: `wiki/${documentId}`
  //    - token: async callback that calls fetchCollabTicket(documentId)
  //      (auto-refreshes access token on 401 before retrying)
  // 3. Track connection state: isConnected, isSynced
  // 4. Cleanup on unmount: provider.destroy()
  // Returns: { provider, ydoc, isConnected, isSynced }
}
```

### 8.12 Collab Ticket Fetcher

**File:** `frontend/src/lib/collab-ticket.ts`

```typescript
async function fetchCollabTicket(documentId: string): Promise<string> {
  // POST /api/v1/wiki/collab-ticket { documentId }
  // If 401: refresh access token via /login/refresh, retry once
  // Returns: ticket string
}
```

Note: This is a plain async function, not a React hook — hence the `lib/` location and non-`use-` prefix.

## 9. Trash Management

### 9.1 Trash Panel

**File:** `frontend/src/components/wiki/wiki-trash-panel.tsx`

Accessible via a trash icon button in the tree sidebar header. Shows a badge with the trash `totalCount` when non-zero.

The trash panel renders as a slide-over or dropdown panel within the tree sidebar area:
- Header: "Trash" label + "Empty Trash" button (with confirmation)
- List: trashed documents with title, emoji, deleted by, deleted at
- Each item: "Restore" button + "Delete Forever" button
- Paginated (infinite scroll using `useWikiDocumentTrash`)

**Loading state:** Skeleton rows matching trash item height.

**Actions:**
- **Restore:** calls `restoreWikiDocument`, invalidates tree + trash cache, toast "Document restored"
- **Delete Forever:** opens permanent delete confirmation dialog, calls `permanentlyDeleteWikiDocument`
- **Empty Trash:** confirmation dialog ("Permanently delete all N documents?"), calls `emptyWikiDocumentTrash`

### 9.2 Permanent Delete Dialog

**File:** `frontend/src/components/wiki/permanent-delete-wiki-document-dialog.tsx`

- Confirmation: "Permanently delete {title}? This cannot be undone."
- Calls `permanentlyDeleteWikiDocument` mutation
- On success: invalidates trash cache, toast "Document permanently deleted"

## 10. Backup Management

### 10.1 Backup Panel

**File:** `frontend/src/components/wiki/wiki-backup-panel.tsx`

Accessible via a history/clock icon button in `WikiEditorHeader`. Opens as a side panel or dialog.

- Header: "Backup History" label + "Create Backup" button
- List: backups sorted by date (newest first), each showing:
  - Timestamp
  - Trigger badge (AUTO / MANUAL)
  - Description (if any)
  - Created by username
  - Actions: "Restore" button, "Delete" button
- Paginated (infinite scroll using `useWikiDocumentBackups`)

**Loading state:** Skeleton rows.

**Actions:**
- **Create Backup:** optional description input → calls `createWikiDocumentBackup`
- **Restore:** confirmation dialog ("Restore to this backup? Current content will be overwritten.") → calls `restoreWikiDocumentBackup`
- **Delete Backup:** confirmation → calls `deleteWikiDocumentBackup`

## 11. Content Search

**File:** `frontend/src/components/wiki/wiki-search-results.tsx`

Replaces the editor pane when a content search is active.

```
WikiSearchResults
  +-- Header: "Search in {parentTitle}" + search input + close button
  +-- Results list (infinite scroll via useWikiDocuments with search param)
       +-- Each result:
            +-- Emoji + Title
            +-- Breadcrumb path (e.g., "Parent > Child > Doc Title")
            +-- Created by, updated at
            +-- Click → navigates to /wiki/:documentId, closes search
  +-- Empty state: "No documents found matching '{query}'"
```

**Entry points:**
- Tree node context menu: "Search in [folder]..." → opens with `parentDocumentId` set to that node
- Root-level action (e.g., search icon in tree sidebar header) → opens with `parentDocumentId: null` (all documents)

## 12. CRUD Dialogs

### 12.1 Create Document Dialog

**File:** `frontend/src/components/wiki/create-wiki-document-dialog.tsx`

- Input: title (required)
- Optional: emoji (clickable emoji button → emoji picker popover)
- Optional: parent document (pre-filled from tree context menu)
- Calls `createWikiDocument` mutation
- On success: navigates to new document, invalidates tree cache

### 12.2 Delete Document Dialog

**File:** `frontend/src/components/wiki/delete-wiki-document-dialog.tsx`

- Confirmation: "Delete {title}? This moves the document and its children to trash."
- Calls `deleteWikiDocument` mutation (soft delete)
- On success: if deleted doc was selected, clear selection; invalidates tree + trash cache

## 13. Real-Time Subscriptions

**File:** `frontend/src/hooks/use-wiki-subscriptions.ts`

Two subscription hooks, mounted in `WikiPage`:

1. **`useWikiDocumentChangedSubscription(operationId)`**
   - On CREATED/UPDATED/DELETED events: invalidates `wikiDocumentTree` and `wikiDocumentTrash` query caches
   - Same pattern as `useOperationChangedSubscription` in the operations page

2. **`useWikiDocumentPresenceChangedSubscription(operationId)`**
   - On JOINED/LEFT events: updates presence state for the tree (show dots on docs being edited)

**Subscription lifecycle:** Both subscriptions use the scoped `operationId` as a variable. When the user changes their scoped operation, the existing `useSubscription` hook automatically tears down the old SSE connection and opens a new one with the updated `operationId`. No special handling is needed.

## 14. File Summary

### New files (21)

| File | Purpose |
|------|---------|
| `pages/wiki.tsx` | Wiki page shell with scoping + subscriptions |
| `graphql/operations/wiki.ts` | GraphQL queries, mutations, subscriptions |
| `graphql/hooks/wiki.ts` | React Query hooks for all wiki operations |
| `stores/wiki.ts` | Wiki UI state (Zustand) |
| `components/wiki/wiki-tree-sidebar.tsx` | Document tree sidebar with search + trash access |
| `components/wiki/wiki-tree-node.tsx` | Recursive tree node (Collapsible + SortableItem) |
| `components/wiki/resize-handle.tsx` | Draggable resize handle between panels |
| `components/wiki/wiki-content-area.tsx` | Routes between editor, search, and empty state |
| `components/wiki/wiki-editor-pane.tsx` | Editor pane wrapper (header + banner + editor) |
| `components/wiki/wiki-editor-header.tsx` | Document title, emoji picker, presence, backup button |
| `components/wiki/wiki-editor.tsx` | TipTap + Y.js collaborative editor (or read-only) |
| `components/wiki/wiki-editor-toolbar.tsx` | Formatting toolbar |
| `components/wiki/connection-banner.tsx` | Disconnection/syncing status banner |
| `components/wiki/emoji-picker.tsx` | Emoji picker popover (wraps @emoji-mart/react) |
| `components/wiki/wiki-trash-panel.tsx` | Trash management panel |
| `components/wiki/wiki-backup-panel.tsx` | Backup history panel |
| `components/wiki/wiki-search-results.tsx` | Content search results view |
| `components/wiki/create-wiki-document-dialog.tsx` | Create document dialog |
| `components/wiki/delete-wiki-document-dialog.tsx` | Delete document dialog |
| `components/wiki/permanent-delete-wiki-document-dialog.tsx` | Permanent delete confirmation |
| `hooks/use-hocuspocus.ts` | Hocuspocus provider hook (Y.js + WebSocket) |
| `lib/collab-ticket.ts` | Collab ticket fetcher for WebSocket auth |

### Modified files (3)

| File | Change |
|------|--------|
| `App.tsx` | Add `/wiki` and `/wiki/:documentId` routes |
| `navigation.tsx` | Add Wiki nav item (BookOpenIcon, `permission: Permissions.OPERATION_READ`) |
| `package.json` | Add TipTap, yjs, @hocuspocus/provider, @dnd-kit/core, @dnd-kit/sortable, @emoji-mart/react, @emoji-mart/data |

## 15. Implementation Order

1. **Dependencies + routing + nav item** — get the empty page accessible
2. **GraphQL operations + codegen + hooks** — data layer (all queries, mutations, subscriptions)
3. **Wiki store** — UI state management (expanded nodes, dialogs, search scope, panels)
4. **Tree sidebar** — document tree with Collapsible + drag-and-drop + resize handle
5. **Editor pane** — TipTap + Hocuspocus collaborative editor + read-only mode + connection banner
6. **Editor header** — inline title editing + emoji picker + presence avatars + backup button
7. **CRUD dialogs** — create + delete document
8. **Trash management** — trash panel + permanent delete + empty trash
9. **Backup management** — backup panel + create/restore/delete backups
10. **Content search** — search results view + tree context menu integration
11. **Subscriptions** — real-time tree + presence + trash updates
12. **Polish** — loading skeletons, error handling, keyboard shortcuts

## 16. Future Work

- **Image/file upload:** Add TipTap image extension + backend upload endpoint + SeaweedFS storage. The TipTap extension list should be structured to make adding new block types straightforward.
- **Touch support for resize handle:** Add `onTouchStart`/`onTouchMove`/`onTouchEnd` handlers if mobile/tablet use becomes relevant.

## 17. Verification

1. `npm install` — installs new dependencies
2. `npm run codegen` — generates GraphQL types from backend schema
3. Access app via `http://localhost:8080` (through nginx)
4. Select an operation → Wiki appears in sidebar navigation
5. Click Wiki → tree sidebar loads, empty state shown in content area
6. Create a document → appears in tree, auto-selected, emoji picker works
7. Type in editor → content saves via Hocuspocus (~2s debounce)
8. Open same document in second browser tab → cursors visible, edits sync in real-time
9. Create nested document (via tree context menu) → appears under parent
10. Drag a document to reorder → sort order updates, tree reflects new position
11. Drag a document onto another → reparents as child
12. Delete document → moves to trash, disappears from tree
13. Open trash panel → deleted document visible, restore works, permanent delete works
14. Open backup panel → backup history shown, manual backup + restore works
15. Resize tree sidebar → width persists across page reloads
16. Disconnect network → amber banner appears, edits buffered locally
17. Reconnect → banner shows "Syncing...", then dismisses; edits appear
18. Right-click folder → "Search in [folder]..." → content search results shown, scoped to folder
19. Click search result → navigates to document
20. Non-operator user opens wiki → sees read-only TipTap with "Read-only" badge, no WebSocket connection
