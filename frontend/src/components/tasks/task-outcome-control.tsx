import { CheckCircle2Icon, XCircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { STATUS_LABEL } from "@/components/tasks/task-badge-tokens"
import type { TaskStatus } from "@/graphql/gql/graphql"

interface TaskOutcomeControlProps {
  value: TaskStatus
  onSelect: (status: TaskStatus) => void
  disabled?: boolean
}

// The two terminal outcomes an operator can switch between, in display order.
const OUTCOMES: { status: Exclude<TaskStatus, "UNDEFINED">; icon: typeof CheckCircle2Icon; hint: string }[] = [
  { status: "SUCCESS", icon: CheckCircle2Icon, hint: "Advanced the engagement" },
  { status: "FAIL", icon: XCircleIcon, hint: "Lead was a dead end" },
]

// Segmented Success/Fail picker for a task already in Done. Lets an operator
// correct the outcome of a closed task without reopening it — the outcome
// records what the engagement gained (a confirmed vulnerability is Success, a
// refuted one is Fail), which is easy to get wrong at close time and worth
// fixing in place afterwards.
//
// Selecting the current outcome is a no-op the parent ignores; the summary and
// completion time are untouched (the server keeps them on an intra-Done flip).
export function TaskOutcomeControl({
  value,
  onSelect,
  disabled = false,
}: TaskOutcomeControlProps) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">Outcome</span>
      <div role="group" aria-label="Task outcome" className="grid grid-cols-2 gap-1.5">
        {OUTCOMES.map(({ status, icon: Icon, hint }) => {
          const active = status === value
          const activeClass =
            status === "SUCCESS"
              ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          return (
            <button
              key={status}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onSelect(status)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? activeClass
                  : "border-border bg-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
              title={hint}
            >
              <Icon className="size-4" />
              {STATUS_LABEL[status]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
