import { create } from "zustand"
import type { OperationSortField } from "@/graphql/gql/graphql"
import type { DataTableSort } from "@/lib/data-table-sort"

interface SelectedOperation {
  id: string
  name: string
}

// The active column sort for the operations table. Field values are the
// GraphQL OperationSortField enum, so the sort passes straight into the list
// query variables.
export type OperationSort = DataTableSort<OperationSortField>

// Matches the server default (and the historical order): newest first.
const defaultSort: OperationSort = {
  field: "CREATED_AT",
  direction: "DESC",
}

interface OperationStoreState {
  search: string
  // Session-scoped column sort for the operations table.
  sort: OperationSort

  // Selected operation for edit/delete/members actions
  selectedOperation: SelectedOperation | null

  // Dialog states
  createDialogOpen: boolean
  editDialogOpen: boolean
  deleteDialogOpen: boolean
  membersDialogOpen: boolean

  // Actions
  setSearch: (search: string) => void
  setSort: (sort: OperationSort) => void
  openCreateDialog: () => void
  openEditDialog: (op: SelectedOperation) => void
  openDeleteDialog: (op: SelectedOperation) => void
  openMembersDialog: (op: SelectedOperation) => void
  closeDialogs: () => void
}

export const useOperationStore = create<OperationStoreState>((set) => ({
  search: "",
  sort: defaultSort,

  selectedOperation: null,

  createDialogOpen: false,
  editDialogOpen: false,
  deleteDialogOpen: false,
  membersDialogOpen: false,

  setSearch: (search) => set({ search }),
  setSort: (sort) => set({ sort }),

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
