import { type ReactNode } from "react"
import { ChevronRightIcon } from "lucide-react"
import { ScoreSwatch, TaskStageBadge, TaskStatusBadge } from "@/components/tasks/task-badges"
import { cn } from "@/lib/utils"
import type { TaskBacklinkFieldsFragment } from "@/graphql/gql/graphql"

interface TaskBacklinkListProps {
  tasks: readonly TaskBacklinkFieldsFragment[]
  // Click handler — the wrapper turns this into useTaskStore.openEditDialog
  // so the same edit dialog opens whether the click came from the kanban
  // board or a cross-domain backlink row.
  onTaskClick: (task: TaskBacklinkFieldsFragment) => void
  // Optional heading override — defaults to "Task backlinks". The credential
  // details dialog uses "Referenced by tasks" to disambiguate from the
  // doc → cred backlinks already shown above.
  title?: string
  // Mirrors BacklinkList: render the section even when empty (heading +
  // empty-state hint). The wiki editor footer keeps the hide-on-empty
  // behaviour since the section appears alongside doc backlinks.
  showWhenEmpty?: boolean
  // Cap height and scroll internally. Used in modals where vertical space
  // is constrained; the wiki editor footer leaves this off so the list
  // flows with the document.
  scrollable?: boolean
  isLoading?: boolean
  // Optional trailing slot in the section heading — used by the wiki editor
  // footer to render an "Add to task" trigger next to the count. Kept
  // generic (ReactNode) so other surfaces can wire any inline action
  // without forking the list component.
  headerAction?: ReactNode
}

/**
 * Renders a list of tasks that reference some source entity — used by both
 * the wiki editor footer (doc ← task) and the credential details dialog
 * (credential ← task). The row layout is tighter than the kanban card: stage
 * badge + name + score swatches + assignee initials, in one line that
 * collapses gracefully when the section sits in a narrow column.
 *
 * Click semantics match the credential pattern: the row is a `<button>`,
 * clicking opens the global EditTaskDialog (mounted in AppLayout) with this
 * task selected. No navigation — the operator stays on the source page.
 */
export function TaskBacklinkList({
  tasks,
  onTaskClick,
  title = "Task backlinks",
  showWhenEmpty = false,
  scrollable = false,
  isLoading = false,
  headerAction,
}: TaskBacklinkListProps) {
  if (isLoading && tasks.length === 0) return null
  // headerAction needs to surface even on an empty list — that's the whole
  // point of the wiki footer's "Add to task" trigger (an unlinked doc still
  // wants to offer the affordance). Treat presence of headerAction as an
  // implicit showWhenEmpty.
  if (tasks.length === 0 && !showWhenEmpty && !headerAction) return null

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
          <span className="ml-1.5 text-muted-foreground/70">{tasks.length}</span>
        </h3>
        {headerAction}
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tasks reference this yet.
        </p>
      ) : (
        <ul
          className={cn(
            "flex flex-col gap-0.5",
            scrollable && "max-h-60 overflow-y-auto pr-1",
          )}
        >
          {tasks.map((task) => (
            <li key={task.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onTaskClick(task)}
                className="group/row flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <TaskStageBadge stage={task.stage} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {task.name}
                </span>
                <TaskStatusBadge status={task.status} />
                {/* Score swatches collapse out of the way on narrow rows —
                    they're load-bearing on dense kanban cards but optional
                    in a backlink context where the title carries the meaning. */}
                <div className="hidden shrink-0 items-center gap-1 sm:flex">
                  <ScoreSwatch
                    kind="risk"
                    score={task.riskScore}
                    className="h-6 w-6 text-[10px]"
                  />
                  <ScoreSwatch
                    kind="profit"
                    score={task.profitScore}
                    className="h-6 w-6 text-[10px]"
                  />
                </div>
                {task.assignees.length > 0 && (
                  <span
                    className="hidden truncate text-xs text-muted-foreground sm:inline"
                    title={task.assignees.map((a) => a.username).join(", ")}
                  >
                    {task.assignees.length === 1
                      ? task.assignees[0].username
                      : `${task.assignees.length} assignees`}
                  </span>
                )}
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
