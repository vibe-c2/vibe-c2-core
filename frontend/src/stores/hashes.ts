import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { HashStatus } from "@/graphql/gql/graphql"

/**
 * UI-only state for the Findings → Hashes surface.
 *
 * Mirrors useCredentialStore: server state lives in TanStack Query; this
 * store is purely transient (filter inputs, selected row, dialog flags).
 */
export interface HashFilters {
  search: string
  statuses: HashStatus[]
  tags: string[]
  // null = both; true = only linked-to-credential; false = only unlinked.
  hasCredential: boolean | null
}

interface SelectedHash {
  id: string
  // Display label — username or hash-type — captured at the time the row
  // was selected so the modal header has something to render even before
  // the detail query lands.
  label: string
}

interface HashStoreState {
  filters: HashFilters
  selected: SelectedHash | null

  createDialogOpen: boolean
  deleteDialogOpen: boolean
  detailsPanelOpen: boolean
  bulkImportDialogOpen: boolean
  markCrackedDialogOpen: boolean

  setSearch: (search: string) => void
  setStatuses: (statuses: HashStatus[]) => void
  setTags: (tags: string[]) => void
  toggleTag: (tag: string) => void
  setHasCredential: (hasCredential: boolean | null) => void
  resetFilters: () => void

  openCreateDialog: () => void
  openDeleteDialog: (h: SelectedHash) => void
  openDetailsPanel: (h: SelectedHash) => void
  openBulkImportDialog: () => void
  openMarkCrackedDialog: (h: SelectedHash) => void
  closeCreateDialog: () => void
  closeDeleteDialog: () => void
  closeDetailsPanel: () => void
  closeBulkImportDialog: () => void
  closeMarkCrackedDialog: () => void
}

const defaultFilters: HashFilters = {
  search: "",
  statuses: [],
  tags: [],
  hasCredential: null,
}

export const useHashStore = create<HashStoreState>()(
  persist(
    (set, get) => ({
      filters: defaultFilters,
      selected: null,

      createDialogOpen: false,
      deleteDialogOpen: false,
      detailsPanelOpen: false,
      bulkImportDialogOpen: false,
      markCrackedDialogOpen: false,

      setSearch: (search) =>
        set((s) => ({ filters: { ...s.filters, search } })),
      setStatuses: (statuses) =>
        set((s) => ({ filters: { ...s.filters, statuses } })),
      setTags: (tags) => set((s) => ({ filters: { ...s.filters, tags } })),
      toggleTag: (tag) => {
        const { filters } = get()
        const present = filters.tags.includes(tag)
        const nextTags = present
          ? filters.tags.filter((t) => t !== tag)
          : [...filters.tags, tag]
        set({ filters: { ...filters, tags: nextTags } })
      },
      setHasCredential: (hasCredential) =>
        set((s) => ({ filters: { ...s.filters, hasCredential } })),
      resetFilters: () => set({ filters: defaultFilters }),

      openCreateDialog: () => set({ createDialogOpen: true }),
      openDeleteDialog: (h) => set({ deleteDialogOpen: true, selected: h }),
      openDetailsPanel: (h) => set({ detailsPanelOpen: true, selected: h }),
      openBulkImportDialog: () => set({ bulkImportDialogOpen: true }),
      openMarkCrackedDialog: (h) =>
        set({ markCrackedDialogOpen: true, selected: h }),
      closeCreateDialog: () => set({ createDialogOpen: false }),
      closeDeleteDialog: () => set({ deleteDialogOpen: false }),
      closeDetailsPanel: () =>
        set({ detailsPanelOpen: false, selected: null }),
      closeBulkImportDialog: () => set({ bulkImportDialogOpen: false }),
      closeMarkCrackedDialog: () => set({ markCrackedDialogOpen: false }),
    }),
    {
      name: "vibe-c2:hashes",
      storage: createJSONStorage(() => localStorage),
      // Nothing worth persisting yet — every filter resets per session and
      // dialog state is transient. Keep the persist wrapper anyway so adding
      // a sticky preference later is a one-line change.
      partialize: () => ({}),
      merge: (_persisted, current) => current,
    },
  ),
)
