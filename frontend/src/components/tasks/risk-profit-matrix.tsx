import { useMemo } from "react"
import { useTaskStore } from "@/stores/tasks"
import { cn } from "@/lib/utils"
import type { TaskFieldsFragment } from "@/graphql/gql/graphql"
import { TaskCard } from "@/components/tasks/task-card"
import { TaskCardContextMenu } from "@/components/tasks/task-card-context-menu"

// Quadrant layout (C2 vocabulary — profit = operational value, risk = burn /
// detection risk):
//
//   top-left:    high value, low  risk → "Low-Hanging Fruit"
//   top-right:   high value, high risk → "Crown Jewels"
//   bottom-left: low  value, low  risk → "Footholds"
//   bottom-right:low  value, high risk → "Burn Risks"
//
// Threshold is hardcoded at 5/5 (scores < 5 are "low", scores ≥ 5 are
// "high"). Per the plan: configurable per-operation could land later if
// teams have different risk appetites; v1 is hardcoded.
const QUADRANTS = [
  {
    key: "low-hanging-fruit" as const,
    title: "Low-Hanging Fruit",
    subtitle: "Low risk, high value",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "crown-jewels" as const,
    title: "Crown Jewels",
    subtitle: "High risk, high value",
    accent: "text-amber-600 dark:text-amber-400",
  },
  {
    key: "footholds" as const,
    title: "Footholds",
    subtitle: "Low risk, low value",
    accent: "text-muted-foreground",
  },
  {
    key: "burn-risks" as const,
    title: "Burn Risks",
    subtitle: "High risk, low value",
    accent: "text-rose-600 dark:text-rose-400",
  },
] as const

type QuadrantKey = (typeof QUADRANTS)[number]["key"]

function quadrantFor(task: TaskFieldsFragment): QuadrantKey {
  const highProfit = task.profitScore >= 5
  const highRisk = task.riskScore >= 5
  if (highProfit && !highRisk) return "low-hanging-fruit"
  if (highProfit && highRisk) return "crown-jewels"
  if (!highProfit && !highRisk) return "footholds"
  return "burn-risks"
}

interface RiskProfitMatrixProps {
  tasks: TaskFieldsFragment[]
  includeBacklog?: boolean
}

export function RiskProfitMatrix({
  tasks,
  includeBacklog = false,
}: RiskProfitMatrixProps) {
  const openEditDialog = useTaskStore((s) => s.openEditDialog)

  // Done tasks are excluded from the matrix — once shipped, they're no
  // longer something to weigh against open options. Kanban still shows the
  // Done column for history. Backlog is excluded by default so the matrix
  // focuses on committed work; the page header switch flips it on for
  // operators weighing the full pipeline.
  const grouped = useMemo(() => {
    const groups: Record<QuadrantKey, TaskFieldsFragment[]> = {
      "low-hanging-fruit": [],
      "crown-jewels": [],
      "footholds": [],
      "burn-risks": [],
    }
    for (const t of tasks) {
      if (t.stage === "DONE") continue
      if (!includeBacklog && t.stage === "BACKLOG") continue
      groups[quadrantFor(t)].push(t)
    }
    return groups
  }, [tasks, includeBacklog])

  return (
    <div className="flex flex-1 flex-col gap-2 p-1 min-h-0">
      <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-2 min-h-0">
        {QUADRANTS.map((q) => (
          <Quadrant
            key={q.key}
            title={q.title}
            subtitle={q.subtitle}
            accent={q.accent}
            count={grouped[q.key].length}
          >
            {grouped[q.key].length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                No tasks
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {grouped[q.key].map((t) => (
                  <TaskCardContextMenu key={t.id} task={t}>
                    <TaskCard
                      task={t}
                      draggable={false}
                      onClick={() =>
                        openEditDialog({ id: t.id, name: t.name })
                      }
                    />
                  </TaskCardContextMenu>
                ))}
              </div>
            )}
          </Quadrant>
        ))}
      </div>
    </div>
  )
}

function Quadrant({
  title,
  subtitle,
  accent,
  count,
  children,
}: {
  title: string
  subtitle: string
  accent: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card/40">
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div>
          <div className={cn("text-sm font-semibold", accent)}>{title}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {subtitle}
          </div>
        </div>
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono tabular-nums text-muted-foreground">
          {count}
        </span>
      </header>
      <div className="flex-1 overflow-y-auto p-2">{children}</div>
    </div>
  )
}
