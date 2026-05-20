import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import { useSubscription } from "@/hooks/use-subscription"
import type {
  CreateCredentialInput,
  UpdateCredentialInput,
  CredentialType,
} from "@/graphql/gql/graphql"
import {
  CredentialDocument,
  CredentialsDocument,
  CredentialTagsDocument,
  CreateCredentialDocument,
  UpdateCredentialDocument,
  DeleteCredentialDocument,
  AddCredentialCommentDocument,
  UpdateCredentialCommentDocument,
  DeleteCredentialCommentDocument,
  CredentialChangedDocument,
  MyCredentialsDocument,
  MyCredentialTagsDocument,
  MyCredentialChangedDocument,
} from "@/graphql/gql/graphql"

export type CredentialListParams = {
  operationId: string
  search?: string | null
  type?: CredentialType | null
  tags?: string[] | null
  // validOnly: true hides invalid (default), null shows both, false shows only invalid.
  validOnly?: boolean | null
  first?: number
}

// Cross-operation list params for the global Findings view.
// operationIds: null = "all my operations" (server resolves to caller's
// membership set). Empty array = explicit empty selection.
export type MyCredentialListParams = {
  operationIds: string[] | null
  search?: string | null
  type?: CredentialType | null
  tags?: string[] | null
  validOnly?: boolean | null
  first?: number
}

// Query key factory.
export const credentialKeys = {
  all: ["credentials"] as const,
  lists: () => [...credentialKeys.all, "list"] as const,
  infiniteList: (params: CredentialListParams) =>
    [...credentialKeys.lists(), "infinite", params] as const,
  infiniteMyList: (params: MyCredentialListParams) =>
    [...credentialKeys.lists(), "infinite-my", params] as const,
  details: () => [...credentialKeys.all, "detail"] as const,
  detail: (id: string) => [...credentialKeys.details(), id] as const,
  tagSets: () => [...credentialKeys.all, "tags"] as const,
  tagSet: (operationId: string) => [...credentialKeys.tagSets(), operationId] as const,
  myTagSet: (operationIds: string[] | null) =>
    [...credentialKeys.tagSets(), "my", operationIds] as const,
}

// --- Queries ---

// `options.enabled` lets callers defer the fetch until the credential is
// actually about to be displayed — wiki-credential-chip uses this to gate
// queries on viewport intersection so a long doc with many inline chips
// doesn't fan out one round trip per chip on mount. The `!!id` guard still
// applies on top of the caller's flag so empty/broken refs are inert.
export function useCredential(
  id: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: credentialKeys.detail(id),
    queryFn: () => graphqlClient(CredentialDocument, { id }),
    enabled: !!id && (options?.enabled ?? true),
  })
}

export function useInfiniteCredentials(params: CredentialListParams) {
  return useInfiniteQuery({
    queryKey: credentialKeys.infiniteList(params),
    queryFn: ({ pageParam }) =>
      graphqlClient(CredentialsDocument, {
        operationId: params.operationId,
        search: params.search ?? null,
        type: params.type ?? null,
        tags: params.tags && params.tags.length > 0 ? params.tags : null,
        validOnly: params.validOnly ?? null,
        first: params.first ?? 20,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.credentials.pageInfo.hasNextPage
        ? lastPage.credentials.pageInfo.endCursor ?? undefined
        : undefined,
    enabled: !!params.operationId,
  })
}

export function useCredentialTags(operationId: string) {
  return useQuery({
    queryKey: credentialKeys.tagSet(operationId),
    queryFn: () => graphqlClient(CredentialTagsDocument, { operationId }),
    enabled: !!operationId,
  })
}

// Cross-operation list. Mirrors useInfiniteCredentials but talks to myCredentials
// and accepts an operationIds list (null = caller's full accessible set).
// Pass `enabled: false` to keep the hook in the call tree without firing the
// query (used from CredentialsTab when we're in scoped mode).
export function useInfiniteMyCredentials(
  params: MyCredentialListParams,
  options: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: credentialKeys.infiniteMyList(params),
    queryFn: ({ pageParam }) =>
      graphqlClient(MyCredentialsDocument, {
        operationIds: params.operationIds,
        search: params.search ?? null,
        type: params.type ?? null,
        tags: params.tags && params.tags.length > 0 ? params.tags : null,
        validOnly: params.validOnly ?? null,
        first: params.first ?? 20,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.myCredentials.pageInfo.hasNextPage
        ? lastPage.myCredentials.pageInfo.endCursor ?? undefined
        : undefined,
    enabled: options.enabled ?? true,
  })
}

export function useMyCredentialTags(
  operationIds: string[] | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: credentialKeys.myTagSet(operationIds),
    queryFn: () => graphqlClient(MyCredentialTagsDocument, { operationIds }),
    enabled: options.enabled ?? true,
  })
}

// --- Mutations ---

export function useCreateCredential() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { operationId: string; input: CreateCredentialInput }) =>
      graphqlClient(CreateCredentialDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(credentialKeys.detail(data.createCredential.id), {
        credential: data.createCredential,
      })
      queryClient.invalidateQueries({ queryKey: credentialKeys.lists() })
      // Invalidate both the scoped tag set and any my-tag sets that include
      // this operation; cheaper to drop tagSets() wholesale than to enumerate.
      queryClient.invalidateQueries({ queryKey: credentialKeys.tagSet(vars.operationId) })
      queryClient.invalidateQueries({ queryKey: credentialKeys.tagSets() })
    },
  })
}

export function useUpdateCredential() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateCredentialInput }) =>
      graphqlClient(UpdateCredentialDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(credentialKeys.detail(vars.id), {
        credential: data.updateCredential,
      })
      queryClient.invalidateQueries({ queryKey: credentialKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: credentialKeys.tagSet(data.updateCredential.operationId),
      })
      queryClient.invalidateQueries({ queryKey: credentialKeys.tagSets() })
    },
  })
}

export function useDeleteCredential() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      graphqlClient(DeleteCredentialDocument, { id }),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: credentialKeys.detail(id) })
      // lists() covers both scoped (infiniteList) and global (infiniteMyList)
      // because their query keys share the [..., "list"] prefix.
      queryClient.invalidateQueries({ queryKey: credentialKeys.lists() })
      queryClient.invalidateQueries({ queryKey: credentialKeys.tagSets() })
    },
  })
}

export function useAddCredentialComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { credentialId: string; text: string }) =>
      graphqlClient(AddCredentialCommentDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(credentialKeys.detail(vars.credentialId), {
        credential: data.addCredentialComment,
      })
      queryClient.invalidateQueries({ queryKey: credentialKeys.lists() })
    },
  })
}

export function useUpdateCredentialComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { credentialId: string; commentId: string; text: string }) =>
      graphqlClient(UpdateCredentialCommentDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(credentialKeys.detail(vars.credentialId), {
        credential: data.updateCredentialComment,
      })
    },
  })
}

export function useDeleteCredentialComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { credentialId: string; commentId: string }) =>
      graphqlClient(DeleteCredentialCommentDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(credentialKeys.detail(vars.credentialId), {
        credential: data.deleteCredentialComment,
      })
      queryClient.invalidateQueries({ queryKey: credentialKeys.lists() })
    },
  })
}

// --- Subscriptions ---

// Subscribe to real-time credential change events via SSE. The server pushes the
// full credential entity for non-delete actions; we reuse it to keep the detail
// cache hot and invalidate the list/tag caches so any open table re-renders.
export function useCredentialChangedSubscription(operationId: string) {
  const queryClient = useQueryClient()

  useSubscription(CredentialChangedDocument, { operationId }, {
    onData: (data) => {
      const { action, credentialId, credential } = data.credentialChanged

      if (action === "DELETED") {
        queryClient.removeQueries({ queryKey: credentialKeys.detail(credentialId) })
      } else if (credential) {
        queryClient.setQueryData(credentialKeys.detail(credentialId), { credential })
      }

      queryClient.invalidateQueries({ queryKey: credentialKeys.lists() })
      queryClient.invalidateQueries({ queryKey: credentialKeys.tagSet(operationId) })
    },
    enabled: !!operationId,
  })
}

// Cross-operation real-time subscription for the global Findings view.
// Mirrors useCredentialChangedSubscription but talks to myCredentialChanged
// and accepts an operationIds list (null = caller's full accessible set, []
// = explicit empty — see MyCredentialsQuery for the same semantics).
//
// Invalidation is broader than the scoped version: we drop all credential
// lists and all tag sets, because a single event can affect either the
// global infiniteMyList key or any scoped infiniteList key (e.g. another
// session of the same user has a scoped page open).
export function useMyCredentialChangedSubscription(
  operationIds: string[] | null,
  options: { enabled?: boolean } = {},
) {
  const queryClient = useQueryClient()

  useSubscription(
    MyCredentialChangedDocument,
    { operationIds },
    {
      onData: (data) => {
        const { action, credentialId, credential } = data.myCredentialChanged

        if (action === "DELETED") {
          queryClient.removeQueries({
            queryKey: credentialKeys.detail(credentialId),
          })
        } else if (credential) {
          queryClient.setQueryData(credentialKeys.detail(credentialId), {
            credential,
          })
        }

        queryClient.invalidateQueries({ queryKey: credentialKeys.lists() })
        queryClient.invalidateQueries({ queryKey: credentialKeys.tagSets() })
      },
      enabled: options.enabled ?? true,
    },
  )
}
