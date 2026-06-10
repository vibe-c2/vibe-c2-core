import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { HostFieldsFragment } from "@/graphql/gql/graphql"

/**
 * UI-only state for the Findings → Hosts surface.
 *
 * Mirrors useHashStore: server state lives in TanStack Query; this store is
 * purely transient (filter input, selected row, dialog flags).
 *
 * Two deliberate simplifications vs hashes/credentials:
 * - `selected` carries the FULL row node, not an {id,label} stub. The hosts
 *   row fragment already includes interfaces/routes (they're the host's
 *   primary content), so the edit form can seed from the cached node with no
 *   detail query and no loading state.
 * - Create and edit share one dialog (`formDialogOpen`): selected === null
 *   means create, otherwise edit. Hosts have no operation picker on create
 *   (the tab is scoped-only) and no fetch on edit, so two separate dialog
 *   components would be near-identical shells.
 */
export interface HostFilters {
  search: string
}

// The Hosts tab renders the same data two ways: the CRUD table and a derived
// network topology. Session-only state (defaults to table); not persisted, in
// keeping with `partialize: () => ({})` below.
export type HostView = "table" | "topology"

interface HostStoreState {
  filters: HostFilters
  selected: HostFieldsFragment | null
  view: HostView

  formDialogOpen: boolean
  deleteDialogOpen: boolean

  setSearch: (search: string) => void
  setView: (view: HostView) => void
  resetFilters: () => void

  openCreateDialog: () => void
  openEditDialog: (h: HostFieldsFragment) => void
  openDeleteDialog: (h: HostFieldsFragment) => void
  closeFormDialog: () => void
  closeDeleteDialog: () => void
}

const defaultFilters: HostFilters = {
  search: "",
}

export const useHostStore = create<HostStoreState>()(
  persist(
    (set) => ({
      filters: defaultFilters,
      selected: null,
      view: "table",

      formDialogOpen: false,
      deleteDialogOpen: false,

      setSearch: (search) => set((s) => ({ filters: { ...s.filters, search } })),
      setView: (view) => set({ view }),
      resetFilters: () => set({ filters: defaultFilters }),

      // Open actions are mutually exclusive: both dialogs render from the
      // shared `selected`, so opening one while the other is up would swap
      // the subject under the open dialog (and remount the edit form,
      // silently discarding changes). Closing the other dialog first keeps
      // `selected` owned by exactly one dialog at a time.
      openCreateDialog: () =>
        set({ formDialogOpen: true, selected: null, deleteDialogOpen: false }),
      openEditDialog: (h) =>
        set({ formDialogOpen: true, selected: h, deleteDialogOpen: false }),
      openDeleteDialog: (h) =>
        set({ deleteDialogOpen: true, selected: h, formDialogOpen: false }),
      closeFormDialog: () => set({ formDialogOpen: false }),
      closeDeleteDialog: () => set({ deleteDialogOpen: false }),
    }),
    {
      name: "vibe-c2:hosts",
      storage: createJSONStorage(() => localStorage),
      // Nothing worth persisting yet — every filter resets per session and
      // dialog state is transient. Keep the persist wrapper anyway so adding
      // a sticky preference later is a one-line change.
      partialize: () => ({}),
      merge: (_persisted, current) => current,
    },
  ),
)
