import { useCallback } from "react"
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import { useSubscription } from "@/hooks/use-subscription"
import type {
  CreateWikiDocumentInput,
  ReorderWikiDocumentSiblingsInput,
  UpdateWikiDocumentInput,
} from "@/graphql/gql/graphql"
import {
  WikiDocumentTreeDocument,
  WikiDocumentChildrenDocument,
  WikiDocumentTreeRevealPathDocument,
  WikiDocumentTrashCountDocument,
  WikiDocumentDocument,
  WikiDocumentLiteDocument,
  WikiDocumentBacklinksDocument,
  WikiDocumentsDocument,
  WikiSearchDocument,
  WikiDocumentTrashDocument,
  WikiDocumentBackupsDocument,
  WikiDocumentBackupDetailDocument,
  WikiDocumentPresenceDocument,
  WikiOperationPresenceDocument,
  WikiDocumentHistoryDocument,
  CreateWikiDocumentDocument,
  UpdateWikiDocumentDocument,
  ReorderWikiDocumentSiblingsDocument,
  DeleteWikiDocumentDocument,
  RestoreWikiDocumentDocument,
  PermanentlyDeleteWikiDocumentDocument,
  EmptyWikiDocumentTrashDocument,
  CreateWikiDocumentBackupDocument,
  RestoreWikiDocumentBackupDocument,
  DeleteWikiDocumentBackupDocument,
  TrackWikiDocumentVisitDocument,
  WikiDocumentChangedDocument,
  WikiDocumentPresenceChangedDocument,
  type WikiDocumentTreeFieldsFragment,
  type WikiDocumentChildrenQuery,
} from "@/graphql/gql/graphql"

// Query key factory for consistent cache keys and targeted invalidation.
export const wikiKeys = {
  all: ["wiki"] as const,
  // Legacy full-tree query — still used by the move dialog, which lazy-fetches
  // it only when opened. The sidebar uses the per-parent `children` key below.
  trees: () => [...wikiKeys.all, "tree"] as const,
  tree: (operationId: string) => [...wikiKeys.trees(), operationId] as const,
  // Per-parent direct-children entry. Used by the lazy sidebar (one entry per
  // expanded branch) and the document-footer Sub-pages list. Root-level rows
  // live under the sentinel "__root__" so a single shape covers both cases.
  childrenAll: () => [...wikiKeys.all, "children"] as const,
  childrenByOp: (operationId: string) => [...wikiKeys.childrenAll(), operationId] as const,
  children: (operationId: string, parentDocumentId: string | null) =>
    [...wikiKeys.childrenByOp(operationId), parentDocumentId ?? "__root__"] as const,
  // Reveal path for direct-link landings on /wiki/:documentId. One round trip
  // returns every doc the sidebar needs to render itself expanded to the
  // target; on success we shred the result into per-parent `children` entries
  // so the lazy renders below are cache hits.
  revealPath: (documentId: string) => [...wikiKeys.all, "revealPath", documentId] as const,
  details: () => [...wikiKeys.all, "detail"] as const,
  detail: (id: string) => [...wikiKeys.details(), id] as const,
  lists: () => [...wikiKeys.all, "list"] as const,
  infiniteList: (params: { operationId: string; parentDocumentId?: string | null; search?: string | null }) =>
    [...wikiKeys.lists(), "infinite", params] as const,
  search: (params: { operationId: string; scope?: string | null; query: string }) =>
    [...wikiKeys.all, "search", params] as const,
  trash: (operationId: string) => [...wikiKeys.all, "trash", operationId] as const,
  trashCount: (operationId: string) =>
    [...wikiKeys.all, "trashCount", operationId] as const,
  trashedDescendants: (documentId: string) =>
    [...wikiKeys.all, "trashedDescendants", documentId] as const,
  backups: (documentId: string) => [...wikiKeys.all, "backups", documentId] as const,
  backup: (id: string) => [...wikiKeys.all, "backup", id] as const,
  presence: (documentId: string) => [...wikiKeys.all, "presence", documentId] as const,
  operationPresence: (operationId: string) => [...wikiKeys.all, "operationPresence", operationId] as const,
  histories: () => [...wikiKeys.all, "history"] as const,
  history: (operationId: string) => [...wikiKeys.histories(), operationId] as const,
  // Lightweight per-doc projection used by inline /doc chips. Separate from
  // `detail` so chips don't trigger a refetch of the full document body.
  lite: (id: string) => [...wikiKeys.all, "lite", id] as const,
  backlinks: (documentId: string) =>
    [...wikiKeys.all, "backlinks", documentId] as const,
}

// --- Queries ---

// Legacy full-tree fetch. Kept for the move dialog (which needs every doc as
// a target option). The sidebar now uses useWikiDocumentChildren below.
// `enabled` is opt-in so callers can gate the fetch on dialog visibility.
export function useWikiDocumentTree(
  operationId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: wikiKeys.tree(operationId),
    queryFn: () => graphqlClient(WikiDocumentTreeDocument, { operationId }),
    enabled: !!operationId && (options?.enabled ?? true),
  })
}

// On-demand full-tree fetch that ALSO shreds the response into per-parent
// children cache entries. Powers "Expand all" / "Expand subtree" in the lazy
// sidebar: those actions need to know about branches the user has never
// expanded, so a one-shot tree fetch primes the cache and any subsequent
// useWikiDocumentChildren read becomes a cache hit. The SSE
// wikiDocumentChanged subscription invalidates wikiKeys.tree(operationId),
// so the next call refetches automatically after mutations.
export function useEnsureWikiTree(operationId: string) {
  const queryClient = useQueryClient()
  return useCallback(async (): Promise<WikiDocumentTreeFieldsFragment[]> => {
    const data = await queryClient.fetchQuery({
      queryKey: wikiKeys.tree(operationId),
      queryFn: () => graphqlClient(WikiDocumentTreeDocument, { operationId }),
    })
    const rows = data.wikiDocumentTree

    // Group rows by parent and seed every per-parent cache entry so the lazy
    // sidebar treats this as a free walk. Same shape as
    // useWikiDocumentTreeRevealPath emits.
    const byParent = new Map<string | null, WikiDocumentTreeFieldsFragment[]>()
    // Pre-seed every doc id with an empty list so leaf branches that the user
    // later clicks into don't re-fetch (their empty children are still cached).
    for (const row of rows) {
      byParent.set(row.id, [])
    }
    // Always include the root bucket — when an operation has zero documents
    // the children:root entry still needs to be populated as an empty list.
    if (!byParent.has(null)) byParent.set(null, [])
    for (const row of rows) {
      const pid = row.parentDocumentId ?? null
      const arr = byParent.get(pid) ?? []
      arr.push(row)
      byParent.set(pid, arr)
    }
    for (const [pid, list] of byParent) {
      list.sort((a, b) =>
        a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0,
      )
      queryClient.setQueryData<WikiDocumentChildrenQuery>(
        wikiKeys.children(operationId, pid),
        { wikiDocumentChildren: list },
      )
    }

    return rows
  }, [queryClient, operationId])
}

// Direct children of a parent (or roots when parentDocumentId is null).
// Each expanded sidebar branch holds one of these; subscriptions invalidate
// per-parent keys, so a move only refetches the two affected branches.
//
// `staleTime: Infinity` because the SSE wikiDocumentChanged subscription is
// the single source of truth for invalidation — without that, branches would
// background-refetch on every window focus and add traffic the sidebar
// doesn't actually need.
export function useWikiDocumentChildren(
  operationId: string,
  parentDocumentId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: wikiKeys.children(operationId, parentDocumentId),
    queryFn: () =>
      graphqlClient(WikiDocumentChildrenDocument, {
        operationId,
        parentDocumentId,
      }),
    enabled: !!operationId && (options?.enabled ?? true),
    staleTime: Infinity,
  })
}

// Returns every row needed to expand the sidebar down to documentId, then
// shreds the response into per-parent `children` cache entries so the lazy
// nodes that follow are cache hits — no extra round trips per ancestor level.
//
// Returns the ancestor IDs (root → target's parent) so the page can call
// expandMany() once with no follow-up walking.
export function useWikiDocumentTreeRevealPath(
  documentId: string,
  operationId: string,
) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: wikiKeys.revealPath(documentId),
    queryFn: async () => {
      const result = await graphqlClient(WikiDocumentTreeRevealPathDocument, {
        documentId,
      })
      const rows = result.wikiDocumentTreeRevealPath

      // Group by parentDocumentId and seed each per-parent cache entry. The
      // shape must match what useWikiDocumentChildren produces, so the
      // ChildrenQuery envelope name (`wikiDocumentChildren`) is what consumers
      // read.
      const byParent = new Map<string | null, WikiDocumentTreeFieldsFragment[]>()
      for (const row of rows) {
        const pid = row.parentDocumentId ?? null
        const arr = byParent.get(pid) ?? []
        arr.push(row)
        byParent.set(pid, arr)
      }
      for (const [pid, list] of byParent) {
        list.sort((a, b) =>
          a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0,
        )
        queryClient.setQueryData<WikiDocumentChildrenQuery>(
          wikiKeys.children(operationId, pid),
          { wikiDocumentChildren: list },
        )
      }

      // Compute the ancestor chain that the sidebar needs to auto-expand.
      // Walk parent pointers upward from the target's parent (the target
      // itself doesn't need to be expanded — its parent does).
      const byId = new Map(rows.map((r) => [r.id, r]))
      const ancestorIds: string[] = []
      const target = rows.find((r) => r.id === documentId)
      let cursor = target?.parentDocumentId ?? null
      const seen = new Set<string>()
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor)
        ancestorIds.push(cursor)
        const parent = byId.get(cursor)
        cursor = parent?.parentDocumentId ?? null
      }

      return { rows, ancestorIds }
    },
    enabled: !!documentId && !!operationId,
    staleTime: Infinity,
  })
}

// Cheap count for the trash badge. Pure scalar — no list fetch.
export function useWikiDocumentTrashCount(operationId: string) {
  return useQuery({
    queryKey: wikiKeys.trashCount(operationId),
    queryFn: () =>
      graphqlClient(WikiDocumentTrashCountDocument, { operationId }),
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

// Lightweight per-document hook used by inline /doc chips. A page can cite
// the same doc many times — all chips for the same id share one cache entry,
// so render cost stays flat. Long staleTime because chip data (title, icon)
// changes rarely; live updates flow in via the wikiDocumentChanged subscription.
export function useWikiDocumentLite(documentId: string) {
  return useQuery({
    queryKey: wikiKeys.lite(documentId),
    queryFn: () => graphqlClient(WikiDocumentLiteDocument, { id: documentId }),
    enabled: !!documentId,
    staleTime: 30_000,
  })
}

// Documents that reference this one via inline /doc chips. Trashed referrers
// and self-references are filtered server-side.
export function useWikiDocumentBacklinks(documentId: string) {
  return useQuery({
    queryKey: wikiKeys.backlinks(documentId),
    queryFn: () =>
      graphqlClient(WikiDocumentBacklinksDocument, { documentId }),
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

// History is loaded in one shot (capped at 300 entries server-side) so
// useQuery is sufficient — no infinite scroll needed. `enabled` lets callers
// defer the fetch until the dropdown is opened, so closed-dropdown users
// pay zero round-trips.
export function useWikiDocumentHistory(operationId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: wikiKeys.history(operationId),
    queryFn: () =>
      graphqlClient(WikiDocumentHistoryDocument, { operationId, offset: 0, limit: 300 }),
    enabled: !!operationId && (options?.enabled ?? true),
    staleTime: 30_000,
  })
}

// --- Mutations ---

// --- SSE-owned mutations ---
//
// Each mutation in this block publishes a wikiDocumentChanged event
// server-side. The actor receives the event back over SSE and
// useWikiDocumentChangedSubscription invalidates every affected query in
// one place. Adding onSuccess invalidation here would just duplicate
// refetches (the SSE event arrives ~25 ms after the mutation response).
//
// Backup CRUD and visit-tracking mutations further down do NOT publish a
// wikiDocumentChanged event — they keep their own onSuccess invalidation.

export function useCreateWikiDocument() {
  return useMutation({
    mutationFn: (vars: { operationId: string; input: CreateWikiDocumentInput }) =>
      graphqlClient(CreateWikiDocumentDocument, vars),
  })
}

export function useUpdateWikiDocument() {
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateWikiDocumentInput }) =>
      graphqlClient(UpdateWikiDocumentDocument, vars),
  })
}

// Bulk sibling reorder — preferred over N parallel UpdateWikiDocument calls
// from the DnD flow. The server publishes one wikiDocumentChanged event per
// affected parent bucket, so a same-subtree reorder triggers exactly one
// invalidation wave on the actor instead of one per row.
export function useReorderWikiDocumentSiblings() {
  return useMutation({
    mutationFn: (vars: { input: ReorderWikiDocumentSiblingsInput }) =>
      graphqlClient(ReorderWikiDocumentSiblingsDocument, vars),
  })
}

export function useDeleteWikiDocument() {
  return useMutation({
    mutationFn: (id: string) =>
      graphqlClient(DeleteWikiDocumentDocument, { id }),
  })
}

export function useRestoreWikiDocument() {
  return useMutation({
    mutationFn: (vars: { id: string; cascade?: boolean }) =>
      graphqlClient(RestoreWikiDocumentDocument, {
        id: vars.id,
        cascade: vars.cascade ?? false,
      }),
  })
}

export function usePermanentlyDeleteWikiDocument() {
  return useMutation({
    mutationFn: (id: string) =>
      graphqlClient(PermanentlyDeleteWikiDocumentDocument, { id }),
  })
}

export function useEmptyWikiDocumentTrash() {
  return useMutation({
    mutationFn: (operationId: string) =>
      graphqlClient(EmptyWikiDocumentTrashDocument, { operationId }),
  })
}

// --- Self-invalidating mutations ---
//
// These mutations do not publish a wikiDocumentChanged event, so the SSE
// subscription cannot refresh their derived caches. They invalidate locally.

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
      // detail/lite/tree are refreshed by the wikiDocumentChanged SSE event
      // (the restore publishes wiki.document.updated). The backup list has
      // no event of its own, so refresh it here — a restore typically also
      // creates a pre-restore safety backup, which should appear immediately.
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

// Records (or refreshes) a visit. Best-effort: we don't surface failures —
// history is a convenience feature and a missed visit is fine. On success we
// invalidate every operation's history cache so the next dropdown open shows
// the new top entry.
export function useTrackWikiDocumentVisit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { documentId: string }) =>
      graphqlClient(TrackWikiDocumentVisitDocument, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.histories() })
    },
  })
}

// --- Subscriptions ---

/**
 * Subscribe to real-time document change events via SSE.
 *
 * This is the single source of cache invalidation for every wiki document
 * mutation that publishes a wikiDocumentChanged event server-side (create,
 * update, soft-delete, restore, hard-delete, empty-trash, restore-backup).
 * The actor receives their own event because the backend filter passes
 * self-authored events through (see core/pkg/graphql/resolver/subscription_helpers.go).
 *
 * Mutations that do NOT publish a wikiDocumentChanged event (backup CRUD,
 * visit tracking) keep their own onSuccess invalidation.
 */
export function useWikiDocumentChangedSubscription(operationId: string) {
  const queryClient = useQueryClient()

  useSubscription(WikiDocumentChangedDocument, { operationId }, {
    onData: (data) => {
      const {
        action,
        documentId,
        document,
        parentDocumentId,
        previousParentDocumentId,
      } = data.wikiDocumentChanged

      // DELETED is special: drop per-document caches outright AND invalidate
      // the trash list and badge so the row reappears (soft-delete) or
      // vanishes (hard-delete + empty-trash). The reverse path (restore)
      // sends action=CREATED, so trash/trashCount also flip there.
      if (action === "DELETED") {
        queryClient.removeQueries({ queryKey: wikiKeys.detail(documentId) })
        queryClient.removeQueries({ queryKey: wikiKeys.lite(documentId) })
        queryClient.removeQueries({ queryKey: wikiKeys.backups(documentId) })
        queryClient.removeQueries({ queryKey: wikiKeys.trashedDescendants(documentId) })
        queryClient.invalidateQueries({ queryKey: wikiKeys.trash(operationId) })
        queryClient.invalidateQueries({ queryKey: wikiKeys.trashCount(operationId) })
      } else if (document) {
        // Seed detail cache on create/update so navigating to the doc is instant.
        queryClient.invalidateQueries({ queryKey: wikiKeys.detail(documentId) })
        queryClient.invalidateQueries({ queryKey: wikiKeys.lite(documentId) })
      }

      // Tree query — the move dialog and other full-tree consumers depend on
      // it. Always refresh on document CRUD; invalidating an unmounted query
      // is a no-op.
      queryClient.invalidateQueries({ queryKey: wikiKeys.tree(operationId) })

      // Lazy sidebar — surgically invalidate only the affected per-parent
      // children buckets. Previously this refetched every expanded folder in
      // the op (~15 queries per event in the production HAR); with the new
      // event payload we know exactly which buckets need to refresh.
      const targetParent: string | null = parentDocumentId ?? null
      queryClient.invalidateQueries({
        queryKey: wikiKeys.children(operationId, targetParent),
      })
      if (previousParentDocumentId !== null && previousParentDocumentId !== undefined) {
        const previousParent: string | null = previousParentDocumentId
        if (previousParent !== targetParent) {
          queryClient.invalidateQueries({
            queryKey: wikiKeys.children(operationId, previousParent),
          })
        }
      }

      // Cross-feature caches — only the actions that can actually change
      // them. A sortOrder/parent change (UPDATED) doesn't touch trash,
      // backlinks, history, or paginated lists.
      if (action === "CREATED") {
        // Restore-from-trash and create-document both surface as CREATED.
        // Restore flips the trash list + badge; both shift paginated lists
        // and history (CREATED is the only event flagged for new history
        // rows from track-visit).
        queryClient.invalidateQueries({ queryKey: wikiKeys.trash(operationId) })
        queryClient.invalidateQueries({ queryKey: wikiKeys.trashCount(operationId) })
        queryClient.invalidateQueries({ queryKey: wikiKeys.lists() })
        queryClient.invalidateQueries({ queryKey: wikiKeys.histories() })
        // Restoring a referenced doc can resurrect backlinks. Cap is ~5 open
        // documents per user so the fan-out stays cheap.
        queryClient.invalidateQueries({
          queryKey: [...wikiKeys.all, "backlinks"],
        })
      } else if (action === "DELETED") {
        // Soft/hard delete: paginated lists and backlinks can both change.
        queryClient.invalidateQueries({ queryKey: wikiKeys.lists() })
        queryClient.invalidateQueries({
          queryKey: [...wikiKeys.all, "backlinks"],
        })
      }
      // UPDATED (rename, recolor, sortOrder, reparent) does not touch
      // trash/backlinks/history/lists. Skipping those invalidations is the
      // bulk of the win in the drag-reorder hot path.
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
