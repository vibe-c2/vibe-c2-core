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

// Query key factory.
export const credentialKeys = {
  all: ["credentials"] as const,
  lists: () => [...credentialKeys.all, "list"] as const,
  infiniteList: (params: CredentialListParams) =>
    [...credentialKeys.lists(), "infinite", params] as const,
  details: () => [...credentialKeys.all, "detail"] as const,
  detail: (id: string) => [...credentialKeys.details(), id] as const,
  tagSets: () => [...credentialKeys.all, "tags"] as const,
  tagSet: (operationId: string) => [...credentialKeys.tagSets(), operationId] as const,
}

// --- Queries ---

export function useCredential(id: string) {
  return useQuery({
    queryKey: credentialKeys.detail(id),
    queryFn: () => graphqlClient(CredentialDocument, { id }),
    enabled: !!id,
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
      queryClient.invalidateQueries({
        queryKey: credentialKeys.tagSet(vars.operationId),
      })
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
