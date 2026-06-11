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
// network topology. Persisted (with topologyRelation) so a reload lands the
// user back in the view they were working in.
export type HostView = "table" | "topology"

// Which relation the topology graph is built from. The two edge semantics
// (L3 "routes through" vs L2 "sits on segment") are mutually exclusive lenses:
// drawing both at once produced an unreadable hairball on real operations.
export type TopologyRelation = "routes" | "subnets"

interface HostStoreState {
  filters: HostFilters
  selected: HostFieldsFragment | null
  view: HostView
  // Topology-only: which relation type builds the graph. Lives here (not
  // component state) so the preference survives reloads and view switches.
  topologyRelation: TopologyRelation

  formDialogOpen: boolean
  deleteDialogOpen: boolean

  setSearch: (search: string) => void
  setView: (view: HostView) => void
  setTopologyRelation: (relation: TopologyRelation) => void
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
      topologyRelation: "routes",

      formDialogOpen: false,
      deleteDialogOpen: false,

      setSearch: (search) => set((s) => ({ filters: { ...s.filters, search } })),
      setView: (view) => set({ view }),
      setTopologyRelation: (topologyRelation) => set({ topologyRelation }),
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
        topologyRelation: state.topologyRelation,
      }),
      // Old persisted state may still carry the retired `showSubnets` boolean;
      // anything but a valid relation falls back to the default ("routes").
      merge: (persisted, current) => {
        const p = persisted as
          | { view?: HostView; topologyRelation?: TopologyRelation }
          | undefined
        return {
          ...current,
          view:
            p?.view === "table" || p?.view === "topology" ? p.view : current.view,
          topologyRelation:
            p?.topologyRelation === "routes" ||
            p?.topologyRelation === "subnets"
              ? p.topologyRelation
              : current.topologyRelation,
        }
      },
    },
  ),
)
