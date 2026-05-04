import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import { useSubscription } from "@/hooks/use-subscription"
import type { CreateWikiDocumentInput, UpdateWikiDocumentInput } from "@/graphql/gql/graphql"
import {
  WikiDocumentTreeDocument,
  WikiDocumentDocument,
  WikiDocumentsDocument,
  WikiSearchDocument,
  WikiDocumentTrashDocument,
  WikiDocumentBackupsDocument,
  WikiDocumentBackupDetailDocument,
  WikiDocumentPresenceDocument,
  WikiOperationPresenceDocument,
  CreateWikiDocumentDocument,
  UpdateWikiDocumentDocument,
  DeleteWikiDocumentDocument,
  RestoreWikiDocumentDocument,
  PermanentlyDeleteWikiDocumentDocument,
  EmptyWikiDocumentTrashDocument,
  CreateWikiDocumentBackupDocument,
  RestoreWikiDocumentBackupDocument,
  DeleteWikiDocumentBackupDocument,
  WikiDocumentChangedDocument,
  WikiDocumentPresenceChangedDocument,
} from "@/graphql/gql/graphql"

// Query key factory for consistent cache keys and targeted invalidation.
export const wikiKeys = {
  all: ["wiki"] as const,
  trees: () => [...wikiKeys.all, "tree"] as const,
  tree: (operationId: string) => [...wikiKeys.trees(), operationId] as const,
  details: () => [...wikiKeys.all, "detail"] as const,
  detail: (id: string) => [...wikiKeys.details(), id] as const,
  lists: () => [...wikiKeys.all, "list"] as const,
  infiniteList: (params: { operationId: string; parentDocumentId?: string | null; search?: string | null }) =>
    [...wikiKeys.lists(), "infinite", params] as const,
  search: (params: { operationId: string; scope?: string | null; query: string }) =>
    [...wikiKeys.all, "search", params] as const,
  trash: (operationId: string) => [...wikiKeys.all, "trash", operationId] as const,
  trashedDescendants: (documentId: string) =>
    [...wikiKeys.all, "trashedDescendants", documentId] as const,
  backups: (documentId: string) => [...wikiKeys.all, "backups", documentId] as const,
  backup: (id: string) => [...wikiKeys.all, "backup", id] as const,
  presence: (documentId: string) => [...wikiKeys.all, "presence", documentId] as const,
  operationPresence: (operationId: string) => [...wikiKeys.all, "operationPresence", operationId] as const,
}

// --- Queries ---

export function useWikiDocumentTree(operationId: string) {
  return useQuery({
    queryKey: wikiKeys.tree(operationId),
    queryFn: () => graphqlClient(WikiDocumentTreeDocument, { operationId }),
    enabled: !!operationId,
  })
}

export function useWikiDocument(documentId: string) {
  return useQuery({
    queryKey: wikiKeys.detail(documentId),
    queryFn: () => graphqlClient(WikiDocumentDocument, { id: documentId }),
    enabled: !!documentId,
  })
}

export function useWikiDocuments(params: {
  operationId: string
  parentDocumentId?: string | null
  search?: string | null
  first?: number
}) {
  return useInfiniteQuery({
    queryKey: wikiKeys.infiniteList(params),
    queryFn: ({ pageParam }) =>
      graphqlClient(WikiDocumentsDocument, {
        operationId: params.operationId,
        parentDocumentId: params.parentDocumentId,
        search: params.search,
        first: params.first ?? 20,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.wikiDocuments.pageInfo.hasNextPage
        ? lastPage.wikiDocuments.pageInfo.endCursor ?? undefined
        : undefined,
    enabled: !!params.operationId,
  })
}

// useWikiSearch drives the Cmd+K command palette. Offset-based pagination
// because ranking by text score cannot use the cursor scheme (createdAt) that
// the list query uses. Caller passes the debounced query; the query key
// intentionally includes only the debounced value so typing doesn't thrash
// the cache — `keepPreviousData` keeps the last page visible during re-queries.
//
// Disabled when query is empty so no call fires on an empty palette.
export function useWikiSearch(params: {
  operationId: string
  scope?: string | null
  query: string
  limit?: number
}) {
  const limit = params.limit ?? 20
  return useInfiniteQuery({
    queryKey: wikiKeys.search({
      operationId: params.operationId,
      scope: params.scope ?? null,
      query: params.query,
    }),
    queryFn: ({ pageParam }) =>
      graphqlClient(WikiSearchDocument, {
        operationId: params.operationId,
        scope: params.scope ?? null,
        query: params.query,
        offset: pageParam,
        limit,
      }),
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.wikiSearch.hasMore ? allPages.length * limit : undefined,
    enabled: !!params.operationId && params.query.trim().length > 0,
    staleTime: 15_000,
  })
}

export function useWikiDocumentTrash(operationId: string) {
  return useInfiniteQuery({
    queryKey: wikiKeys.trash(operationId),
    queryFn: ({ pageParam }) =>
      graphqlClient(WikiDocumentTrashDocument, {
        operationId,
        first: 20,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.wikiDocumentTrash.pageInfo.hasNextPage
        ? lastPage.wikiDocumentTrash.pageInfo.endCursor ?? undefined
        : undefined,
    enabled: !!operationId,
  })
}

export function useWikiDocumentBackups(documentId: string) {
  return useInfiniteQuery({
    queryKey: wikiKeys.backups(documentId),
    queryFn: ({ pageParam }) =>
      graphqlClient(WikiDocumentBackupsDocument, {
        documentId,
        first: 20,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.wikiDocumentBackups.pageInfo.hasNextPage
        ? lastPage.wikiDocumentBackups.pageInfo.endCursor ?? undefined
        : undefined,
    enabled: !!documentId,
  })
}

export function useWikiDocumentBackup(id: string) {
  return useQuery({
    queryKey: wikiKeys.backup(id),
    queryFn: () => graphqlClient(WikiDocumentBackupDetailDocument, { id }),
    enabled: !!id,
  })
}

export function useWikiDocumentPresence(documentId: string) {
  return useQuery({
    queryKey: wikiKeys.presence(documentId),
    queryFn: () => graphqlClient(WikiDocumentPresenceDocument, { documentId }),
    enabled: !!documentId,
  })
}

export function useWikiOperationPresence(operationId: string) {
  return useQuery({
    queryKey: wikiKeys.operationPresence(operationId),
    queryFn: () => graphqlClient(WikiOperationPresenceDocument, { operationId }),
    enabled: !!operationId,
  })
}

// --- Mutations ---

export function useCreateWikiDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { operationId: string; input: CreateWikiDocumentInput }) =>
      graphqlClient(CreateWikiDocumentDocument, vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.tree(vars.operationId) })
    },
  })
}

export function useUpdateWikiDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateWikiDocumentInput }) =>
      graphqlClient(UpdateWikiDocumentDocument, vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.detail(vars.id) })
      queryClient.invalidateQueries({ queryKey: wikiKeys.trees() })
    },
  })
}

export function useDeleteWikiDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      graphqlClient(DeleteWikiDocumentDocument, { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.trees() })
      queryClient.invalidateQueries({ queryKey: wikiKeys.all.filter(() => true) })
    },
  })
}

export function useRestoreWikiDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; cascade?: boolean }) =>
      graphqlClient(RestoreWikiDocumentDocument, {
        id: vars.id,
        cascade: vars.cascade ?? false,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.trees() })
      queryClient.invalidateQueries({ queryKey: wikiKeys.all })
    },
  })
}

export function usePermanentlyDeleteWikiDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      graphqlClient(PermanentlyDeleteWikiDocumentDocument, { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.all })
    },
  })
}

export function useEmptyWikiDocumentTrash() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (operationId: string) =>
      graphqlClient(EmptyWikiDocumentTrashDocument, { operationId }),
    onSuccess: (_data, operationId) => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.trash(operationId) })
    },
  })
}

export function useCreateWikiDocumentBackup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { documentId: string; description?: string }) =>
      graphqlClient(CreateWikiDocumentBackupDocument, vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.backups(vars.documentId) })
    },
  })
}

export function useRestoreWikiDocumentBackup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { documentId: string; backupId: string }) =>
      graphqlClient(RestoreWikiDocumentBackupDocument, vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.detail(vars.documentId) })
      queryClient.invalidateQueries({ queryKey: wikiKeys.backups(vars.documentId) })
    },
  })
}

export function useDeleteWikiDocumentBackup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; documentId: string }) =>
      graphqlClient(DeleteWikiDocumentBackupDocument, { id: vars.id }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.backups(vars.documentId) })
    },
  })
}

// --- Subscriptions ---

/**
 * Subscribe to real-time document change events via SSE.
 * Invalidates tree and trash caches on any document event.
 */
export function useWikiDocumentChangedSubscription(operationId: string) {
  const queryClient = useQueryClient()

  useSubscription(WikiDocumentChangedDocument, { operationId }, {
    onData: (data) => {
      const { action, documentId, document } = data.wikiDocumentChanged

      if (action === "DELETED") {
        queryClient.removeQueries({ queryKey: wikiKeys.detail(documentId) })
      } else if (document) {
        // Seed detail cache on create/update so navigating to the doc is instant.
        queryClient.invalidateQueries({ queryKey: wikiKeys.detail(documentId) })
      }

      queryClient.invalidateQueries({ queryKey: wikiKeys.tree(operationId) })
      queryClient.invalidateQueries({ queryKey: wikiKeys.trash(operationId) })
    },
    enabled: !!operationId,
  })
}

/**
 * Subscribe to real-time presence events via SSE.
 * Invalidates presence cache for the affected document.
 */
export function useWikiDocumentPresenceChangedSubscription(operationId: string) {
  const queryClient = useQueryClient()

  useSubscription(WikiDocumentPresenceChangedDocument, { operationId }, {
    onData: (data) => {
      const { documentId } = data.wikiDocumentPresenceChanged
      queryClient.invalidateQueries({ queryKey: wikiKeys.presence(documentId) })
      queryClient.invalidateQueries({ queryKey: wikiKeys.operationPresence(operationId) })
    },
    enabled: !!operationId,
  })
}
