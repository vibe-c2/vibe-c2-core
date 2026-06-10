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
// network topology. Persisted (with showSubnets) so a reload lands the user
// back in the view they were working in.
export type HostView = "table" | "topology"

interface HostStoreState {
  filters: HostFilters
  selected: HostFieldsFragment | null
  view: HostView
  // Topology-only: render subnet hub nodes + interface edges, or hosts/routes
  // only. Lives here (not component state) so the preference survives reloads
  // and view switches.
  showSubnets: boolean

  formDialogOpen: boolean
  deleteDialogOpen: boolean

  setSearch: (search: string) => void
  setView: (view: HostView) => void
  toggleSubnets: () => void
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
      showSubnets: false,

      formDialogOpen: false,
      deleteDialogOpen: false,

      setSearch: (search) => set((s) => ({ filters: { ...s.filters, search } })),
      setView: (view) => set({ view }),
      // Toggle lives in the store (not `setShowSubnets(!current)` at the call
      // site) so it reads the latest value — a closure over a stale render
      // can't turn a double-click into a no-op.
      toggleSubnets: () => set((s) => ({ showSubnets: !s.showSubnets })),
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
      // Only the view preferences are sticky — search resets per session and
      // dialog state is transient. Custom merge validates the persisted view
      // so a stale/corrupt localStorage value falls back to the default.
      partialize: (state) => ({
        view: state.view,
        showSubnets: state.showSubnets,
      }),
      merge: (persisted, current) => {
        const p = persisted as
          | { view?: HostView; showSubnets?: boolean }
          | undefined
        return {
          ...current,
          view:
            p?.view === "table" || p?.view === "topology" ? p.view : current.view,
          showSubnets:
            typeof p?.showSubnets === "boolean"
              ? p.showSubnets
              : current.showSubnets,
        }
      },
    },
  ),
)
