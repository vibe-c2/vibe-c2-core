import { create } from "zustand"
import type { WikiDocumentSort } from "@/graphql/gql/graphql"

const STORAGE_KEY_EXPANDED = "wiki_expanded_nodes"
const STORAGE_KEY_WIDTH = "wiki_sidebar_width"
const STORAGE_KEY_RECENT_SORT = "wiki_recent_docs_sort"
const DEFAULT_WIDTH = 256
const DEFAULT_RECENT_SORT: WikiDocumentSort = "RECENTLY_CREATED"

function loadRecentSort(): WikiDocumentSort {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECENT_SORT)
    if (raw === "RECENTLY_CREATED" || raw === "RECENTLY_UPDATED") return raw
    return DEFAULT_RECENT_SORT
  } catch {
    return DEFAULT_RECENT_SORT
  }
}

function loadExpandedNodes(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EXPANDED)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function saveExpandedNodes(nodes: Set<string>) {
  localStorage.setItem(STORAGE_KEY_EXPANDED, JSON.stringify([...nodes]))
}

function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WIDTH)
    return raw ? Number(raw) : DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}

export interface BackupConfirmTarget {
  backupId: string
  documentId: string
  action: "restore" | "delete"
  // Meta carried from the list row so the confirm dialog can show a
  // specific, contextful message without re-fetching.
  createdAt: string
  trigger: "AUTO" | "MANUAL"
  description: string
}

interface WikiStoreState {
  // Tree expand/collapse
  expandedNodes: Set<string>
  toggleNode: (id: string) => void
  expandNode: (id: string) => void
  expandMany: (ids: readonly string[]) => void
  collapseMany: (ids: readonly string[]) => void

  // Create dialog
  createDialogOpen: boolean
  createParentId: string | null
  openCreateDialog: (parentId?: string | null) => void
  closeCreateDialog: () => void

  // Import-from-Outline dialog
  importOutlineDialogOpen: boolean
  openImportOutlineDialog: () => void
  closeImportOutlineDialog: () => void

  // Export dialog. `target` is null for tree-wide exports, populated for
  // subtree exports triggered from the 3-dots menu on a tree row.
  exportDialogOpen: boolean
  exportTarget: { id: string; title: string; childCount: number } | null
  openExportDialog: (
    target?: { id: string; title: string; childCount: number },
  ) => void
  closeExportDialog: () => void

  // Move dialog
  moveDialogOpen: boolean
  moveTarget: { id: string; title: string } | null
  openMoveDialog: (target: { id: string; title: string }) => void
  closeMoveDialog: () => void

  // Delete dialog (soft delete)
  deleteDialogOpen: boolean
  deleteTarget: { id: string; title: string } | null
  openDeleteDialog: (target: { id: string; title: string }) => void
  closeDeleteDialog: () => void

  // Duplicate dialog — only opens for documents with children, so the user
  // can choose whether the clone is shallow or deep. Leaf documents bypass
  // the dialog entirely.
  duplicateDialogOpen: boolean
  duplicateTarget: { id: string; title: string; childCount: number } | null
  openDuplicateDialog: (target: { id: string; title: string; childCount: number }) => void
  closeDuplicateDialog: () => void

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
  backupDocumentId: string | null
  openBackupPanel: (documentId: string) => void
  closeBackupPanel: () => void

  // Backup preview dialog (row click → side-by-side view)
  backupPreviewId: string | null
  openBackupPreview: (backupId: string) => void
  closeBackupPreview: () => void

  // Backup confirm dialog (restore / delete, with embedded context)
  backupConfirmTarget: BackupConfirmTarget | null
  openBackupConfirm: (target: BackupConfirmTarget) => void
  closeBackupConfirm: () => void

  // Recent documents modal — sort preference persists across sessions so
  // the user's last toggle choice survives a reload.
  recentDocsOpen: boolean
  recentDocsSort: WikiDocumentSort
  openRecentDocs: () => void
  closeRecentDocs: () => void
  setRecentDocsSort: (sort: WikiDocumentSort) => void

  // Sidebar width
  sidebarWidth: number
  setSidebarWidth: (width: number) => void

  // Editor zoom (focus mode — overlays the wiki tree and app sidebar)
  editorZoomed: boolean
  toggleEditorZoom: () => void
  setEditorZoom: (zoomed: boolean) => void

  // Editor table-of-contents overlay (floats over the editor's upper-right
  // corner). Transient view state — not persisted; reverts to hidden on each
  // navigation/load so the panel doesn't surprise users who never opened it.
  editorTocVisible: boolean
  toggleEditorToc: () => void
  setEditorTocVisible: (visible: boolean) => void

  // One-shot signal from the create flow to the editor: when the editor for
  // this document mounts, focus it at the start so the user can start typing
  // immediately. Consumed (cleared) by the editor on first apply so revisits
  // don't keep stealing focus.
  pendingFocusDocId: string | null
  setPendingFocusDocId: (id: string | null) => void
}

export const useWikiStore = create<WikiStoreState>((set, get) => ({
  // Tree expand/collapse — persisted to localStorage
  expandedNodes: loadExpandedNodes(),
  toggleNode: (id) => {
    const next = new Set(get().expandedNodes)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    saveExpandedNodes(next)
    set({ expandedNodes: next })
  },
  expandNode: (id) => {
    const next = new Set(get().expandedNodes)
    next.add(id)
    saveExpandedNodes(next)
    set({ expandedNodes: next })
  },
  expandMany: (ids) => {
    const next = new Set(get().expandedNodes)
    for (const id of ids) next.add(id)
    saveExpandedNodes(next)
    set({ expandedNodes: next })
  },
  collapseMany: (ids) => {
    const next = new Set(get().expandedNodes)
    for (const id of ids) next.delete(id)
    saveExpandedNodes(next)
    set({ expandedNodes: next })
  },

  // Create dialog
  createDialogOpen: false,
  createParentId: null,
  openCreateDialog: (parentId) =>
    set({ createDialogOpen: true, createParentId: parentId ?? null }),
  closeCreateDialog: () =>
    set({ createDialogOpen: false, createParentId: null }),

  // Import-from-Outline dialog
  importOutlineDialogOpen: false,
  openImportOutlineDialog: () => set({ importOutlineDialogOpen: true }),
  closeImportOutlineDialog: () => set({ importOutlineDialogOpen: false }),

  // Export dialog
  exportDialogOpen: false,
  exportTarget: null,
  openExportDialog: (target) =>
    set({ exportDialogOpen: true, exportTarget: target ?? null }),
  closeExportDialog: () =>
    set({ exportDialogOpen: false, exportTarget: null }),

  // Move dialog
  moveDialogOpen: false,
  moveTarget: null,
  openMoveDialog: (target) =>
    set({ moveDialogOpen: true, moveTarget: target }),
  closeMoveDialog: () =>
    set({ moveDialogOpen: false, moveTarget: null }),

  // Delete dialog
  deleteDialogOpen: false,
  deleteTarget: null,
  openDeleteDialog: (target) =>
    set({ deleteDialogOpen: true, deleteTarget: target }),
  closeDeleteDialog: () =>
    set({ deleteDialogOpen: false, deleteTarget: null }),

  // Duplicate dialog
  duplicateDialogOpen: false,
  duplicateTarget: null,
  openDuplicateDialog: (target) =>
    set({ duplicateDialogOpen: true, duplicateTarget: target }),
  closeDuplicateDialog: () =>
    set({ duplicateDialogOpen: false, duplicateTarget: null }),

  // Permanent delete dialog
  permanentDeleteDialogOpen: false,
  permanentDeleteTarget: null,
  openPermanentDeleteDialog: (target) =>
    set({ permanentDeleteDialogOpen: true, permanentDeleteTarget: target }),
  closePermanentDeleteDialog: () =>
    set({ permanentDeleteDialogOpen: false, permanentDeleteTarget: null }),

  // Trash panel
  trashPanelOpen: false,
  openTrashPanel: () => set({ trashPanelOpen: true }),
  closeTrashPanel: () => set({ trashPanelOpen: false }),

  // Backup panel
  backupPanelOpen: false,
  backupDocumentId: null,
  openBackupPanel: (documentId) =>
    set({ backupPanelOpen: true, backupDocumentId: documentId }),
  closeBackupPanel: () =>
    set({ backupPanelOpen: false, backupDocumentId: null }),

  // Backup preview dialog
  backupPreviewId: null,
  openBackupPreview: (backupId) => set({ backupPreviewId: backupId }),
  closeBackupPreview: () => set({ backupPreviewId: null }),

  // Backup confirm dialog
  backupConfirmTarget: null,
  openBackupConfirm: (target) => set({ backupConfirmTarget: target }),
  closeBackupConfirm: () => set({ backupConfirmTarget: null }),

  // Recent documents modal
  recentDocsOpen: false,
  recentDocsSort: loadRecentSort(),
  openRecentDocs: () => set({ recentDocsOpen: true }),
  closeRecentDocs: () => set({ recentDocsOpen: false }),
  setRecentDocsSort: (sort) => {
    localStorage.setItem(STORAGE_KEY_RECENT_SORT, sort)
    set({ recentDocsSort: sort })
  },

  // Sidebar width — persisted to localStorage
  sidebarWidth: loadSidebarWidth(),
  setSidebarWidth: (width) => {
    localStorage.setItem(STORAGE_KEY_WIDTH, String(width))
    set({ sidebarWidth: width })
  },

  // Editor zoom — transient view state, not persisted.
  editorZoomed: false,
  toggleEditorZoom: () => set((state) => ({ editorZoomed: !state.editorZoomed })),
  setEditorZoom: (zoomed) => set({ editorZoomed: zoomed }),

  // Editor TOC — transient view state, not persisted.
  editorTocVisible: false,
  toggleEditorToc: () => set((state) => ({ editorTocVisible: !state.editorTocVisible })),
  setEditorTocVisible: (visible) => set({ editorTocVisible: visible }),

  // Editor caret bootstrap — set by the create dialog right before it
  // navigates to the new doc.
  pendingFocusDocId: null,
  setPendingFocusDocId: (id) => set({ pendingFocusDocId: id }),
}))
