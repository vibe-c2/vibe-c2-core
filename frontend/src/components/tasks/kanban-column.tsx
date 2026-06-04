import { useCallback, useMemo } from "react"
import { useDroppable } from "@dnd-kit/core"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { stageLabel } from "@/components/tasks/task-badge-tokens"
import { TaskCard } from "@/components/tasks/task-card"
import { TaskCardContextMenu } from "@/components/tasks/task-card-context-menu"
import { VirtualTaskList } from "@/components/tasks/virtual-task-list"
import { doneDateGroup } from "@/components/tasks/done-date-groups"
import { useInfiniteTasks } from "@/graphql/hooks/tasks"
import { useTaskStore } from "@/stores/tasks"
import type { TaskFieldsFragment, TaskStage } from "@/graphql/gql/graphql"

interface KanbanColumnProps {
  operationId: string
  stage: TaskStage
  search: string
}

// Each column owns its own paginated query and renders through the shared
// VirtualTaskList so only the cards in view are mounted. The column header
// shows totalCount from the server (independent of the loaded page count)
// so operators see the real column size even while the tail is still
// fetching.
//
// The whole column body is the droppable target so cards can be dropped
// onto empty columns; individual cards inside are draggables but not
// droppables (reordering within a column is server-sorted — createAt for
// the open stages, doneAt for DONE).
export function KanbanColumn({
  operationId,
  stage,
  search,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage:${stage}`,
    data: { stage },
  })
  const openEditDialog = useTaskStore((s) => s.openEditDialog)
  const openCreateDialog = useTaskStore((s) => s.openCreateDialog)

  // The DONE column has no quick-create button: tasks reach DONE through a
  // stage transition that forces a terminal status (SUCCESS / FAIL), and a
  // freshly-created task has none. Creating directly into DONE would either
  // skip that invariant or require an extra prompt, so we don't offer it.
  const canQuickCreate = stage !== "DONE"

  // The DONE column is sorted by completion time, so we slice it into
  // recency buckets (Today / Yesterday / 2–7 days ago / older calendar
  // dates) with section headers. Other stages render a flat list. The
  // grouper is memoized so VirtualTaskList's row-flattening only recomputes
  // when the task set changes, not on every render.
  const groupOf = useCallback(
    (task: TaskFieldsFragment) => doneDateGroup(task.doneAt),
    [],
  )

  const query = useInfiniteTasks({
    operationId,
    stage,
    search: search.trim() || null,
    first: 30,
  })

  const tasks = useMemo<TaskFieldsFragment[]>(
    () => query.data?.pages.flatMap((p) => p.tasks.edges.map((e) => e.node)) ?? [],
    [query.data],
  )

  // Server-side total — stable across pages, drives the column count
  // badge and also feeds the page-level "empty board" detection.
  const total = query.data?.pages[0]?.tasks.totalCount ?? 0

  // Equal-share columns: flex-1 (flex-basis: 0) means each column takes
  // an equal slice of the board's width. min-w-[280px] is the readable
  // floor — when the viewport can't fit four columns at that width, the
  // board's overflow-x-auto kicks in and provides a horizontal scrollbar
  // instead of squeezing cards into illegible slivers.
  return (
    <div className="flex h-full min-w-[280px] flex-1 basis-0 flex-col rounded-lg border bg-card/40">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{stageLabel(stage)}</h3>
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono tabular-nums text-muted-foreground">
            {total}
          </span>
        </div>
        {canQuickCreate && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground hover:text-foreground"
            onClick={() => openCreateDialog(stage)}
            aria-label={`Create task in ${stageLabel(stage)}`}
            title={`Create task in ${stageLabel(stage)}`}
          >
            <PlusIcon className="size-4" />
          </Button>
        )}
      </header>
      <VirtualTaskList
        ref={setNodeRef}
        tasks={tasks}
        renderItem={(t) => (
          <TaskCardContextMenu task={t}>
            <TaskCard
              task={t}
              onClick={() => openEditDialog({ id: t.id, name: t.name })}
            />
          </TaskCardContextMenu>
        )}
        hasNextPage={!!query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        isLoading={query.isLoading}
        fetchNextPage={query.fetchNextPage}
        emptyMessage="Drop a task here"
        isOver={isOver}
        groupOf={stage === "DONE" ? groupOf : undefined}
        renderGroupHeader={
          stage === "DONE" ? renderDoneGroupHeader : undefined
        }
      />
    </div>
  )
}

// Section divider for the DONE column's recency buckets. A thin centered
// rule with a centered pill label so it reads as a separator rather than
// another card. Module-scope so its identity stays stable across renders.
function renderDoneGroupHeader(label: string) {
  return (
    <div className="flex items-center gap-2 px-1 pb-1 pt-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
