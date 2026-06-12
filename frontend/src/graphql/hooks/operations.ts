import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import { useSubscription } from "@/hooks/use-subscription"
import type {
  CreateOperationInput,
  UpdateOperationInput,
  OperationRole,
  OperationSortField,
  SortDirection,
} from "@/graphql/gql/graphql"
// Note: OperationRole is a string union type ("ADMIN" | "OPERATOR" | "VIEWER"), not an enum
import {
  OperationDocument,
  OperationsDocument,
  MyOperationRoleDocument,
  CreateOperationDocument,
  UpdateOperationDocument,
  DeleteOperationDocument,
  AddOperationMemberDocument,
  RemoveOperationMemberDocument,
  UpdateOperationMemberRoleDocument,
  OperationChangedDocument,
  OperationMemberChangedDocument,
  UserSuggestionsDocument,
} from "@/graphql/gql/graphql"

// Query key factory for consistent cache keys and targeted invalidation.
export const operationKeys = {
  all: ["operations"] as const,
  lists: () => [...operationKeys.all, "list"] as const,
  list: (params: { search?: string | null; first?: number; after?: string }) =>
    [...operationKeys.lists(), params] as const,
  infiniteLists: () => [...operationKeys.all, "infinite"] as const,
  infiniteList: (params: OperationInfiniteListParams) =>
    [...operationKeys.infiniteLists(), params] as const,
  details: () => [...operationKeys.all, "detail"] as const,
  detail: (id: string) => [...operationKeys.details(), id] as const,
  myRole: (operationId: string) => [...operationKeys.all, "myRole", operationId] as const,
}

export function useOperation(id: string) {
  return useQuery({
    queryKey: operationKeys.detail(id),
    queryFn: () => graphqlClient(OperationDocument, { id }),
    enabled: !!id,
  })
}

export type OperationInfiniteListParams = {
  search?: string | null
  // Sort params live in the query key (via the params object), so changing
  // the sort automatically restarts pagination from the first page.
  sortBy?: OperationSortField | null
  sortDirection?: SortDirection | null
  first?: number
}

export function useInfiniteOperations(
  params: OperationInfiniteListParams,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey: operationKeys.infiniteList(params),
    queryFn: ({ pageParam }) =>
      graphqlClient(OperationsDocument, {
        search: params.search,
        sortBy: params.sortBy ?? null,
        sortDirection: params.sortDirection ?? null,
        first: params.first ?? 20,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.operations.pageInfo.hasNextPage
        ? lastPage.operations.pageInfo.endCursor ?? undefined
        : undefined,
    enabled: options?.enabled ?? true,
  })
}

export function useMyOperationRole(operationId: string) {
  return useQuery({
    queryKey: operationKeys.myRole(operationId),
    queryFn: () => graphqlClient(MyOperationRoleDocument, { operationId }),
    enabled: !!operationId,
  })
}

export function useUserSuggestions(search: string) {
  return useQuery({
    queryKey: ["userSuggestions", search] as const,
    queryFn: () => graphqlClient(UserSuggestionsDocument, { search, first: 10 }),
    enabled: search.length > 0,
  })
}

export function useCreateOperation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateOperationInput) =>
      graphqlClient(CreateOperationDocument, { input }),
    onSuccess: (data) => {
      queryClient.setQueryData(
        operationKeys.detail(data.createOperation.id),
        { operation: data.createOperation },
      )
    },
  })
}

export function useUpdateOperation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateOperationInput }) =>
      graphqlClient(UpdateOperationDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(
        operationKeys.detail(vars.id),
        { operation: data.updateOperation },
      )
    },
  })
}

export function useDeleteOperation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      graphqlClient(DeleteOperationDocument, { id }),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: operationKeys.detail(id) })
    },
  })
}

export function useAddOperationMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { operationId: string; userId: string; role: OperationRole }) =>
      graphqlClient(AddOperationMemberDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(
        operationKeys.detail(vars.operationId),
        { operation: data.addOperationMember },
      )
    },
  })
}

export function useRemoveOperationMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { operationId: string; userId: string }) =>
      graphqlClient(RemoveOperationMemberDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(
        operationKeys.detail(vars.operationId),
        { operation: data.removeOperationMember },
      )
    },
  })
}

export function useUpdateOperationMemberRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { operationId: string; userId: string; role: OperationRole }) =>
      graphqlClient(UpdateOperationMemberRoleDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(
        operationKeys.detail(vars.operationId),
        { operation: data.updateOperationMemberRole },
      )
    },
  })
}

/**
 * Subscribe to real-time operation change events via SSE.
 *
 * When another session creates, updates, or deletes an operation, this hook
 * updates the React Query cache so the UI stays in sync automatically.
 */
export function useOperationChangedSubscription() {
  const queryClient = useQueryClient()

  useSubscription(OperationChangedDocument, undefined, {
    onData: (data) => {
      const { action, operationId, operation } = data.operationChanged

      if (action === "DELETED") {
        queryClient.removeQueries({ queryKey: operationKeys.detail(operationId) })
      } else if (operation) {
        queryClient.setQueryData(operationKeys.detail(operationId), { operation })
      }

      queryClient.invalidateQueries({ queryKey: operationKeys.lists() })
      queryClient.invalidateQueries({ queryKey: operationKeys.infiniteLists() })
    },
  })
}

/**
 * Subscribe to real-time membership change events via SSE.
 *
 * OperationMemberEvent only carries IDs (no full operation object),
 * so we invalidate the detail cache to trigger a refetch.
 */
export function useOperationMemberChangedSubscription() {
  const queryClient = useQueryClient()

  useSubscription(OperationMemberChangedDocument, undefined, {
    onData: (data) => {
      const { operationId } = data.operationMemberChanged

      // Refetch this operation's detail (members may have changed)
      queryClient.invalidateQueries({ queryKey: operationKeys.detail(operationId) })
      // Refetch lists (member count in table rows)
      queryClient.invalidateQueries({ queryKey: operationKeys.lists() })
      queryClient.invalidateQueries({ queryKey: operationKeys.infiniteLists() })
    },
  })
}
