import { BotIcon, PencilIcon, ShieldOffIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { cn } from "@/lib/utils"
import { useAgentActionStore } from "@/stores/agent-actions"
import type { MyAgentActivitySummaryQuery } from "@/graphql/gql/graphql"

type AgentSummary = MyAgentActivitySummaryQuery["myAgentActivitySummary"][number]

interface AgentActivityToolbarProps {
  agents: AgentSummary[]
  // Derived from the rows on screen: the only operations worth offering are
  // the ones an agent has actually touched.
  operations: { id: string; name: string }[]
  totalCount: number
}

/**
 * Filters, plus the agents that have actually done something.
 *
 * The two toggles are the two questions an operator asks. "Changes only"
 * answers what an agent did to their engagements. "Refused" answers where one
 * hit the edge of its key — usually meaning the key is scoped tighter than the
 * work, which is a configuration answer rather than a fault.
 */
export function AgentActivityToolbar({
  agents,
  operations,
  totalCount,
}: AgentActivityToolbarProps) {
  const {
    agentKeyId,
    operationId,
    writesOnly,
    refusedOnly,
    setAgentKeyId,
    setOperationId,
    toggleWritesOnly,
    toggleRefusedOnly,
    clearFilters,
  } = useAgentActionStore()

  const filtered = !!agentKeyId || !!operationId || writesOnly || refusedOnly

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={writesOnly ? "default" : "outline"}
          onClick={toggleWritesOnly}
        >
          <PencilIcon className="size-3.5" />
          Changes only
        </Button>
        <Button
          size="sm"
          variant={refusedOnly ? "default" : "outline"}
          onClick={toggleRefusedOnly}
        >
          <ShieldOffIcon className="size-3.5" />
          Refused
        </Button>

        {operations.length > 1 &&
          operations.map((op) => (
            <Button
              key={op.id}
              size="sm"
              variant={operationId === op.id ? "default" : "outline"}
              className="max-w-48 truncate"
              onClick={() => setOperationId(operationId === op.id ? null : op.id)}
            >
              {op.name}
            </Button>
          ))}

        {filtered && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            Clear
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {totalCount} {totalCount === 1 ? "call" : "calls"}
        </span>
      </div>

      {agents.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {agents.map((agent) => {
            const active = agentKeyId === agent.agentKeyId
            return (
              <button
                key={agent.agentKeyId}
                type="button"
                onClick={() =>
                  setAgentKeyId(active ? null : agent.agentKeyId)
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
