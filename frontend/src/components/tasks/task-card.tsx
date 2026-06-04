import { useDraggable } from "@dnd-kit/core"
import {
  CheckCircle2Icon,
  ClockIcon,
  FileTextIcon,
  KeyRoundIcon,
} from "lucide-react"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { avatarLabel } from "@/lib/avatar-label"
import type { TaskFieldsFragment } from "@/graphql/gql/graphql"
import {
  ScoreSwatch,
  TaskStatusBadge,
} from "@/components/tasks/task-badges"

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

  // DONE cards lead with the completion summary (what actually happened)
  // instead of the planning description — on a board of finished work the
  // outcome is the line worth scanning. Every other stage shows the
  // description. A DONE task always carries a summary (required to complete),
  // so the fallback only matters for legacy rows completed before summaries
  // existed.
  const cardBody =
    task.stage === "DONE" ? task.summary || task.description : task.description

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

      {cardBody && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {cardBody}
        </p>
      )}


      {/* Bottom row anchors the score tiles to the right edge of the card,
          matching the create/edit modal selector aesthetic. Assignees and
          reference counters sit on the left so the row stays balanced
          when both are present. */}
      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          {/* One timestamp chip per card, leading the bottom row. DONE
              cards show their completion time (the milestone that
              matters for review); every other stage shows the creation
              time (the only meaningful "when" before the work lands). */}
          {task.stage === "DONE" && task.doneAt ? (
            <TimestampChip
              icon={<CheckCircle2Icon className="size-3" />}
              label="Completed"
              isoTimestamp={task.doneAt}
            />
          ) : (
            <TimestampChip
              icon={<ClockIcon className="size-3" />}
              label="Created"
              isoTimestamp={task.createdAt}
            />
          )}
          {task.assignees.length > 0 && (
            <AvatarGroup>
              {visibleAssignees.map((u) => (
                <Avatar key={u.id} size="sm" title={u.username}>
                  <AvatarFallback>{avatarLabel(u.username)}</AvatarFallback>
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

interface TimestampChipProps {
  icon: React.ReactNode
  label: string
  isoTimestamp: string
}

// TimestampChip renders one timestamp pair in the card meta row: an icon
// plus the formatted datetime in the app-wide format (FormattedDateTimeText
// — same component the users table and other surfaces use). The label
// ("Created" / "Completed") is surfaced on hover so the row stays tight.
// The trigger is a span so it can sit inline inside the parent <button>
// without nesting interactive elements.
function TimestampChip({ icon, label, isoTimestamp }: TimestampChipProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex items-center gap-1 cursor-default" />
        }
      >
        {icon}
        <FormattedDateTimeText
          date={isoTimestamp}
          className="tabular-nums"
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
