import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import { useSubscription } from "@/hooks/use-subscription"
import type {
  CreateHashInput,
  UpdateHashInput,
  BulkImportHashesInput,
  MarkHashCrackedInput,
  HashStatus,
} from "@/graphql/gql/graphql"
import {
  HashDocument,
  HashesDocument,
  HashTagsDocument,
  HashTypesDocument,
  MyHashesDocument,
  MyHashTagsDocument,
  CreateHashDocument,
  UpdateHashDocument,
  DeleteHashDocument,
  BulkImportHashesDocument,
  MarkHashCrackedDocument,
  AddHashCommentDocument,
  UpdateHashCommentDocument,
  DeleteHashCommentDocument,
  HashChangedDocument,
  MyHashChangedDocument,
} from "@/graphql/gql/graphql"

export type HashListParams = {
  operationId: string
  search?: string | null
  statuses?: HashStatus[] | null
  hashTypes?: string[] | null
  tags?: string[] | null
  hasCredential?: boolean | null
  first?: number
}

export type MyHashListParams = {
  operationIds: string[] | null
  search?: string | null
  statuses?: HashStatus[] | null
  hashTypes?: string[] | null
  tags?: string[] | null
  hasCredential?: boolean | null
  first?: number
}

// Query key factory. Mirrors credentialKeys structure so dev expectations
// carry over between the two findings tabs.
export const hashKeys = {
  all: ["hashes"] as const,
  lists: () => [...hashKeys.all, "list"] as const,
  infiniteList: (params: HashListParams) =>
    [...hashKeys.lists(), "infinite", params] as const,
  infiniteMyList: (params: MyHashListParams) =>
    [...hashKeys.lists(), "infinite-my", params] as const,
  details: () => [...hashKeys.all, "detail"] as const,
  detail: (id: string) => [...hashKeys.details(), id] as const,
  tagSets: () => [...hashKeys.all, "tags"] as const,
  tagSet: (operationId: string) => [...hashKeys.tagSets(), operationId] as const,
  myTagSet: (operationIds: string[] | null) =>
    [...hashKeys.tagSets(), "my", operationIds] as const,
  types: () => [...hashKeys.all, "types"] as const,
}

// --- Queries ---

export function useHash(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: hashKeys.detail(id),
    queryFn: () => graphqlClient(HashDocument, { id }),
    enabled: !!id && (options?.enabled ?? true),
  })
}

export function useInfiniteHashes(params: HashListParams) {
  return useInfiniteQuery({
    queryKey: hashKeys.infiniteList(params),
    queryFn: ({ pageParam }) =>
      graphqlClient(HashesDocument, {
        operationId: params.operationId,
        search: params.search ?? null,
        statuses: params.statuses && params.statuses.length > 0 ? params.statuses : null,
        hashTypes: params.hashTypes && params.hashTypes.length > 0 ? params.hashTypes : null,
        tags: params.tags && params.tags.length > 0 ? params.tags : null,
        hasCredential: params.hasCredential ?? null,
        first: params.first ?? 20,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hashes.pageInfo.hasNextPage
        ? lastPage.hashes.pageInfo.endCursor ?? undefined
        : undefined,
    enabled: !!params.operationId,
  })
}

export function useHashTags(operationId: string) {
  return useQuery({
    queryKey: hashKeys.tagSet(operationId),
    queryFn: () => graphqlClient(HashTagsDocument, { operationId }),
    enabled: !!operationId,
  })
}

// Static curated list — fetched once and reused across the create / bulk
// import / filter pickers. staleTime: Infinity to avoid refetch churn.
export function useHashTypes() {
  return useQuery({
    queryKey: hashKeys.types(),
    queryFn: () => graphqlClient(HashTypesDocument),
    staleTime: Infinity,
  })
}

export function useInfiniteMyHashes(
  params: MyHashListParams,
  options: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: hashKeys.infiniteMyList(params),
    queryFn: ({ pageParam }) =>
      graphqlClient(MyHashesDocument, {
        operationIds: params.operationIds,
        search: params.search ?? null,
        statuses: params.statuses && params.statuses.length > 0 ? params.statuses : null,
        hashTypes: params.hashTypes && params.hashTypes.length > 0 ? params.hashTypes : null,
        tags: params.tags && params.tags.length > 0 ? params.tags : null,
        hasCredential: params.hasCredential ?? null,
        first: params.first ?? 20,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.myHashes.pageInfo.hasNextPage
        ? lastPage.myHashes.pageInfo.endCursor ?? undefined
        : undefined,
    enabled: options.enabled ?? true,
  })
}

export function useMyHashTags(
  operationIds: string[] | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: hashKeys.myTagSet(operationIds),
    queryFn: () => graphqlClient(MyHashTagsDocument, { operationIds }),
    enabled: options.enabled ?? true,
  })
}

// --- Mutations ---

export function useCreateHash() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { operationId: string; input: CreateHashInput }) =>
      graphqlClient(CreateHashDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(hashKeys.detail(data.createHash.id), {
        hash: data.createHash,
      })
      queryClient.invalidateQueries({ queryKey: hashKeys.lists() })
      queryClient.invalidateQueries({ queryKey: hashKeys.tagSet(vars.operationId) })
      queryClient.invalidateQueries({ queryKey: hashKeys.tagSets() })
    },
  })
}

export function useUpdateHash() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateHashInput }) =>
      graphqlClient(UpdateHashDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(hashKeys.detail(vars.id), {
        hash: data.updateHash,
      })
      queryClient.invalidateQueries({ queryKey: hashKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: hashKeys.tagSet(data.updateHash.operationId),
      })
      queryClient.invalidateQueries({ queryKey: hashKeys.tagSets() })
    },
  })
}

export function useDeleteHash() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => graphqlClient(DeleteHashDocument, { id }),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: hashKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: hashKeys.lists() })
      queryClient.invalidateQueries({ queryKey: hashKeys.tagSets() })
    },
  })
}

export function useBulkImportHashes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { operationId: string; input: BulkImportHashesInput }) =>
      graphqlClient(BulkImportHashesDocument, vars),
    onSuccess: (_data, vars) => {
      // Bulk import can produce dozens of new rows — invalidate wholesale.
      queryClient.invalidateQueries({ queryKey: hashKeys.lists() })
      queryClient.invalidateQueries({ queryKey: hashKeys.tagSet(vars.operationId) })
      queryClient.invalidateQueries({ queryKey: hashKeys.tagSets() })
    },
  })
}

// markHashCracked may create a credential server-side, so invalidate the
// credential cache too. Importing credentialKeys would create a circular
// dependency at runtime (it's fine in TS, just visually noisy), so we drop
// the credentials prefix by string instead.
export function useMarkHashCracked() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: MarkHashCrackedInput }) =>
      graphqlClient(MarkHashCrackedDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(hashKeys.detail(vars.id), {
        hash: data.markHashCracked,
      })
      queryClient.invalidateQueries({ queryKey: hashKeys.lists() })
      queryClient.invalidateQueries({ queryKey: hashKeys.tagSets() })
      // Credential side: either a new credential appeared, or an existing
      // credential's password changed — both invalidate the credential list
      // and the specific detail row.
      queryClient.invalidateQueries({ queryKey: ["credentials"] })
    },
  })
}

export function useAddHashComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { hashId: string; text: string }) =>
      graphqlClient(AddHashCommentDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(hashKeys.detail(vars.hashId), {
        hash: data.addHashComment,
      })
      queryClient.invalidateQueries({ queryKey: hashKeys.lists() })
    },
  })
}

export function useUpdateHashComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { hashId: string; commentId: string; text: string }) =>
      graphqlClient(UpdateHashCommentDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(hashKeys.detail(vars.hashId), {
        hash: data.updateHashComment,
      })
    },
  })
}

export function useDeleteHashComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { hashId: string; commentId: string }) =>
      graphqlClient(DeleteHashCommentDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(hashKeys.detail(vars.hashId), {
        hash: data.deleteHashComment,
      })
      queryClient.invalidateQueries({ queryKey: hashKeys.lists() })
    },
  })
}

// --- Subscriptions ---

// hash events with empty hashId carry a bulk-import signal — the server
// publishes one summary event per bulk insert and intentionally leaves the
// id blank because there is no single subject. We treat it as "invalidate
// the list and refetch" rather than trying to splice individual rows.
export function useHashChangedSubscription(operationId: string) {
  const queryClient = useQueryClient()

  useSubscription(HashChangedDocument, { operationId }, {
    onData: (data) => {
      const { action, hashId, hash } = data.hashChanged

      if (action === "DELETED" && hashId) {
        queryClient.removeQueries({ queryKey: hashKeys.detail(hashId) })
      } else if (hashId && hash) {
        queryClient.setQueryData(hashKeys.detail(hashId), { hash })
      }

      queryClient.invalidateQueries({ queryKey: hashKeys.lists() })
      queryClient.invalidateQueries({ queryKey: hashKeys.tagSet(operationId) })
      // Cracked events touch the credential side too — see useMarkHashCracked
      // for the rationale.
      queryClient.invalidateQueries({ queryKey: ["credentials"] })
    },
    enabled: !!operationId,
  })
}

export function useMyHashChangedSubscription(
  operationIds: string[] | null,
  options: { enabled?: boolean } = {},
) {
  const queryClient = useQueryClient()

  useSubscription(
    MyHashChangedDocument,
    { operationIds },
    {
      onData: (data) => {
        const { action, hashId, hash } = data.myHashChanged

        if (action === "DELETED" && hashId) {
          queryClient.removeQueries({ queryKey: hashKeys.detail(hashId) })
        } else if (hashId && hash) {
          queryClient.setQueryData(hashKeys.detail(hashId), { hash })
        }

        queryClient.invalidateQueries({ queryKey: hashKeys.lists() })
        queryClient.invalidateQueries({ queryKey: hashKeys.tagSets() })
        queryClient.invalidateQueries({ queryKey: ["credentials"] })
      },
      enabled: options.enabled ?? true,
    },
  )
}
