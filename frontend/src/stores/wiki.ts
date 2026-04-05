import { create } from "zustand"

const STORAGE_KEY_EXPANDED = "wiki_expanded_nodes"
const STORAGE_KEY_WIDTH = "wiki_sidebar_width"
const DEFAULT_WIDTH = 256

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

interface WikiStoreState {
  // Tree expand/collapse
  expandedNodes: Set<string>
  toggleNode: (id: string) => void
  expandNode: (id: string) => void

  // Create dialog
  createDialogOpen: boolean
  createParentId: string | null
  openCreateDialog: (parentId?: string | null) => void
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
  backupDocumentId: string | null
  openBackupPanel: (documentId: string) => void
  closeBackupPanel: () => void

  // Content search
  searchScope: { parentDocumentId: string | null; parentTitle: string } | null
  openContentSearch: (parentDocumentId: string | null, parentTitle: string) => void
  closeContentSearch: () => void

  // Sidebar width
  sidebarWidth: number
  setSidebarWidth: (width: number) => void
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

  // Create dialog
  createDialogOpen: false,
  createParentId: null,
  openCreateDialog: (parentId) =>
    set({ createDialogOpen: true, createParentId: parentId ?? null }),
  closeCreateDialog: () =>
    set({ createDialogOpen: false, createParentId: null }),

  // Delete dialog
  deleteDialogOpen: false,
  deleteTarget: null,
  openDeleteDialog: (target) =>
    set({ deleteDialogOpen: true, deleteTarget: target }),
  closeDeleteDialog: () =>
    set({ deleteDialogOpen: false, deleteTarget: null }),

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

  // Content search
  searchScope: null,
  openContentSearch: (parentDocumentId, parentTitle) =>
    set({ searchScope: { parentDocumentId, parentTitle } }),
  closeContentSearch: () => set({ searchScope: null }),

  // Sidebar width — persisted to localStorage
  sidebarWidth: loadSidebarWidth(),
  setSidebarWidth: (width) => {
    localStorage.setItem(STORAGE_KEY_WIDTH, String(width))
    set({ sidebarWidth: width })
  },
}))
