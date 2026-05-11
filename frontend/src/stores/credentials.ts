import { create } from "zustand"
import type { CredentialType } from "@/graphql/gql/graphql"

/**
 * UI-only state for the Findings → Credentials surface.
 *
 * Server state lives in TanStack Query; this store only tracks transient UI:
 * the filter inputs, which row is selected, and which dialogs are open.
 */
export interface CredentialFilters {
  search: string
  type: CredentialType | null
  tags: string[]
  // null = both, true = valid only (default), false = invalid only.
  validOnly: boolean | null
}

interface SelectedCredential {
  id: string
  name: string
}

interface CredentialStoreState {
  filters: CredentialFilters
  selected: SelectedCredential | null

  createDialogOpen: boolean
  editDialogOpen: boolean
  deleteDialogOpen: boolean
  detailsPanelOpen: boolean

  // Actions
  setSearch: (search: string) => void
  setType: (type: CredentialType | null) => void
  setTags: (tags: string[]) => void
  toggleTag: (tag: string) => void
  setValidOnly: (validOnly: boolean | null) => void
  resetFilters: () => void

  openCreateDialog: () => void
  openEditDialog: (c: SelectedCredential) => void
  openDeleteDialog: (c: SelectedCredential) => void
  openDetailsPanel: (c: SelectedCredential) => void
  closeDialogs: () => void
}

// Default filter set — matches the requirement that the table hides invalid
// credentials by default. The frontend never sends `false` for validOnly
// unless the user opts in to "only invalid"; null = show both.
const defaultFilters: CredentialFilters = {
  search: "",
  type: null,
  tags: [],
  validOnly: true,
}

export const useCredentialStore = create<CredentialStoreState>((set, get) => ({
  filters: defaultFilters,
  selected: null,

  createDialogOpen: false,
  editDialogOpen: false,
  deleteDialogOpen: false,
  detailsPanelOpen: false,

  setSearch: (search) =>
    set((s) => ({ filters: { ...s.filters, search } })),
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
  resetFilters: () => set({ filters: defaultFilters }),

  openCreateDialog: () => set({ createDialogOpen: true }),
  openEditDialog: (c) =>
    set({ editDialogOpen: true, selected: c }),
  openDeleteDialog: (c) =>
    set({ deleteDialogOpen: true, selected: c }),
  openDetailsPanel: (c) =>
    set({ detailsPanelOpen: true, selected: c }),
  closeDialogs: () =>
    set({
      createDialogOpen: false,
      editDialogOpen: false,
      deleteDialogOpen: false,
      detailsPanelOpen: false,
      selected: null,
    }),
}))
