import { cn } from "@/lib/utils"
import {
  STAGE_CLASSNAME,
  STAGE_LABEL,
} from "@/components/tasks/task-badge-tokens"
import { ALL_STAGES } from "@/components/tasks/use-task-stage-transition"
import type { TaskStage } from "@/graphql/gql/graphql"

interface TaskStageControlProps {
  value: TaskStage
  onSelect: (stage: TaskStage) => void
  disabled?: boolean
}

// Segmented stage picker for the task edit dialog. Mirrors the kanban column
// order (Backlog → To do → In process → Done) so changing a stage here feels
// like sliding the card across the board. The active stage wears its board
// colour (STAGE_CLASSNAME); the rest stay neutral until hovered.
//
// Selecting the already-active stage is a no-op (the transition hook short
// -circuits equal stages), so clicks on the current stage cost nothing.
// Moving into / out of Done still routes through the shared transition hook's
// status-required and reopen modals — this control only emits the intent.
export function TaskStageControl({
  value,
  onSelect,
  disabled = false,
}: TaskStageControlProps) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">Stage</span>
      <div
        role="group"
        aria-label="Task stage"
        className="flex flex-wrap gap-1.5"
      >
        {ALL_STAGES.map((stage) => {
          const active = stage === value
          return (
            <button
              key={stage}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onSelect(stage)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? STAGE_CLASSNAME[stage]
                  : "border-border bg-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {STAGE_LABEL[stage]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
