import { useDraggable } from "@dnd-kit/core"
import { FileTextIcon, KeyRoundIcon } from "lucide-react"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { TaskFieldsFragment } from "@/graphql/gql/graphql"
import {
  ScoreSwatch,
  TaskStatusBadge,
} from "@/components/tasks/task-badges"

// initials grabs the first 1–2 letters of a username for the avatar
// fallback. Keeps the avatar dense and legible without depending on user
// profile pictures (we don't have any).
function initials(username: string): string {
  const trimmed = username.trim()
  if (!trimmed) return "?"
  const parts = trimmed.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

const MAX_VISIBLE_ASSIGNEES = 3

interface TaskCardProps {
  task: TaskFieldsFragment
  // draggable is opt-out so the matrix-view can reuse the same card as a
  // static bubble without DnD overhead.
  draggable?: boolean
  onClick?: () => void
}

export function TaskCard({ task, draggable = true, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { stage: task.stage },
    disabled: !draggable,
  })

  // Intentionally NOT applying useDraggable's transform here: the source
  // card stays anchored in its column slot while the DragOverlay copy
  // follows the cursor. Applying transform to the source caused a
  // visible "snap back" on drop — the translated source would suddenly
  // jump back to its old slot for one frame before the cache-driven
  // re-render moved it to the new column.
  const style = undefined

  const visibleAssignees = task.assignees.slice(0, MAX_VISIBLE_ASSIGNEES)
  const overflow = task.assignees.length - visibleAssignees.length

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={onClick}
      // Listeners and attributes wire the drag handle to the whole card.
      // The button still calls onClick on plain pointer release because
      // dnd-kit suppresses the click when an actual drag occurred (it
      // distinguishes drag-vs-click via its activation distance).
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      className={cn(
        "group/task-card relative flex w-full flex-col gap-2 rounded-lg border bg-card p-3 text-left shadow-sm transition-colors hover:bg-accent/40",
        // While dragging, fade the source and disable pointer events so
        // hover styles don't stick to the original position.
        isDragging && "pointer-events-none opacity-50",
      )}
      data-task-id={task.id}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-medium leading-snug">
          {task.name}
        </span>
        <TaskStatusBadge status={task.status} />
      </div>

      {task.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {task.description}
        </p>
      )}

      {/* Bottom row anchors the score tiles to the right edge of the card,
          matching the create/edit modal selector aesthetic. Assignees and
          reference counters sit on the left so the row stays balanced
          when both are present. */}
      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {task.assignees.length > 0 && (
            <AvatarGroup>
              {visibleAssignees.map((u) => (
                <Avatar key={u.id} size="sm" title={u.username}>
                  <AvatarFallback>{initials(u.username)}</AvatarFallback>
                </Avatar>
              ))}
              {overflow > 0 && (
                <AvatarGroupCount>+{overflow}</AvatarGroupCount>
              )}
            </AvatarGroup>
          )}
          {task.wikiReferences.length > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground"
              title={`${task.wikiReferences.length} linked wiki document${task.wikiReferences.length === 1 ? "" : "s"}`}
            >
              <FileTextIcon className="size-3" />
              {task.wikiReferences.length}
            </span>
          )}
          {task.credentialReferences.length > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground"
              title={`${task.credentialReferences.length} linked credential${task.credentialReferences.length === 1 ? "" : "s"}`}
            >
              <KeyRoundIcon className="size-3" />
              {task.credentialReferences.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ScoreSwatch kind="risk" score={task.riskScore} />
          <ScoreSwatch kind="profit" score={task.profitScore} />
        </div>
      </div>
    </button>
  )
}
