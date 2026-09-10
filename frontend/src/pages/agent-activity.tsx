import { useMemo } from "react"
import { BotIcon } from "lucide-react"
import { usePageMetadata } from "@/hooks/use-page-metadata"
import { useConnectionNodes } from "@/hooks/use-connection-nodes"
import {
  useInfiniteAgentActions,
  useMyAgentActionSubscription,
  useMyAgentActivitySummary,
} from "@/graphql/hooks/agent-actions"
import { outcomesFor, useAgentActionStore } from "@/stores/agent-actions"
import { AgentActivityToolbar } from "@/components/agent-activity/agent-activity-toolbar"
import { AgentActionsTable } from "@/components/agent-activity/agent-actions-table"

/**
 * What the operator's own agents have been doing — across every operation they
 * touched.
 *
 * Deliberately a personal page rather than an operation one. You delegate to a
 * key, not to an engagement, and a key can reach several; making an operator
 * visit each operation in turn to find out what they had authorized would be
 * the opposite of an audit. Operation is a filter here, not the frame.
 *
 * It needs no scoped operation to be useful, which is why it lives in the user
 * menu beside sessions and keys rather than in the operation navigation.
 */
export function AgentActivityPage() {
  usePageMetadata({
    title: "Agent activity",
    icon: { kind: "lucide", component: BotIcon },
  })

  // Live updates: an agent working while this page is open should appear
  // without a reload, the same way the users and operations tables behave.
  useMyAgentActionSubscription()

  const agentKeyId = useAgentActionStore((s) => s.agentKeyId)
  const operationId = useAgentActionStore((s) => s.operationId)
  const writesOnly = useAgentActionStore((s) => s.writesOnly)
  const refusedOnly = useAgentActionStore((s) => s.refusedOnly)

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteAgentActions({
      agentKeyId,
      operationId,
      writesOnly: writesOnly || null,
      outcomes: outcomesFor(refusedOnly),
    })

  const actions = useConnectionNodes(data, (p) => p.myAgentActions)
  const totalCount = data?.pages[0]?.myAgentActions.totalCount ?? 0

  const summary = useMyAgentActivitySummary()
  const agents = summary.data?.myAgentActivitySummary ?? []

  // Operations are derived from what has loaded rather than fetched: the only
  // ones worth filtering by are the ones an agent has actually touched.
  const operations = useMemo(() => {
    const seen = new Map<string, string>()
    for (const action of actions) {
      if (action.operation) seen.set(action.operation.id, action.operation.name)
    }
    return [...seen].map(([id, name]) => ({ id, name }))
  }, [actions])

  return (
    <div className="flex flex-1 flex-col gap-2 p-2">
      <AgentActivityToolbar
        agents={agents}
        operations={operations}
        totalCount={totalCount}
      />
      <AgentActionsTable
        actions={actions}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={!!hasNextPage}
        fetchNextPage={fetchNextPage}
      />
    </div>
  )
}
