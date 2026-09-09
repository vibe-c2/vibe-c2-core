import { useMemo, useState } from "react"
import { Navigate } from "react-router"
import { BotIcon } from "lucide-react"
import { useScopedOperation } from "@/hooks/use-scoped-operation"
import { usePageMetadata } from "@/hooks/use-page-metadata"
import {
  useAgentActions,
  useAgentActivitySummary,
  type AgentActionFilters,
} from "@/graphql/hooks/agent-actions"
import { AgentActivityToolbar } from "@/components/agent-activity/agent-activity-toolbar"
import { AgentActionList } from "@/components/agent-activity/agent-action-list"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * What the agents connected to this operation have actually been doing.
 *
 * The timeline shows what changed. This shows every call, reads included —
 * which is the only place an agent reading the whole credential set leaves a
 * trace, because reading changes nothing. Without this page that record exists
 * but is reachable only from a database shell.
 */
export function AgentActivityPage() {
  const scopedOperation = useScopedOperation()

  usePageMetadata({
    title: "Agent activity",
    icon: { kind: "lucide", component: BotIcon },
  })

  if (!scopedOperation) {
    return <Navigate to="/operations" replace />
  }

  return <AgentActivityPageInner operationId={scopedOperation.id} />
}

function AgentActivityPageInner({ operationId }: { operationId: string }) {
  const [filters, setFilters] = useState<AgentActionFilters>({})

  const summary = useAgentActivitySummary(operationId)
  const feed = useAgentActions(operationId, filters)

  const actions = useMemo(
    () => feed.data?.pages.flatMap((page) => page.agentActions) ?? [],
    [feed.data],
  )

  const agents = summary.data?.agentActivitySummary ?? []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AgentActivityToolbar
        agents={agents}
        filters={filters}
        onFiltersChange={setFilters}
        totalShown={actions.length}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {feed.isLoading ? (
          <div className="space-y-2 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <AgentActionList
            actions={actions}
            hasMore={!!feed.hasNextPage}
            loadingMore={feed.isFetchingNextPage}
            onLoadMore={() => feed.fetchNextPage()}
            filtered={
              !!filters.agentKeyId ||
              !!filters.writesOnly ||
              !!filters.outcomes?.length
            }
          />
        )}
      </div>
    </div>
  )
}
