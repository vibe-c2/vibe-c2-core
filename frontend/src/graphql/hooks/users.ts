import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import type { CreateUserInput, UpdateUserInput } from "@/graphql/gql/graphql"
import {
  MeDocument,
  UserDocument,
  UsersDocument,
  CreateUserDocument,
  UpdateUserDocument,
  DeleteUserDocument,
  UpdateOwnProfileDocument,
} from "@/graphql/gql/graphql"

// Query key factory for consistent cache keys and targeted invalidation
export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (params: { search?: string | null; first?: number; after?: string }) =>
    [...userKeys.lists(), params] as const,
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
    queryKey: userKeys.list(params),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateUserInput }) =>
      graphqlClient(UpdateUserDocument, vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(vars.id) })
      queryClient.invalidateQueries({ queryKey: userKeys.lists() })
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      graphqlClient(DeleteUserDocument, { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() })
    },
  })
}

export function useUpdateOwnProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateUserInput) =>
      graphqlClient(UpdateOwnProfileDocument, { input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.me() })
    },
  })
}
