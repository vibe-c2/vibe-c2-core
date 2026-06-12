import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import { useSubscription } from "@/hooks/use-subscription"
import type {
  CreateHostInput,
  HostFieldsFragment,
  HostSortField,
  SortDirection,
  UpdateHostInput,
} from "@/graphql/gql/graphql"
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
  // Sort params live in the query key (via the params object), so changing
  // the sort automatically restarts pagination from the first page.
  sortBy?: HostSortField | null
  sortDirection?: SortDirection | null
  first?: number
}

// Query key factory. Hosts read only through the infinite list — the edit
// dialog seeds from the clicked row's cached node, so there is no per-host
// detail cache to key. Mutations and the live subscription therefore just
// invalidate `all` (which covers both the paginated list and the topology
// snapshot) and let them refetch.
export const hostKeys = {
  all: ["hosts"] as const,
  lists: () => [...hostKeys.all, "list"] as const,
  infiniteList: (params: HostListParams) =>
    [...hostKeys.lists(), "infinite", params] as const,
  // The topology needs the whole operation in one snapshot, not a page, so it
  // gets its own key independent of the list's search/pagination params.
  topology: (operationId: string) =>
    [...hostKeys.all, "topology", operationId] as const,
}

// The topology cross-references every host against every other (a route's
// gateway is matched against all interface IPs), so a partial set produces a
// WRONG graph — real routers misread as phantoms. We must fetch the complete
// operation. Page size trades request count vs. per-request payload; the cap is
// a render-perf guard (React Flow is comfortable into the few-hundreds of
// nodes). Past the cap we surface `truncated` so the UI can warn rather than
// silently present an incomplete map.
const TOPOLOGY_PAGE = 100
export const MAX_TOPOLOGY_HOSTS = 1000

// --- Queries ---

export function useInfiniteHosts(params: HostListParams) {
  return useInfiniteQuery({
    queryKey: hostKeys.infiniteList(params),
    queryFn: ({ pageParam }) =>
      graphqlClient(HostsDocument, {
        operationId: params.operationId,
        search: params.search ?? null,
        sortBy: params.sortBy ?? null,
        sortDirection: params.sortDirection ?? null,
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

// Drains the whole operation's hosts (ignoring search — a filtered subset would
// derive false phantoms) into one flat array for the topology view. Keyed
// separately from the list so the two views don't share cache state, but it
// hangs off `hostKeys.all` so the same subscription invalidation refreshes it.
export function useAllHosts(operationId: string) {
  return useQuery({
    queryKey: hostKeys.topology(operationId),
    enabled: !!operationId,
    queryFn: async () => {
      const hosts: HostFieldsFragment[] = []
      let after: string | undefined
      let truncated = false
      for (;;) {
        const page = await graphqlClient(HostsDocument, {
          operationId,
          search: null,
          first: TOPOLOGY_PAGE,
          after,
        })
        hosts.push(...page.hosts.edges.map((e) => e.node))
        const hasNext = page.hosts.pageInfo.hasNextPage
        if (!hasNext) break
        if (hosts.length >= MAX_TOPOLOGY_HOSTS) {
          truncated = true
          break
        }
        after = page.hosts.pageInfo.endCursor ?? undefined
        if (!after) break
      }
      return { hosts, truncated }
    },
  })
}

// --- Mutations ---

export function useCreateHost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { operationId: string; input: CreateHostInput }) =>
      graphqlClient(CreateHostDocument, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostKeys.all })
    },
  })
}

export function useUpdateHost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateHostInput }) =>
      graphqlClient(UpdateHostDocument, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostKeys.all })
    },
  })
}

export function useDeleteHost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => graphqlClient(DeleteHostDocument, { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostKeys.all })
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
        queryClient.invalidateQueries({ queryKey: hostKeys.all })
      },
      enabled: !!operationId,
    },
  )
}
