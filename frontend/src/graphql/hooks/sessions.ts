import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import { useSubscription } from "@/hooks/use-subscription"
import {
  MySessionsDocument,
  SessionsDocument,
  RevokeSessionDocument,
  RevokeAllMySessionsDocument,
  AdminRevokeSessionDocument,
  AdminRevokeAllUserSessionsDocument,
  MySessionChangedDocument,
  SessionChangedDocument,
} from "@/graphql/gql/graphql"

// Query key factory for consistent cache keys and targeted invalidation.
export const sessionKeys = {
  all: ["sessions"] as const,
  myLists: () => [...sessionKeys.all, "my-list"] as const,
  myInfiniteLists: () => [...sessionKeys.all, "my-infinite"] as const,
  myInfiniteList: (params: { activeOnly?: boolean; first?: number }) =>
    [...sessionKeys.myInfiniteLists(), params] as const,
  adminLists: () => [...sessionKeys.all, "admin-list"] as const,
  adminInfiniteLists: () => [...sessionKeys.all, "admin-infinite"] as const,
  adminInfiniteList: (params: { userId?: string | null; search?: string | null; activeOnly?: boolean; first?: number }) =>
    [...sessionKeys.adminInfiniteLists(), params] as const,
  details: () => [...sessionKeys.all, "detail"] as const,
  detail: (id: string) => [...sessionKeys.details(), id] as const,
}

// --- My Sessions (any authenticated user) ---

export function useInfiniteMySessions(params: { activeOnly?: boolean; first?: number }) {
  return useInfiniteQuery({
    queryKey: sessionKeys.myInfiniteList(params),
    queryFn: ({ pageParam }) =>
      graphqlClient(MySessionsDocument, {
        activeOnly: params.activeOnly ?? false,
        first: params.first ?? 20,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.mySessions.pageInfo.hasNextPage
        ? lastPage.mySessions.pageInfo.endCursor ?? undefined
        : undefined,
  })
}

// --- Admin Sessions ---

export function useInfiniteAdminSessions(params: {
  userId?: string | null
  search?: string | null
  activeOnly?: boolean
  first?: number
}) {
  return useInfiniteQuery({
    queryKey: sessionKeys.adminInfiniteList(params),
    queryFn: ({ pageParam }) =>
      graphqlClient(SessionsDocument, {
        userId: params.userId,
        search: params.search,
        activeOnly: params.activeOnly ?? false,
        first: params.first ?? 20,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.sessions.pageInfo.hasNextPage
        ? lastPage.sessions.pageInfo.endCursor ?? undefined
        : undefined,
  })
}

// --- Mutations ---

export function useRevokeSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      graphqlClient(RevokeSessionDocument, { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.myInfiniteLists() })
      queryClient.invalidateQueries({ queryKey: sessionKeys.myLists() })
    },
  })
}

export function useRevokeAllMySessions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      graphqlClient(RevokeAllMySessionsDocument),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.myInfiniteLists() })
      queryClient.invalidateQueries({ queryKey: sessionKeys.myLists() })
    },
  })
}

export function useAdminRevokeSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      graphqlClient(AdminRevokeSessionDocument, { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.adminInfiniteLists() })
      queryClient.invalidateQueries({ queryKey: sessionKeys.adminLists() })
    },
  })
}

export function useAdminRevokeAllUserSessions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      graphqlClient(AdminRevokeAllUserSessionsDocument, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.adminInfiniteLists() })
      queryClient.invalidateQueries({ queryKey: sessionKeys.adminLists() })
    },
  })
}

// --- Subscriptions ---

/**
 * Subscribe to real-time session changes for the current user via SSE.
 * Invalidates my-session caches when sessions are created, refreshed, or terminated.
 */
export function useMySessionChangedSubscription() {
  const queryClient = useQueryClient()

  useSubscription(MySessionChangedDocument, undefined, {
    onData: (data) => {
      const { session } = data.mySessionChanged

      if (session) {
        queryClient.setQueryData(sessionKeys.detail(session.id), { session })
      }

      queryClient.invalidateQueries({ queryKey: sessionKeys.myInfiniteLists() })
      queryClient.invalidateQueries({ queryKey: sessionKeys.myLists() })
    },
  })
}

/**
 * Subscribe to real-time session changes for all users (admin only) via SSE.
 * Optionally filter by userId.
 */
export function useSessionChangedSubscription(userId?: string | null) {
  const queryClient = useQueryClient()

  useSubscription(
    SessionChangedDocument,
    userId ? { userId } : undefined,
    {
      onData: (data) => {
        const { session } = data.sessionChanged

        if (session) {
          queryClient.setQueryData(sessionKeys.detail(session.id), { session })
        }

        queryClient.invalidateQueries({ queryKey: sessionKeys.adminInfiniteLists() })
        queryClient.invalidateQueries({ queryKey: sessionKeys.adminLists() })
      },
    },
  )
}
