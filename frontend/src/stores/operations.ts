import { create } from "zustand"

interface SelectedOperation {
  id: string
  name: string
}

interface OperationStoreState {
  search: string

  // Selected operation for edit/delete/members actions
  selectedOperation: SelectedOperation | null

  // Dialog states
  createDialogOpen: boolean
  editDialogOpen: boolean
  deleteDialogOpen: boolean
  membersDialogOpen: boolean

  // Actions
  setSearch: (search: string) => void
  openCreateDialog: () => void
  openEditDialog: (op: SelectedOperation) => void
  openDeleteDialog: (op: SelectedOperation) => void
  openMembersDialog: (op: SelectedOperation) => void
  closeDialogs: () => void
}

export const useOperationStore = create<OperationStoreState>((set) => ({
  search: "",

  selectedOperation: null,

  createDialogOpen: false,
  editDialogOpen: false,
  deleteDialogOpen: false,
  membersDialogOpen: false,

  setSearch: (search) => set({ search }),

  openCreateDialog: () => set({ createDialogOpen: true }),
  openEditDialog: (op) => set({ editDialogOpen: true, selectedOperation: op }),
  openDeleteDialog: (op) => set({ deleteDialogOpen: true, selectedOperation: op }),
  openMembersDialog: (op) => set({ membersDialogOpen: true, selectedOperation: op }),
  closeDialogs: () =>
    set({
      createDialogOpen: false,
      editDialogOpen: false,
      deleteDialogOpen: false,
      membersDialogOpen: false,
      selectedOperation: null,
    }),
}))
