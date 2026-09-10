import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import { useSubscription } from "@/hooks/use-subscription"
import {
  MyAgentActionsDocument,
  MyAgentActivitySummaryDocument,
  MyAgentActionOccurredDocument,
  type AgentActionOutcome,
} from "@/graphql/gql/graphql"

export const agentActionKeys = {
  all: ["agent-actions"] as const,
  infiniteLists: () => [...agentActionKeys.all, "infinite-list"] as const,
  infiniteList: (params: AgentActionListParams) =>
    [...agentActionKeys.infiniteLists(), params] as const,
  summary: () => [...agentActionKeys.all, "summary"] as const,
}

export interface AgentActionListParams {
  agentKeyId?: string | null
  // Narrows an otherwise cross-operation feed. Not the frame: the trail
  // belongs to the operator, not to any one engagement.
  operationId?: string | null
  writesOnly?: boolean | null
  outcomes?: AgentActionOutcome[] | null
  first?: number
}

export function useInfiniteAgentActions(params: AgentActionListParams) {
  return useInfiniteQuery({
    queryKey: agentActionKeys.infiniteList(params),
    queryFn: ({ pageParam }) =>
      graphqlClient(MyAgentActionsDocument, {
        agentKeyId: params.agentKeyId ?? null,
        operationId: params.operationId ?? null,
        writesOnly: params.writesOnly ?? null,
        outcomes: params.outcomes?.length ? params.outcomes : null,
        first: params.first ?? 30,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.myAgentActions.pageInfo.hasNextPage
        ? lastPage.myAgentActions.pageInfo.endCursor ?? undefined
        : undefined,
  })
}

export function useMyAgentActivitySummary() {
  return useQuery({
    queryKey: agentActionKeys.summary(),
    queryFn: () => graphqlClient(MyAgentActivitySummaryDocument),
  })
}

/**
 * Keeps the activity page current while an agent is working.
 *
 * Invalidates rather than patching the cache. The event carries enough to
 * render a rail entry but not a full row — no id, no arguments, no duration —
 * and inventing a partial row that a refetch then replaces would make the list
 * flicker between two versions of the same entry.
 */
export function useMyAgentActionSubscription() {
  const queryClient = useQueryClient()

  useSubscription(MyAgentActionOccurredDocument, undefined, {
    onData: () => {
      queryClient.invalidateQueries({ queryKey: agentActionKeys.infiniteLists() })
      // The summary carries per-agent counts and last-seen, so it moves on
      // every call too.
      queryClient.invalidateQueries({ queryKey: agentActionKeys.summary() })
    },
  })
}
