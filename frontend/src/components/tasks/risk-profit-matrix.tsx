import { useMemo } from "react"
import { useConnectionNodes } from "@/hooks/use-connection-nodes"
import { useTaskStore } from "@/stores/tasks"
import { cn } from "@/lib/utils"
import type { TaskStage } from "@/graphql/gql/graphql"
import { TaskCard } from "@/components/tasks/task-card"
import { TaskCardContextMenu } from "@/components/tasks/task-card-context-menu"
import { VirtualTaskList } from "@/components/tasks/virtual-task-list"
import { useInfiniteTasks } from "@/graphql/hooks/tasks"

// Quadrant layout (C2 vocabulary — profit = operational value, risk = burn /
// detection risk):
//
//   top-left:    high value, low  risk → "Low-Hanging Fruit"
//   top-right:   high value, high risk → "Crown Jewels"
//   bottom-left: low  value, low  risk → "Footholds"
//   bottom-right:low  value, high risk → "Burn Risks"
//
// Threshold is hardcoded at 5 (scores < 5 are "low", scores ≥ 5 are "high"),
// mapped client-side to the server's inclusive score range filters. Per the
// plan: configurable per-operation could land later if teams have different
// risk appetites; v1 is hardcoded.
const LOW_MAX = 4
const HIGH_MIN = 5

interface QuadrantSpec {
  key: "low-hanging-fruit" | "crown-jewels" | "footholds" | "burn-risks"
  title: string
  subtitle: string
  accent: string
  // Inclusive bounds piped to the Tasks query.
  riskScoreMin: number | null
  riskScoreMax: number | null
  profitScoreMin: number | null
  profitScoreMax: number | null
}

const QUADRANTS: readonly QuadrantSpec[] = [
  {
    key: "low-hanging-fruit",
    title: "Low-Hanging Fruit",
    subtitle: "Low risk, high value",
    accent: "text-emerald-600 dark:text-emerald-400",
    riskScoreMin: null,
    riskScoreMax: LOW_MAX,
    profitScoreMin: HIGH_MIN,
    profitScoreMax: null,
  },
  {
    key: "crown-jewels",
    title: "Crown Jewels",
    subtitle: "High risk, high value",
    accent: "text-amber-600 dark:text-amber-400",
    riskScoreMin: HIGH_MIN,
    riskScoreMax: null,
    profitScoreMin: HIGH_MIN,
    profitScoreMax: null,
  },
  {
    key: "footholds",
    title: "Footholds",
    subtitle: "Low risk, low value",
    accent: "text-muted-foreground",
    riskScoreMin: null,
    riskScoreMax: LOW_MAX,
    profitScoreMin: null,
    profitScoreMax: LOW_MAX,
  },
  {
    key: "burn-risks",
    title: "Burn Risks",
    subtitle: "High risk, low value",
    accent: "text-rose-600 dark:text-rose-400",
    riskScoreMin: HIGH_MIN,
    riskScoreMax: null,
    profitScoreMin: null,
    profitScoreMax: LOW_MAX,
  },
] as const

interface RiskProfitMatrixProps {
  operationId: string
  search: string
  includeBacklog?: boolean
}

export function RiskProfitMatrix({
  operationId,
  search,
  includeBacklog = false,
}: RiskProfitMatrixProps) {
  // Done tasks are excluded from the matrix — once shipped, they're no
  // longer something to weigh against open options. Kanban still shows the
  // Done column for history. Backlog is excluded by default so the matrix
  // focuses on committed work; the page header switch flips it on for
  // operators weighing the full pipeline.
  const excludeStages = useMemo<TaskStage[]>(
    () =>
      includeBacklog ? (["DONE"] as TaskStage[]) : (["DONE", "BACKLOG"] as TaskStage[]),
    [includeBacklog],
  )

  return (
    <div className="flex flex-1 flex-col gap-2 p-1 min-h-0">
      <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-2 min-h-0">
        {QUADRANTS.map((q) => (
          <MatrixQuadrant
            key={q.key}
            spec={q}
            operationId={operationId}
            search={search}
            excludeStages={excludeStages}
          />
        ))}
      </div>
    </div>
  )
}

interface MatrixQuadrantProps {
  spec: QuadrantSpec
  operationId: string
  search: string
  excludeStages: TaskStage[]
}

function MatrixQuadrant({
  spec,
  operationId,
  search,
  excludeStages,
}: MatrixQuadrantProps) {
  const openEditDialog = useTaskStore((s) => s.openEditDialog)

  const query = useInfiniteTasks({
    operationId,
    excludeStages,
    riskScoreMin: spec.riskScoreMin,
    riskScoreMax: spec.riskScoreMax,
    profitScoreMin: spec.profitScoreMin,
    profitScoreMax: spec.profitScoreMax,
    search: search.trim() || null,
    first: 30,
  })

  const tasks = useConnectionNodes(query.data, (p) => p.tasks)

  const total = query.data?.pages[0]?.tasks.totalCount ?? 0

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card/40">
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div>
          <div className={cn("text-sm font-semibold", spec.accent)}>
            {spec.title}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {spec.subtitle}
          </div>
        </div>
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono tabular-nums text-muted-foreground">
          {total}
        </span>
      </header>
      <VirtualTaskList
        tasks={tasks}
        renderItem={(t) => (
          <TaskCardContextMenu task={t}>
            <TaskCard
              task={t}
              draggable={false}
              onClick={() => openEditDialog({ id: t.id, name: t.name })}
            />
          </TaskCardContextMenu>
        )}
        hasNextPage={!!query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        isLoading={query.isLoading}
        fetchNextPage={query.fetchNextPage}
        emptyMessage="No tasks"
        lanes={2}
      />
    </div>
  )
}
