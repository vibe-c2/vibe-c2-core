import { create } from "zustand"
import type { UserSortField } from "@/graphql/gql/graphql"
import type { DataTableSort } from "@/lib/data-table-sort"

interface SelectedUser {
  id: string
  username: string
}

type UsersPageTab = "users" | "sessions"

// The active column sort for the users table. Field values are the GraphQL
// UserSortField enum, so the sort passes straight into the list query
// variables.
export type UserSort = DataTableSort<UserSortField>

// Matches the server default (and the historical order): newest first.
const defaultSort: UserSort = {
  field: "CREATED_AT",
  direction: "DESC",
}

interface UserStoreState {
  search: string
  // Session-scoped column sort for the users table.
  sort: UserSort

  // Active tab on the Users page
  activeTab: UsersPageTab
  setActiveTab: (tab: UsersPageTab) => void

  // Selected user for edit/delete actions
  selectedUser: SelectedUser | null

  // Dialog states
  createDialogOpen: boolean
  editDialogOpen: boolean
  deleteDialogOpen: boolean

  // Actions
  setSearch: (search: string) => void
  setSort: (sort: UserSort) => void
  openCreateDialog: () => void
  openEditDialog: (user: SelectedUser) => void
  openDeleteDialog: (user: SelectedUser) => void
  closeDialogs: () => void
}

export const useUserStore = create<UserStoreState>((set) => ({
  search: "",
  sort: defaultSort,
  activeTab: "users",
  setActiveTab: (tab) => set({ activeTab: tab }),

  selectedUser: null,

  createDialogOpen: false,
  editDialogOpen: false,
  deleteDialogOpen: false,

  setSearch: (search) => set({ search }),
  setSort: (sort) => set({ sort }),

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
