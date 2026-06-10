import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import { useSubscription } from "@/hooks/use-subscription"
import type { CreateHostInput, UpdateHostInput } from "@/graphql/gql/graphql"
import {
  HostsDocument,
  CreateHostDocument,
  UpdateHostDocument,
  DeleteHostDocument,
  HostChangedDocument,
} from "@/graphql/gql/graphql"

export type HostListParams = {
  operationId: string
  search?: string | null
  first?: number
}

// Query key factory. Hosts read only through the infinite list — the edit
// dialog seeds from the clicked row's cached node, so there is no per-host
// detail cache to key. Mutations and the live subscription therefore just
// invalidate the list and let it refetch.
export const hostKeys = {
  all: ["hosts"] as const,
  lists: () => [...hostKeys.all, "list"] as const,
  infiniteList: (params: HostListParams) =>
    [...hostKeys.lists(), "infinite", params] as const,
}

// --- Queries ---

export function useInfiniteHosts(params: HostListParams) {
  return useInfiniteQuery({
    queryKey: hostKeys.infiniteList(params),
    queryFn: ({ pageParam }) =>
      graphqlClient(HostsDocument, {
        operationId: params.operationId,
        search: params.search ?? null,
        first: params.first ?? 20,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hosts.pageInfo.hasNextPage
        ? lastPage.hosts.pageInfo.endCursor ?? undefined
        : undefined,
    enabled: !!params.operationId,
  })
}

// --- Mutations ---

export function useCreateHost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { operationId: string; input: CreateHostInput }) =>
      graphqlClient(CreateHostDocument, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostKeys.lists() })
    },
  })
}

export function useUpdateHost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateHostInput }) =>
      graphqlClient(UpdateHostDocument, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostKeys.lists() })
    },
  })
}

export function useDeleteHost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => graphqlClient(DeleteHostDocument, { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostKeys.lists() })
    },
  })
}

// --- Subscriptions ---

// Keeps every operator's Hosts table live. Any create/update/delete can move a
// row in or out of the current search filter, so the list is blanket-
// invalidated and refetched. Hosts don't cross-link other entities, so there
// are no credential/wiki invalidations (unlike the hash subscription).
export function useHostChangedSubscription(operationId: string) {
  const queryClient = useQueryClient()

  useSubscription(
    HostChangedDocument,
    { operationId },
    {
      onData: () => {
        queryClient.invalidateQueries({ queryKey: hostKeys.lists() })
      },
      enabled: !!operationId,
    },
  )
}
