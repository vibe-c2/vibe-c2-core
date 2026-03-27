import { create } from "zustand"

interface SelectedUser {
  id: string
  username: string
}

interface UserStoreState {
  search: string

  // Selected user for edit/delete actions
  selectedUser: SelectedUser | null

  // Dialog states
  createDialogOpen: boolean
  editDialogOpen: boolean
  deleteDialogOpen: boolean

  // Actions
  setSearch: (search: string) => void
  openCreateDialog: () => void
  openEditDialog: (user: SelectedUser) => void
  openDeleteDialog: (user: SelectedUser) => void
  closeDialogs: () => void
}

export const useUserStore = create<UserStoreState>((set) => ({
  search: "",

  selectedUser: null,

  createDialogOpen: false,
  editDialogOpen: false,
  deleteDialogOpen: false,

  setSearch: (search) => set({ search }),

  openCreateDialog: () => set({ createDialogOpen: true }),
  openEditDialog: (user) => set({ editDialogOpen: true, selectedUser: user }),
  openDeleteDialog: (user) => set({ deleteDialogOpen: true, selectedUser: user }),
  closeDialogs: () =>
    set({
      createDialogOpen: false,
      editDialogOpen: false,
      deleteDialogOpen: false,
      selectedUser: null,
    }),
}))
