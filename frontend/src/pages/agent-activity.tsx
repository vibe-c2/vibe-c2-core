import { useMemo, useState } from "react"
import { BotIcon } from "lucide-react"
import { usePageMetadata } from "@/hooks/use-page-metadata"
import {
  useMyAgentActions,
  useMyAgentActivitySummary,
  type AgentActionFilters,
} from "@/graphql/hooks/agent-actions"
import { AgentActivityToolbar } from "@/components/agent-activity/agent-activity-toolbar"
import { AgentActionList } from "@/components/agent-activity/agent-action-list"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * What the operator's own agents have been doing — across every operation they
 * touched.
 *
 * Deliberately a personal page rather than an operation one. You delegate to a
 * key, not to an engagement, and a key can reach several; making an operator
 * visit each operation in turn to find out what they had authorized would be
 * the opposite of an audit. Operation is a filter here, not the frame.
 *
 * It also needs no scoped operation to be useful, which is why it lives in the
 * user menu next to sessions and keys rather than in the operation navigation.
 */
export function AgentActivityPage() {
  usePageMetadata({
    title: "Agent activity",
    icon: { kind: "lucide", component: BotIcon },
  })

  const [filters, setFilters] = useState<AgentActionFilters>({})

  const summary = useMyAgentActivitySummary()
  const feed = useMyAgentActions(filters)

  const actions = useMemo(
    () => feed.data?.pages.flatMap((page) => page.myAgentActions) ?? [],
    [feed.data],
  )

  const agents = summary.data?.myAgentActivitySummary ?? []

  // Operations are derived from what is on screen rather than fetched: the
  // only ones worth filtering by are the ones an agent has actually touched.
  const operations = useMemo(() => {
    const seen = new Map<string, string>()
    for (const action of actions) {
      if (action.operation) seen.set(action.operation.id, action.operation.name)
    }
    return [...seen].map(([id, name]) => ({ id, name }))
  }, [actions])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b px-4 py-3">
        <h1 className="flex items-center gap-2 text-sm font-medium">
          <BotIcon className="size-4 text-muted-foreground" />
          Agent activity
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Every call your agents have made, across all your operations. Reads
          included — the operation timeline shows what they changed, this shows
          what they looked at.
        </p>
      </header>

      <AgentActivityToolbar
        agents={agents}
        operations={operations}
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
              !!filters.operationId ||
              !!filters.writesOnly ||
              !!filters.outcomes?.length
            }
          />
        )}
      </div>
    </div>
  )
}
