import { useMemo, useState } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { useQueryClient } from "@tanstack/react-query"
import { KanbanColumn } from "@/components/tasks/kanban-column"
import { TaskCard } from "@/components/tasks/task-card"
import { taskKeys } from "@/graphql/hooks/tasks"
import {
  ALL_STAGES,
  useTaskStageTransition,
} from "@/components/tasks/use-task-stage-transition"
import type { TaskFieldsFragment, TaskStage } from "@/graphql/gql/graphql"

// Stage column order from left to right. Mirrors the natural workflow
// progression; the matrix view does not depend on this list.
const STAGES: TaskStage[] = ALL_STAGES

interface KanbanBoardProps {
  operationId: string
  search: string
}

export function KanbanBoard({ operationId, search }: KanbanBoardProps) {
  // PointerSensor with an 8px activation threshold so plain clicks open the
  // details dialog (handled by TaskCard's onClick) without DnD swallowing
  // them. Drags only start once the operator clearly intends to move.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const queryClient = useQueryClient()
  const { requestStageChange } = useTaskStageTransition()

  const [activeId, setActiveId] = useState<string | null>(null)

  // To render the DragOverlay we need the active task. Each column owns
  // its own cache entry, so we scan every infinite-list cache entry for
  // a matching id rather than holding a centralized list. This stays
  // cheap because each cache slice is a column's pages; the early return
  // on first hit keeps the loop short in practice.
  const activeTask = useMemo<TaskFieldsFragment | null>(
    () => (activeId ? findTaskInCache(queryClient, activeId) : null),
    [activeId, queryClient],
  )

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    if (!e.over) return

    const taskId = String(e.active.id)
    const targetStage = (e.over.data.current?.stage ?? null) as
      | TaskStage
      | null
    if (!targetStage) return

    // We just had the active task in hand for the overlay; reuse the
    // same lookup to learn its current stage + status without forcing
    // every consumer to thread a `tasks` prop.
    const task = findTaskInCache(queryClient, taskId)
    if (!task) return

    // All the DONE-requires-status / reopen-confirm decisioning lives in the
    // shared transition hook so the drag-drop and edit-dialog paths stay in
    // lockstep.
    await requestStageChange(task, targetStage)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-1 gap-1 overflow-x-auto p-1">
        {STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            operationId={operationId}
            stage={stage}
            search={search}
          />
        ))}
      </div>

      {/* DragOverlay renders a portaled copy of the card under the cursor
          so the original keeps its slot reserved while dragging. Without
          this, dropping back into the same column would feel jumpy.
          dropAnimation is disabled because the default would animate the
          overlay back to the source card's old slot before the refetch
          moves it, producing a "snap back then teleport" effect. */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? <TaskCard task={activeTask} draggable={false} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

// findTaskInCache scans every cached task-list entry for a task by id.
// Returns null when no cache slice contains the task — happens briefly
// during invalidation flushes; the caller treats that as a no-op move.
function findTaskInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  taskId: string,
): TaskFieldsFragment | null {
  const entries = queryClient.getQueriesData<{
    pages: Array<{ tasks: { edges: Array<{ node: TaskFieldsFragment }> } }>
  }>({ queryKey: taskKeys.lists() })
  for (const [, data] of entries) {
    if (!data) continue
    for (const page of data.pages) {
      const found = page.tasks.edges.find((e) => e.node.id === taskId)
      if (found) return found.node
    }
  }
  return null
}
