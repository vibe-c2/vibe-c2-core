import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import {
  AgentActionsDocument,
  AgentActivitySummaryDocument,
  type AgentActionOutcome,
} from "@/graphql/gql/graphql"

export const agentActionKeys = {
  all: ["agent-actions"] as const,
  list: (operationId: string, filters: AgentActionFilters) =>
    [...agentActionKeys.all, "list", operationId, filters] as const,
  summary: (operationId: string) =>
    [...agentActionKeys.all, "summary", operationId] as const,
}

export interface AgentActionFilters {
  agentKeyId?: string | null
  writesOnly?: boolean
  outcomes?: AgentActionOutcome[]
}

const PAGE_SIZE = 50

/**
 * Pages backwards through the audit trail by timestamp rather than by offset.
 * The feed grows while it is being read — an agent can add rows faster than
 * the operator scrolls — and an offset would silently repeat or skip rows as
 * it shifted underneath them.
 */
export function useAgentActions(
  operationId: string,
  filters: AgentActionFilters,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey: agentActionKeys.list(operationId, filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      graphqlClient(AgentActionsDocument, {
        operationId,
        agentKeyId: filters.agentKeyId ?? null,
        writesOnly: filters.writesOnly ?? null,
        outcomes: filters.outcomes?.length ? filters.outcomes : null,
        before: pageParam,
        limit: PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => {
      const rows = lastPage.agentActions
      // A short page means the end; anything else and the oldest row's
      // timestamp is where the next page starts.
      if (rows.length < PAGE_SIZE) return null
      return rows[rows.length - 1].occurredAt
    },
    enabled: !!operationId && (options?.enabled ?? true),
  })
}

export function useAgentActivitySummary(operationId: string) {
  return useQuery({
    queryKey: agentActionKeys.summary(operationId),
    queryFn: () => graphqlClient(AgentActivitySummaryDocument, { operationId }),
    enabled: !!operationId,
  })
}
