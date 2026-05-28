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
import { toast } from "sonner"
import { KanbanColumn } from "@/components/tasks/kanban-column"
import { TaskCard } from "@/components/tasks/task-card"
import { useChangeTaskStage } from "@/graphql/hooks/tasks"
import { useTaskStore } from "@/stores/tasks"
import type { TaskFieldsFragment, TaskStage } from "@/graphql/gql/graphql"

// Stage column order from left to right. Mirrors the natural workflow
// progression; the matrix view does not depend on this list.
const STAGES: TaskStage[] = ["BACKLOG", "TODO", "IN_PROCESS", "DONE"]

interface KanbanBoardProps {
  tasks: TaskFieldsFragment[]
}

export function KanbanBoard({ tasks }: KanbanBoardProps) {
  // PointerSensor with an 8px activation threshold so plain clicks open the
  // details dialog (handled by TaskCard's onClick) without DnD swallowing
  // them. Drags only start once the operator clearly intends to move.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const changeStage = useChangeTaskStage()
  const openStatusRequiredModal = useTaskStore(
    (s) => s.openStatusRequiredModal,
  )
  const openReopenModal = useTaskStore((s) => s.openReopenModal)

  const [activeId, setActiveId] = useState<string | null>(null)
  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeId) ?? null,
    [tasks, activeId],
  )

  // Group tasks by stage for the columns. Server already returns them
  // sorted by createAt DESC, so we just bucket without re-sorting.
  const byStage = useMemo(() => {
    const groups: Record<TaskStage, TaskFieldsFragment[]> = {
      BACKLOG: [],
      TODO: [],
      IN_PROCESS: [],
      DONE: [],
    }
    for (const t of tasks) groups[t.stage].push(t)
    return groups
  }, [tasks])

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

    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.stage === targetStage) return

    // Moving INTO Done without a terminal status: hand off to the
    // status-required modal. The modal calls changeTaskStage itself once
    // the operator picks SUCCESS or FAIL; cancelling rolls back via the
    // standard list invalidation.
    if (targetStage === "DONE" && task.status === "UNDEFINED") {
      openStatusRequiredModal({
        taskId,
        taskName: task.name,
        newStage: targetStage,
      })
      return
    }

    // Moving OUT of Done while the task still carries a terminal outcome
    // (SUCCESS / FAIL) is almost always a re-open. Confirm with the operator
    // before silently dragging a "done & succeeded" card into an in-progress
    // column where the green badge would look like a stale label.
    if (
      task.stage === "DONE" &&
      targetStage !== "DONE" &&
      task.status !== "UNDEFINED"
    ) {
      openReopenModal({
        taskId,
        taskName: task.name,
        newStage: targetStage,
      })
      return
    }

    try {
      await changeStage.mutateAsync({
        taskId,
        stage: targetStage,
        // Preserve the existing status for non-DONE moves. The server
        // accepts the same status echo; the resolver no-ops when the
        // value didn't change.
        status: task.status,
      })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to move task",
      )
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-1 gap-1 overflow-x-auto p-1">
        {STAGES.map((stage) => (
          <KanbanColumn key={stage} stage={stage} tasks={byStage[stage]} />
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
