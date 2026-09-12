import { BotIcon } from "lucide-react"
import {
  VirtualizedDataTable,
  dataTableRowClass,
} from "@/components/ui/virtualized-data-table"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { OutcomeIcon } from "@/components/agent-activity/outcome-icon"
import { cn } from "@/lib/utils"
import type { AgentActionFieldsFragment } from "@/graphql/gql/graphql"

interface AgentActionsTableProps {
  actions: AgentActionFieldsFragment[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
}

// tool · agent · operation · outcome · duration · when
const GRID_COLS = "grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_70px_150px]"

/**
 * The audit feed as a standard entity table, so it scrolls, paginates and
 * loads like every other list in the app.
 *
 * No sortable headers: an audit trail is only ever read newest-first, and
 * offering to reorder it would imply the server can, which it deliberately
 * cannot — the cursor is keyed on occurred_at.
 */
export function AgentActionsTable({
  actions,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
}: AgentActionsTableProps) {
  return (
    <VirtualizedDataTable
      items={actions}
      isLoading={isLoading}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      gridCols={GRID_COLS}
      entityNoun="activity"
      header={
        <>
          <div>Tool</div>
          <div>Agent</div>
          <div>Operation</div>
          <div>Outcome</div>
          <div className="text-right">Took</div>
          <div>When</div>
        </>
      }
      emptyState={
        <>
          <BotIcon className="size-8 opacity-50" />
          <p className="text-sm">No agent activity yet.</p>
        </>
      }
      renderRow={(action) => (
        <div className={dataTableRowClass(GRID_COLS)}>
          <div className="flex min-w-0 items-center gap-2">
            <OutcomeIcon outcome={action.outcome} write={action.write} />
            <span className="truncate font-mono text-xs">{action.tool}</span>
            {action.write && (
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                write
              </span>
            )}
          </div>

          <div className="truncate text-sm text-muted-foreground">
            {action.agentName}
          </div>

          {/* The feed spans operations, so each row says which one. Blank for
              calls that are not operation-scoped, like list_operations. */}
          <div className="truncate text-sm text-muted-foreground">
            {action.operation?.name ?? (
              <span className="text-muted-foreground/50">—</span>
            )}
          </div>

          <div className="min-w-0 truncate text-sm">
            {action.error ? (
              <span
                className={cn(
                  action.outcome === "REFUSED"
                    ? "text-amber-700 dark:text-amber-500"
                    : "text-destructive",
                )}
                title={action.error}
              >
                {action.error}
              </span>
            ) : (
              <span className="text-muted-foreground/50">ok</span>
            )}
          </div>

          <div className="text-right text-xs text-muted-foreground tabular-nums">
            {action.durationMs} ms
          </div>

          <div className="truncate text-sm text-muted-foreground">
            <FormattedDateTimeText date={action.occurredAt} />
          </div>
        </div>
      )}
    />
  )
}
