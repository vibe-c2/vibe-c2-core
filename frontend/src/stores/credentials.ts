import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type {
  CredentialType,
  CredentialSearchField,
  CredentialSortField,
} from "@/graphql/gql/graphql"
import type { DataTableSort } from "@/lib/data-table-sort"

/**
 * UI-only state for the Findings → Credentials surface.
 *
 * Server state lives in TanStack Query; this store only tracks transient UI:
 * the filter inputs, which row is selected, and which dialogs are open.
 */
export interface CredentialFilters {
  search: string
  // Which fields the search term matches against. Empty = all fields (the
  // backend default). Lets the user scope a query to e.g. usernames only.
  searchFields: CredentialSearchField[]
  type: CredentialType | null
  tags: string[]
  // null = both, true = valid only (default), false = invalid only.
  validOnly: boolean | null
}

// The active column sort for the credentials table. Field values are the
// GraphQL CredentialSortField enum, so the sort passes straight into the
// list query variables.
export type CredentialSort = DataTableSort<CredentialSortField>

interface SelectedCredential {
  id: string
  name: string
}

interface CredentialStoreState {
  filters: CredentialFilters
  // Kept outside `filters` on purpose: resetFilters clears what narrows the
  // result set, while the sort merely reorders it and survives a reset.
  sort: CredentialSort
  selected: SelectedCredential | null

  createDialogOpen: boolean
  editDialogOpen: boolean
  deleteDialogOpen: boolean
  detailsPanelOpen: boolean

  // Actions
  setSearch: (search: string) => void
  setSearchFields: (fields: CredentialSearchField[]) => void
  setType: (type: CredentialType | null) => void
  setTags: (tags: string[]) => void
  toggleTag: (tag: string) => void
  setValidOnly: (validOnly: boolean | null) => void
  setSort: (sort: CredentialSort) => void
  resetFilters: () => void

  openCreateDialog: () => void
  openEditDialog: (c: SelectedCredential) => void
  openDeleteDialog: (c: SelectedCredential) => void
  openDetailsPanel: (c: SelectedCredential) => void
  closeCreateDialog: () => void
  closeEditDialog: () => void
  closeDeleteDialog: () => void
  closeDetailsPanel: () => void
}

// Default filter set — matches the requirement that the table hides invalid
// credentials by default. The frontend never sends `false` for validOnly
// unless the user opts in to "only invalid"; null = show both.
const defaultFilters: CredentialFilters = {
  search: "",
  searchFields: [],
  type: null,
  tags: [],
  validOnly: true,
}

// Matches the server default (and the historical order): newest first.
const defaultSort: CredentialSort = {
  field: "CREATED_AT",
  direction: "DESC",
}

export const useCredentialStore = create<CredentialStoreState>()(
  persist(
    (set, get) => ({
      filters: defaultFilters,
      sort: defaultSort,
      selected: null,

      createDialogOpen: false,
      editDialogOpen: false,
      deleteDialogOpen: false,
      detailsPanelOpen: false,

      setSearch: (search) =>
        set((s) => ({ filters: { ...s.filters, search } })),
      setSearchFields: (searchFields) =>
        set((s) => ({ filters: { ...s.filters, searchFields } })),
      setType: (type) =>
        set((s) => ({ filters: { ...s.filters, type } })),
      setTags: (tags) =>
        set((s) => ({ filters: { ...s.filters, tags } })),
      toggleTag: (tag) => {
        const { filters } = get()
        const present = filters.tags.includes(tag)
        const nextTags = present
          ? filters.tags.filter((t) => t !== tag)
          : [...filters.tags, tag]
        set({ filters: { ...filters, tags: nextTags } })
      },
      setValidOnly: (validOnly) =>
        set((s) => ({ filters: { ...s.filters, validOnly } })),
      setSort: (sort) => set({ sort }),
      resetFilters: () => set({ filters: defaultFilters }),

      openCreateDialog: () => set({ createDialogOpen: true }),
      openEditDialog: (c) =>
        set({ editDialogOpen: true, selected: c }),
      openDeleteDialog: (c) =>
        set({ deleteDialogOpen: true, selected: c }),
      openDetailsPanel: (c) =>
        set({ detailsPanelOpen: true, selected: c }),
      // Each dialog closes itself so layered flows (e.g. edit opened on top of
      // details) don't tear down the dialog underneath. Closing the details panel
      // is the only place we clear `selected`, since it's the entry point.
      closeCreateDialog: () => set({ createDialogOpen: false }),
      closeEditDialog: () => set({ editDialogOpen: false }),
      closeDeleteDialog: () => set({ deleteDialogOpen: false }),
      closeDetailsPanel: () =>
        set({ detailsPanelOpen: false, selected: null }),
    }),
    {
      name: "vibe-c2:credentials",
      storage: createJSONStorage(() => localStorage),
      // Only persist the validOnly toggle — search/tags/type are session-scoped
      // and dialog state is transient. Custom merge layers the persisted slice
      // onto the default filters so missing fields fall back to defaults.
      partialize: (state) => ({
        filters: { validOnly: state.filters.validOnly },
      }),
      merge: (persisted, current) => {
        const p = persisted as
          | { filters?: { validOnly?: boolean | null } }
          | undefined
        return {
          ...current,
          filters: {
            ...current.filters,
            ...(p?.filters ?? {}),
          },
        }
      },
    },
  ),
)
