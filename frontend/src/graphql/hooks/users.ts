import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import { useSubscription } from "@/hooks/use-subscription"
import type { CreateUserInput, UpdateUserInput } from "@/graphql/gql/graphql"
import {
  MeDocument,
  UserDocument,
  UsersDocument,
  CreateUserDocument,
  UpdateUserDocument,
  DeleteUserDocument,
  UpdateOwnProfileDocument,
  UserChangedDocument,
} from "@/graphql/gql/graphql"

// Query key factory for consistent cache keys and targeted invalidation.
// Infinite queries use a separate namespace to avoid collisions with useQuery
// (they store data in different shapes: flat vs paginated).
export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (params: { search?: string | null; first?: number; after?: string }) =>
    [...userKeys.lists(), params] as const,
  infiniteLists: () => [...userKeys.all, "infinite"] as const,
  infiniteList: (params: { search?: string | null; first?: number }) =>
    [...userKeys.infiniteLists(), params] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  me: () => ["me"] as const,
}

export function useMe() {
  return useQuery({
    queryKey: userKeys.me(),
    queryFn: () => graphqlClient(MeDocument),
  })
}

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => graphqlClient(UserDocument, { id }),
    enabled: !!id,
  })
}

export function useUsers(params: { search?: string | null; first?: number; after?: string } = {}) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => graphqlClient(UsersDocument, params),
  })
}

export function useInfiniteUsers(params: { search?: string | null; first?: number }) {
  return useInfiniteQuery({
    queryKey: userKeys.infiniteList(params),
    queryFn: ({ pageParam }) =>
      graphqlClient(UsersDocument, {
        search: params.search,
        first: params.first ?? 20,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.users.pageInfo.hasNextPage
        ? lastPage.users.pageInfo.endCursor ?? undefined
        : undefined,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      graphqlClient(CreateUserDocument, { input }),
    onSuccess: (data) => {
      // Seed the detail cache from the mutation response so it's immediately
      // available if the user opens the edit dialog before SSE arrives.
      queryClient.setQueryData(
        userKeys.detail(data.createUser.id),
        { user: data.createUser },
      )
      // List invalidation is handled by the SSE subscription.
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateUserInput }) =>
      graphqlClient(UpdateUserDocument, vars),
    onSuccess: (data, vars) => {
      // Update the detail cache directly from the mutation response.
      queryClient.setQueryData(
        userKeys.detail(vars.id),
        { user: data.updateUser },
      )
      // List invalidation is handled by the SSE subscription.
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      graphqlClient(DeleteUserDocument, { id }),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: userKeys.detail(id) })
      // List invalidation is handled by the SSE subscription.
    },
  })
}

export function useUpdateOwnProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateUserInput) =>
      graphqlClient(UpdateOwnProfileDocument, { input }),
    onSuccess: () => {
      // Own profile isn't covered by the userChanged subscription.
      queryClient.invalidateQueries({ queryKey: userKeys.me() })
    },
  })
}

/**
 * Subscribe to real-time user change events via SSE.
 *
 * When another session creates, updates, or deletes a user, this hook
 * updates the React Query cache so the UI stays in sync automatically.
 * For CREATED/UPDATED events the detail cache is populated directly from
 * the subscription payload (avoiding an extra refetch). List queries are
 * invalidated since surgically updating cursor-based pagination is fragile.
 */
export function useUserChangedSubscription() {
  const queryClient = useQueryClient()

  useSubscription(UserChangedDocument, undefined, {
    onData: (data) => {
      const { action, userId, user } = data.userChanged

      if (action === "DELETED") {
        queryClient.removeQueries({ queryKey: userKeys.detail(userId) })
      } else if (user) {
        // Populate detail cache directly from the SSE payload — no refetch needed.
        queryClient.setQueryData(userKeys.detail(userId), { user })
      }

      // Always invalidate list queries so the table refetches.
      queryClient.invalidateQueries({ queryKey: userKeys.lists() })
      queryClient.invalidateQueries({ queryKey: userKeys.infiniteLists() })
    },
  })
}
