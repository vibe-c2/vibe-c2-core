import { useDroppable } from "@dnd-kit/core"
import { cn } from "@/lib/utils"
import { stageLabel } from "@/components/tasks/task-badges"
import { TaskCard } from "@/components/tasks/task-card"
import { TaskCardContextMenu } from "@/components/tasks/task-card-context-menu"
import { useTaskStore } from "@/stores/tasks"
import type { TaskFieldsFragment, TaskStage } from "@/graphql/gql/graphql"

interface KanbanColumnProps {
  stage: TaskStage
  tasks: TaskFieldsFragment[]
}

// One column per stage. The whole column body is a droppable so cards can
// be dropped onto empty columns; individual cards inside are draggables
// but not droppables (reordering within a column is auto-sorted by
// createdAt, per the plan).
export function KanbanColumn({ stage, tasks }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage:${stage}`,
    data: { stage },
  })
  const openEditDialog = useTaskStore((s) => s.openEditDialog)

  // Equal-share columns: flex-1 (flex-basis: 0) means each column takes
  // an equal slice of the board's width. min-w-[280px] is the readable
  // floor — when the viewport can't fit four columns at that width, the
  // board's overflow-x-auto kicks in and provides a horizontal scrollbar
  // instead of squeezing cards into illegible slivers.
  return (
    <div className="flex h-full min-w-[280px] flex-1 basis-0 flex-col rounded-lg border bg-card/40">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-semibold">{stageLabel(stage)}</h3>
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono tabular-nums text-muted-foreground">
          {tasks.length}
        </span>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors",
          // Highlight the column body while a card is hovering over it so
          // the operator gets a clear drop target affordance.
          isOver && "bg-accent/40",
        )}
      >
        {tasks.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">
            Drop a task here
          </p>
        ) : (
          tasks.map((t) => (
            <TaskCardContextMenu key={t.id} task={t}>
              <TaskCard
                task={t}
                onClick={() =>
                  openEditDialog({ id: t.id, name: t.name })
                }
              />
            </TaskCardContextMenu>
          ))
        )}
      </div>
    </div>
  )
}
