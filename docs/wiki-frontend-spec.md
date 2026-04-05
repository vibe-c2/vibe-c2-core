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
| |          | | |WikiTree  | |WikiEditor         | | |
| | Dashboard| | |Sidebar   | |                   | | |
| | Wiki  <--| | |(resizable| | TipTap + Y.js     | | |
| | -------- | | | w/ drag  | | collaborative     | | |
| | Ops      | | | handle)  | | editor            | | |
| | Users    | | |          | |                   | | |
| |          | | | > Doc A  | |                   | | |
| |          | | | v Doc B  | |                   | | |
| |          | | |   > B.1  | |                   | | |
| |          | | |   > B.2  | |                   | | |
| |          | | | > Doc C  | |                   | | |
| |          | | +----------+ +-------------------+ | |
| +----------+ +------------------------------------+ |
+-----------------------------------------------------+
```

The wiki page lives inside the existing `AppLayout` (app sidebar + content area). The wiki's own tree sidebar is a **resizable panel within the page content area**, not a second app-level sidebar.

## 3. Design Decisions

### 3.1 Document Tree: Custom Collapsible (No New Dependencies)

The document tree is built using the existing `Collapsible` component from `@base-ui/react` (already in `components/ui/collapsible.tsx`). Each tree node is a `Collapsible` with a trigger (chevron + emoji + title) and a panel (children rendered recursively).

**Why not a tree library?** Zero new dependencies, full control over styling to match the existing shadcn/base-ui design system, and the tree is small (C2 team wikis, not a filesystem). Drag-and-drop reordering can be added later with `@dnd-kit/core` if needed.

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

Viewers (role < operator) see the document content as read-only Markdown from the GraphQL API — they do not connect to the WebSocket.

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
```

No new dependencies for the tree sidebar — uses existing `@base-ui/react` Collapsible.

## 5. GraphQL Operations

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
    id title emoji sortOrder
    parentDocument { id }
  }
}

mutation UpdateWikiDocument($id: ID!, $input: UpdateWikiDocumentInput!) {
  updateWikiDocument(id: $id, input: $input) {
    id title emoji color icon sortOrder
    parentDocument { id }
  }
}

mutation DeleteWikiDocument($id: ID!) {
  deleteWikiDocument(id: $id)
}

mutation RestoreWikiDocument($id: ID!) {
  restoreWikiDocument(id: $id) {
    id title
  }
}

mutation CreateWikiDocumentBackup($documentId: ID!, $description: String) {
  createWikiDocumentBackup(documentId: $documentId, description: $description) {
    id trigger description createdAt
  }
}

mutation RestoreWikiDocumentBackup($documentId: ID!, $backupId: ID!) {
  restoreWikiDocumentBackup(documentId: $documentId, backupId: $backupId) {
    id title content
  }
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
| `useWikiDocumentBackups(documentId)` | `useInfiniteQuery` | Paginated backup list |
| `useWikiDocumentPresence(documentId)` | `useQuery` | Active editors (polled or subscription-driven) |
| `useCreateWikiDocument()` | `useMutation` | Create doc, invalidates tree cache |
| `useUpdateWikiDocument()` | `useMutation` | Update metadata, invalidates tree cache |
| `useDeleteWikiDocument()` | `useMutation` | Soft delete, invalidates tree cache |
| `useRestoreWikiDocument()` | `useMutation` | Restore from trash |
| `useCreateWikiDocumentBackup()` | `useMutation` | Manual backup |
| `useRestoreWikiDocumentBackup()` | `useMutation` | Restore from backup |

Cache keys follow the existing pattern: `wikiKeys.tree(operationId)`, `wikiKeys.detail(documentId)`, etc.

## 7. Wiki Store (Zustand)

**File:** `frontend/src/stores/wiki.ts`

```typescript
interface WikiStoreState {
  // Tree state
  expandedNodes: Set<string>           // persisted to localStorage
  toggleNode: (id: string) => void

  // Selection (synced with URL param)
  selectedDocumentId: string | null
  selectDocument: (id: string | null) => void

  // Create dialog
  createDialogOpen: boolean
  createParentId: string | null        // parent for new doc (null = root)
  openCreateDialog: (parentId?: string) => void
  closeCreateDialog: () => void

  // Delete dialog
  deleteDialogOpen: boolean
  deleteTarget: { id: string; title: string } | null
  openDeleteDialog: (target: { id: string; title: string }) => void
  closeDeleteDialog: () => void

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
  - Renders: WikiTreeSidebar | ResizeHandle | WikiEditorPane
  - Mounts: CreateWikiDocumentDialog, DeleteWikiDocumentDialog
```

### 8.2 Tree Sidebar

**File:** `frontend/src/components/wiki/wiki-tree-sidebar.tsx`

```
WikiTreeSidebar
  +-- Header: "Documents" label + "+" create button
  +-- Search input (filters tree client-side)
  +-- Scrollable tree area
       +-- WikiTreeNode (recursive)
            +-- Collapsible
                 +-- CollapsibleTrigger: chevron + emoji + title + context menu
                 +-- CollapsibleContent: children WikiTreeNodes
```

**File:** `frontend/src/components/wiki/wiki-tree-node.tsx`

Each node:
- Click title: selects document (navigates to `/wiki/:id`)
- Click chevron: expands/collapses children
- Right-click / "..." button: context menu (New child, Rename, Delete)
- Visual indicators: selected state (highlight), has-children (chevron), active editors (dot)

**Tree building:** The backend returns a flat list via `wikiDocumentTree`. The frontend groups by `parentDocument.id`, sorts by `sortOrder`, and builds a recursive `TreeNode[]` structure in a `useMemo`.

### 8.3 Resize Handle

**File:** `frontend/src/components/wiki/resize-handle.tsx`

A thin vertical strip (4px wide, `cursor-col-resize`) between the tree sidebar and editor. On `mousedown`, starts tracking mouse position. On `mousemove`, updates sidebar width (clamped to min 200px / max 480px). On `mouseup`, persists to store (which saves to localStorage).

### 8.4 Editor Pane

**File:** `frontend/src/components/wiki/wiki-editor-pane.tsx`

```
WikiEditorPane
  - If no document selected: WikiEmptyState ("Select or create a document")
  - If document selected:
      +-- WikiEditorHeader: title (editable inline), emoji, presence avatars
      +-- WikiEditor: TipTap collaborative editor
```

### 8.5 TipTap Editor

**File:** `frontend/src/components/wiki/wiki-editor.tsx`

```
WikiEditor (key={documentId} to remount on doc switch)
  - useHocuspocus(documentId) -> { provider, ydoc, isConnected, isSynced }
  - useEditor({
      extensions: [
        StarterKit.configure({ history: false }),  // Y.js handles undo
        Collaboration.configure({ document: ydoc }),
        CollaborationCursor.configure({ provider, user: { name, color } }),
        Placeholder.configure({ placeholder: "Start writing..." }),
      ]
    })
  - Renders: WikiEditorToolbar + EditorContent
```

### 8.6 Editor Toolbar

**File:** `frontend/src/components/wiki/wiki-editor-toolbar.tsx`

Formatting buttons using TipTap's `editor.chain().focus().toggleBold().run()` pattern:
- Text: Bold, Italic, Strikethrough, Code
- Blocks: Heading 1/2/3, Bullet list, Ordered list, Task list, Code block, Blockquote
- Actions: Undo, Redo (via Y.js undo manager)

### 8.7 Hocuspocus Connection Hook

**File:** `frontend/src/hooks/use-hocuspocus.ts`

```typescript
function useHocuspocus(documentId: string) {
  // 1. Create Y.Doc
  // 2. Create HocuspocusProvider with:
  //    - url: "/api/v1/ws/wiki/" (through nginx)
  //    - name: `wiki/${documentId}`
  //    - token: async callback that calls POST /api/v1/wiki/collab-ticket
  //      (auto-refreshes access token on 401 before retrying)
  // 3. Track connection state: isConnected, isSynced
  // 4. Cleanup on unmount: provider.destroy()
  // Returns: { provider, ydoc, isConnected, isSynced }
}
```

### 8.8 Collab Ticket Hook

**File:** `frontend/src/hooks/use-collab-ticket.ts`

```typescript
async function fetchCollabTicket(documentId: string): Promise<string> {
  // POST /api/v1/wiki/collab-ticket { documentId }
  // If 401: refresh access token via /login/refresh, retry once
  // Returns: ticket string
}
```

## 9. CRUD Dialogs

### 9.1 Create Document Dialog

**File:** `frontend/src/components/wiki/create-wiki-document-dialog.tsx`

- Input: title (required)
- Optional: parent document (pre-filled from tree context menu)
- Calls `createWikiDocument` mutation
- On success: navigates to new document, invalidates tree cache

### 9.2 Delete Document Dialog

**File:** `frontend/src/components/wiki/delete-wiki-document-dialog.tsx`

- Confirmation: "Delete {title}? This moves the document and its children to trash."
- Calls `deleteWikiDocument` mutation (soft delete)
- On success: if deleted doc was selected, clear selection; invalidates tree cache

## 10. Real-Time Subscriptions

**File:** `frontend/src/hooks/use-wiki-subscriptions.ts`

Two subscription hooks, mounted in `WikiPage`:

1. **`useWikiDocumentChangedSubscription(operationId)`**
   - On CREATED/UPDATED/DELETED events: invalidates `wikiDocumentTree` query cache
   - Same pattern as `useOperationChangedSubscription` in the operations page

2. **`useWikiDocumentPresenceChangedSubscription(operationId)`**
   - On JOINED/LEFT events: updates presence state for the tree (show dots on docs being edited)

## 11. File Summary

### New files (15)

| File | Purpose |
|------|---------|
| `pages/wiki.tsx` | Wiki page shell with scoping + subscriptions |
| `graphql/operations/wiki.ts` | GraphQL queries, mutations, subscriptions |
| `graphql/hooks/wiki.ts` | React Query hooks for all wiki operations |
| `stores/wiki.ts` | Wiki UI state (Zustand) |
| `components/wiki/wiki-tree-sidebar.tsx` | Document tree sidebar with search |
| `components/wiki/wiki-tree-node.tsx` | Recursive tree node (Collapsible-based) |
| `components/wiki/resize-handle.tsx` | Draggable resize handle between panels |
| `components/wiki/wiki-editor-pane.tsx` | Editor pane wrapper (selected doc or empty state) |
| `components/wiki/wiki-editor.tsx` | TipTap + Y.js collaborative editor |
| `components/wiki/wiki-editor-header.tsx` | Document title, emoji, presence indicators |
| `components/wiki/wiki-editor-toolbar.tsx` | Formatting toolbar |
| `components/wiki/create-wiki-document-dialog.tsx` | Create document dialog |
| `components/wiki/delete-wiki-document-dialog.tsx` | Delete document dialog |
| `hooks/use-collab-ticket.ts` | Collab ticket fetcher for WebSocket auth |
| `hooks/use-hocuspocus.ts` | Hocuspocus provider hook (Y.js + WebSocket) |

### Modified files (3)

| File | Change |
|------|--------|
| `App.tsx` | Add `/wiki` and `/wiki/:documentId` routes |
| `navigation.tsx` | Add Wiki nav item (BookOpenIcon) to `navigationItems` |
| `package.json` | Add TipTap, yjs, @hocuspocus/provider dependencies |

## 12. Implementation Order

1. **Dependencies + routing + nav item** — get the empty page accessible
2. **GraphQL operations + codegen + hooks** — data layer
3. **Wiki store** — UI state management
4. **Tree sidebar** — document tree with Collapsible + resize handle
5. **Editor pane** — TipTap + Hocuspocus collaborative editor
6. **CRUD dialogs** — create + delete document
7. **Subscriptions** — real-time tree + presence updates
8. **Polish** — empty states, loading skeletons, error handling, keyboard shortcuts

## 13. Verification

1. `npm install` — installs new dependencies
2. `npm run codegen` — generates GraphQL types from backend schema
3. Access app via `http://localhost:8080` (through nginx)
4. Select an operation -> Wiki appears in sidebar navigation
5. Click Wiki -> tree sidebar loads, empty state shown in editor
6. Create a document -> appears in tree, auto-selected
7. Type in editor -> content saves via Hocuspocus (~2s debounce)
8. Open same document in second browser tab -> cursors visible, edits sync in real-time
9. Create nested document (via tree context menu) -> appears under parent
10. Delete document -> moves to trash, disappears from tree
11. Resize tree sidebar -> width persists across page reloads
