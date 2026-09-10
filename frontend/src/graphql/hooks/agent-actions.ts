import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import {
  MyAgentActionsDocument,
  MyAgentActivitySummaryDocument,
  type AgentActionOutcome,
} from "@/graphql/gql/graphql"

export const agentActionKeys = {
  all: ["agent-actions"] as const,
  list: (filters: AgentActionFilters) =>
    [...agentActionKeys.all, "list", filters] as const,
  summary: () => [...agentActionKeys.all, "summary"] as const,
}

export interface AgentActionFilters {
  agentKeyId?: string | null
  // Narrows an otherwise cross-operation feed. Not the frame: the trail
  // belongs to the operator, not to any one engagement.
  operationId?: string | null
  writesOnly?: boolean
  outcomes?: AgentActionOutcome[]
}

const PAGE_SIZE = 50

/**
 * Pages backwards through the caller's audit trail by timestamp rather than by
 * offset. The feed grows while it is being read — an agent adds rows faster
 * than an operator scrolls — and an offset would silently repeat or skip rows
 * as it shifted underneath them.
 */
export function useMyAgentActions(filters: AgentActionFilters) {
  return useInfiniteQuery({
    queryKey: agentActionKeys.list(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      graphqlClient(MyAgentActionsDocument, {
        agentKeyId: filters.agentKeyId ?? null,
        operationId: filters.operationId ?? null,
        writesOnly: filters.writesOnly ?? null,
        outcomes: filters.outcomes?.length ? filters.outcomes : null,
        before: pageParam,
        limit: PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => {
      const rows = lastPage.myAgentActions
      // A short page means the end; otherwise the oldest row's timestamp is
      // where the next page starts.
      if (rows.length < PAGE_SIZE) return null
      return rows[rows.length - 1].occurredAt
    },
  })
}

export function useMyAgentActivitySummary() {
  return useQuery({
    queryKey: agentActionKeys.summary(),
    queryFn: () => graphqlClient(MyAgentActivitySummaryDocument),
  })
}
