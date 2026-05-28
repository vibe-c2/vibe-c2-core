import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { TaskStage } from "@/graphql/gql/graphql"

/**
 * UI-only state for the Tasks page.
 *
 * Server state lives in TanStack Query; this store only tracks transient UI:
 * the active view (kanban vs matrix), which task is selected, which dialogs
 * are open, and the in-flight stage transition that triggered the
 * status-required modal.
 *
 * Persisted slice (deliberately narrow):
 *   - viewMode: operators usually have a preferred lens; remember it across
 *     reloads so the page lands where they left it.
 *
 * Nothing else is persisted — search input, selected task, and dialog state
 * are session-scoped.
 */
export type TaskViewMode = "kanban" | "matrix"

export interface TaskFilters {
  search: string
}

interface SelectedTask {
  id: string
  name: string
}

// PendingStageChange captures a kanban drop that landed in DONE without a
// chosen terminal status. The status-required modal reads from this and
// commits the move with SUCCESS or FAIL once the operator picks.
export interface PendingStageChange {
  taskId: string
  taskName: string
  newStage: TaskStage
}

// PendingReopen captures a kanban drop that pulled a task OUT of DONE while
// it still carried a terminal status (SUCCESS / FAIL). The reopen-confirm
// modal asks the operator whether the outcome should be cleared, then
// commits the move with status=UNDEFINED. Cancel = no change.
export interface PendingReopen {
  taskId: string
  taskName: string
  newStage: TaskStage
}

interface TaskStoreState {
  filters: TaskFilters
  viewMode: TaskViewMode
  matrixIncludeBacklog: boolean

  selected: SelectedTask | null
  createDialogOpen: boolean
  editDialogOpen: boolean
  deleteDialogOpen: boolean

  pendingStageChange: PendingStageChange | null
  pendingReopen: PendingReopen | null

  setSearch: (search: string) => void
  resetFilters: () => void
  setViewMode: (mode: TaskViewMode) => void
  setMatrixIncludeBacklog: (include: boolean) => void

  openCreateDialog: () => void
  openEditDialog: (t: SelectedTask) => void
  openDeleteDialog: (t: SelectedTask) => void
  closeCreateDialog: () => void
  closeEditDialog: () => void
  closeDeleteDialog: () => void

  openStatusRequiredModal: (change: PendingStageChange) => void
  closeStatusRequiredModal: () => void

  openReopenModal: (change: PendingReopen) => void
  closeReopenModal: () => void
}

const defaultFilters: TaskFilters = {
  search: "",
}

export const useTaskStore = create<TaskStoreState>()(
  persist(
    (set) => ({
      filters: defaultFilters,
      viewMode: "kanban",
      matrixIncludeBacklog: false,

      selected: null,
      createDialogOpen: false,
      editDialogOpen: false,
      deleteDialogOpen: false,
      pendingStageChange: null,
      pendingReopen: null,

      setSearch: (search) =>
        set((s) => ({ filters: { ...s.filters, search } })),
      resetFilters: () => set({ filters: defaultFilters }),
      setViewMode: (viewMode) => set({ viewMode }),
      setMatrixIncludeBacklog: (matrixIncludeBacklog) =>
        set({ matrixIncludeBacklog }),

      openCreateDialog: () => set({ createDialogOpen: true }),
      openEditDialog: (t) => set({ editDialogOpen: true, selected: t }),
      openDeleteDialog: (t) => set({ deleteDialogOpen: true, selected: t }),
      // Edit dialog is the outermost surface for an existing task (it replaced
      // the read-only details panel), so closing it clears `selected`. Delete
      // dialog opens on top of edit; its close keeps `selected` intact so the
      // edit dialog underneath stays bound to the same task.
      closeCreateDialog: () => set({ createDialogOpen: false }),
      closeEditDialog: () => set({ editDialogOpen: false, selected: null }),
      closeDeleteDialog: () => set({ deleteDialogOpen: false }),

      openStatusRequiredModal: (change) =>
        set({ pendingStageChange: change }),
      closeStatusRequiredModal: () => set({ pendingStageChange: null }),

      openReopenModal: (change) => set({ pendingReopen: change }),
      closeReopenModal: () => set({ pendingReopen: null }),
    }),
    {
      name: "vibe-c2:tasks",
      storage: createJSONStorage(() => localStorage),
      // Only the view mode is worth carrying across reloads. Filters are
      // session-scoped (you don't want yesterday's search blocking today's
      // board) and dialog state is transient by definition.
      partialize: (state) => ({
        viewMode: state.viewMode,
        matrixIncludeBacklog: state.matrixIncludeBacklog,
      }),
      merge: (persisted, current) => {
        const p = persisted as
          | { viewMode?: TaskViewMode; matrixIncludeBacklog?: boolean }
          | undefined
        return {
          ...current,
          viewMode: p?.viewMode ?? current.viewMode,
          matrixIncludeBacklog:
            p?.matrixIncludeBacklog ?? current.matrixIncludeBacklog,
        }
      },
    },
  ),
)
