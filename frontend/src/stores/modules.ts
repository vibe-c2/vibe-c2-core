import { create } from "zustand"

interface SelectedModule {
  instance: string
  type: string
}

// Lifecycle status filter for the modules list. `null` means "all states" —
// the default, so the operator sees registered, deregistered, and dead rows
// together (and the "removed but still heartbeating" flip is visible).
export type ModuleStatusFilter =
  | null
  | "registered"
  | "deregistered"
  | "dead"

interface ModuleStoreState {
  search: string
  statusFilter: ModuleStatusFilter

  // Selected module for the remove action.
  selectedModule: SelectedModule | null

  // Dialog state.
  removeDialogOpen: boolean

  // Actions.
  setSearch: (search: string) => void
  setStatusFilter: (status: ModuleStatusFilter) => void
  openRemoveDialog: (module: SelectedModule) => void
  closeDialogs: () => void
}

export const useModuleStore = create<ModuleStoreState>((set) => ({
  search: "",
  statusFilter: null,

  selectedModule: null,
  removeDialogOpen: false,

  setSearch: (search) => set({ search }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  openRemoveDialog: (module) =>
    set({ removeDialogOpen: true, selectedModule: module }),
  closeDialogs: () => set({ removeDialogOpen: false, selectedModule: null }),
}))
