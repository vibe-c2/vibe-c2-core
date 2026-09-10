import { BotIcon, PencilIcon, ShieldOffIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { cn } from "@/lib/utils"
import type { AgentActionFilters } from "@/graphql/hooks/agent-actions"
import type { MyAgentActivitySummaryQuery } from "@/graphql/gql/graphql"

type AgentSummary = MyAgentActivitySummaryQuery["myAgentActivitySummary"][number]

interface AgentActivityToolbarProps {
  agents: AgentSummary[]
  // Derived from the rows on screen: the only operations worth offering are
  // the ones an agent has actually touched.
  operations: { id: string; name: string }[]
  filters: AgentActionFilters
  onFiltersChange: (next: AgentActionFilters) => void
  totalShown: number
}

/**
 * Filters, plus a row of the agents that have worked in this operation.
 *
 * The two toggles are the two questions an operator actually asks. "Changes
 * only" answers what did it do to my engagement. "Refused" answers where it
 * hit the edge of what its key allows — which usually means the key is scoped
 * tighter than the work being asked of it, and is a configuration answer
 * rather than a fault.
 */
export function AgentActivityToolbar({
  agents,
  operations,
  filters,
  onFiltersChange,
  totalShown,
}: AgentActivityToolbarProps) {
  const refusedOnly = filters.outcomes?.includes("REFUSED") ?? false

  return (
    <div className="space-y-3 border-b px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={filters.writesOnly ? "default" : "outline"}
          onClick={() =>
            onFiltersChange({ ...filters, writesOnly: !filters.writesOnly })
          }
        >
          <PencilIcon className="size-3.5" />
          Changes only
        </Button>
        <Button
          size="sm"
          variant={refusedOnly ? "default" : "outline"}
          onClick={() =>
            onFiltersChange({
              ...filters,
              outcomes: refusedOnly ? undefined : ["REFUSED"],
            })
          }
        >
          <ShieldOffIcon className="size-3.5" />
          Refused
        </Button>

        {(filters.agentKeyId || filters.operationId || filters.writesOnly || refusedOnly) && (
          <Button size="sm" variant="ghost" onClick={() => onFiltersChange({})}>
            Clear
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {totalShown} shown
        </span>
      </div>

      {operations.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Operation:</span>
          {operations.map((op) => {
            const active = filters.operationId === op.id
            return (
              <button
                key={op.id}
                type="button"
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    operationId: active ? null : op.id,
                  })
                }
                className={cn(
                  "max-w-48 truncate rounded-md border px-2 py-1 text-xs transition-colors",
                  active ? "border-primary bg-accent" : "hover:bg-accent/50",
                )}
              >
                {op.name}
              </button>
            )
          })}
        </div>
      )}

      {agents.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {agents.map((agent) => {
            const active = filters.agentKeyId === agent.agentKeyId
            return (
              <button
                key={agent.agentKeyId}
                type="button"
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    agentKeyId: active ? null : agent.agentKeyId,
                  })
                }
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                  active ? "border-primary bg-accent" : "hover:bg-accent/50",
                )}
              >
                <BotIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="max-w-48 truncate font-medium">
                  {agent.agentName}
                </span>
                <Badge variant="secondary">{agent.actions}</Badge>
                {/* An agent working in one operation is expected; the same key
                    active across several is worth an operator noticing. */}
                {agent.operations > 1 && (
                  <span className="text-muted-foreground">
                    {agent.operations} ops
                  </span>
                )}
                <span className="text-muted-foreground">
                  <FormattedDateTimeText date={agent.lastSeen} />
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
