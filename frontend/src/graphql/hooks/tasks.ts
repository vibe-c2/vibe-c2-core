import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import { useSubscription } from "@/hooks/use-subscription"
import type {
  ChangeTaskStageInput,
  CreateTaskInput,
  TaskStage,
  UpdateTaskInput,
} from "@/graphql/gql/graphql"
import {
  TaskDocument,
  TasksDocument,
  TaskTrashDocument,
  CreateTaskDocument,
  UpdateTaskDocument,
  ChangeTaskStageDocument,
  SetTaskAssigneesDocument,
  SetTaskWikiReferencesDocument,
  SetTaskCredentialReferencesDocument,
  DeleteTaskDocument,
  RestoreTaskDocument,
  PurgeTaskDocument,
  TaskChangedDocument,
  TasksReferencingWikiDocumentDocument,
  TasksReferencingCredentialDocument,
} from "@/graphql/gql/graphql"

export type TaskListParams = {
  operationId: string
  stage?: TaskStage | null
  search?: string | null
  first?: number
}

export type TaskTrashParams = {
  operationId: string
  first?: number
}

// Query key factory — mirrors credentialKeys layout so the invalidation
// helpers in subscription handlers stay consistent across features.
export const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  infiniteList: (params: TaskListParams) =>
    [...taskKeys.lists(), "infinite", params] as const,
  trashLists: () => [...taskKeys.all, "trash"] as const,
  infiniteTrash: (params: TaskTrashParams) =>
    [...taskKeys.trashLists(), "infinite", params] as const,
  details: () => [...taskKeys.all, "detail"] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
  // Cross-domain reverse-reference queries. Keyed under their own prefix so
  // the subscription handler can broad-invalidate every active backlink list
  // in one call (a task mutation in the operation could affect any doc/cred
  // backlink set).
  wikiBacklinks: () => [...taskKeys.all, "wikiBacklinks"] as const,
  wikiBacklinksFor: (documentId: string) =>
    [...taskKeys.wikiBacklinks(), documentId] as const,
  credentialBacklinks: () => [...taskKeys.all, "credentialBacklinks"] as const,
  credentialBacklinksFor: (credentialId: string) =>
    [...taskKeys.credentialBacklinks(), credentialId] as const,
}

// --- Queries ---

export function useTask(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => graphqlClient(TaskDocument, { id }),
    enabled: !!id && (options?.enabled ?? true),
  })
}

// useInfiniteTasks pulls the active task list for an operation. The kanban
// view passes a `first` page size large enough that the whole operation
// usually fits in one page; the matrix view does the same. We keep cursor
// pagination wired for the rare large operation rather than capping the
// page server-side.
export function useInfiniteTasks(
  params: TaskListParams,
  options: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: taskKeys.infiniteList(params),
    queryFn: ({ pageParam }) =>
      graphqlClient(TasksDocument, {
        operationId: params.operationId,
        stage: params.stage ?? null,
        search: params.search ?? null,
        first: params.first ?? 100,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.tasks.pageInfo.hasNextPage
        ? lastPage.tasks.pageInfo.endCursor ?? undefined
        : undefined,
    enabled: !!params.operationId && (options.enabled ?? true),
  })
}

export function useInfiniteTaskTrash(
  params: TaskTrashParams,
  options: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: taskKeys.infiniteTrash(params),
    queryFn: ({ pageParam }) =>
      graphqlClient(TaskTrashDocument, {
        operationId: params.operationId,
        first: params.first ?? 50,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.taskTrash.pageInfo.hasNextPage
        ? lastPage.taskTrash.pageInfo.endCursor ?? undefined
        : undefined,
    enabled: !!params.operationId && (options.enabled ?? true),
  })
}

// useTasksReferencingWikiDocument fetches the active tasks that link to the
// given wiki document. Drives the "Task backlinks" section in the wiki editor
// footer. Live-updated through useTaskChangedSubscription, which invalidates
// the whole wikiBacklinks prefix on any task change in the operation.
export function useTasksReferencingWikiDocument(
  documentId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: taskKeys.wikiBacklinksFor(documentId),
    queryFn: () =>
      graphqlClient(TasksReferencingWikiDocumentDocument, { documentId }),
    enabled: !!documentId && (options?.enabled ?? true),
  })
}

// useTasksReferencingCredential is the credential counterpart — drives the
// "Referenced by tasks" section in the credential details dialog.
export function useTasksReferencingCredential(
  credentialId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: taskKeys.credentialBacklinksFor(credentialId),
    queryFn: () =>
      graphqlClient(TasksReferencingCredentialDocument, { credentialId }),
    enabled: !!credentialId && (options?.enabled ?? true),
  })
}

// --- Mutations ---

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      graphqlClient(CreateTaskDocument, { input }),
    onSuccess: (data) => {
      queryClient.setQueryData(taskKeys.detail(data.createTask.id), {
        task: data.createTask,
      })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateTaskInput }) =>
      graphqlClient(UpdateTaskDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(taskKeys.detail(vars.id), {
        task: data.updateTask,
      })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

// useChangeTaskStage is the kanban drag-drop mutation. The server rejects
// DONE without a terminal status; callers must open the status-required
// modal before retrying when that error surfaces. The error message
// includes "DONE requires status" so the UI can detect that branch.
//
// Optimistic update: the kanban board renders directly off this cache, so
// without an immediate write the source card flickers back into its old
// column for the duration of the round-trip before the refetch moves it.
// We patch every cached list page in place — flipping just `stage` on the
// matching node — then reconcile against the server result.
export function useChangeTaskStage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ChangeTaskStageInput) =>
      graphqlClient(ChangeTaskStageDocument, { input }),
    onMutate: async (input) => {
      // CRITICAL: apply the optimistic write synchronously BEFORE any
      // await. If we await cancelQueries first, React flushes the
      // post-drop render (overlay gone, source opacity restored) while
      // the cache still points the task at its old stage, painting one
      // frame in the wrong column before the cache update lands.
      const snapshots = queryClient.getQueriesData<{
        pages: Array<{
          tasks: {
            edges: Array<{ node: { id: string; stage: TaskStage } }>
          }
        }>
      }>({ queryKey: taskKeys.lists() })

      for (const [key, data] of snapshots) {
        if (!data) continue
        queryClient.setQueryData(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            tasks: {
              ...page.tasks,
              edges: page.tasks.edges.map((edge) =>
                edge.node.id === input.taskId
                  ? { ...edge, node: { ...edge.node, stage: input.stage } }
                  : edge,
              ),
            },
          })),
        })
      }

      await queryClient.cancelQueries({ queryKey: taskKeys.lists() })

      return { snapshots }
    },
    onError: (_err, _input, ctx) => {
      if (!ctx) return
      for (const [key, data] of ctx.snapshots) {
        queryClient.setQueryData(key, data)
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(taskKeys.detail(data.changeTaskStage.id), {
        task: data.changeTaskStage,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

export function useSetTaskAssignees() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { taskId: string; assigneeIds: string[] }) =>
      graphqlClient(SetTaskAssigneesDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(taskKeys.detail(vars.taskId), {
        task: data.setTaskAssignees,
      })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

export function useSetTaskWikiReferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { taskId: string; wikiIds: string[] }) =>
      graphqlClient(SetTaskWikiReferencesDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(taskKeys.detail(vars.taskId), {
        task: data.setTaskWikiReferences,
      })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

export function useSetTaskCredentialReferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { taskId: string; credentialIds: string[] }) =>
      graphqlClient(SetTaskCredentialReferencesDocument, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(taskKeys.detail(vars.taskId), {
        task: data.setTaskCredentialReferences,
      })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => graphqlClient(DeleteTaskDocument, { id }),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: taskKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      queryClient.invalidateQueries({ queryKey: taskKeys.trashLists() })
    },
  })
}

export function useRestoreTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => graphqlClient(RestoreTaskDocument, { id }),
    onSuccess: (data, id) => {
      queryClient.setQueryData(taskKeys.detail(id), {
        task: data.restoreTask,
      })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      queryClient.invalidateQueries({ queryKey: taskKeys.trashLists() })
    },
  })
}

export function usePurgeTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => graphqlClient(PurgeTaskDocument, { id }),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: taskKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: taskKeys.trashLists() })
    },
  })
}

// --- Subscription ---

// useTaskChangedSubscription wires the realtime kanban + matrix updates.
// Same shape as useCredentialChangedSubscription: hot-update the detail
// cache for non-DELETED events so an open dialog reflects the change
// without a follow-up query, then blanket-invalidate the lists so any
// open columns/matrix re-render.
//
// Trash lists are also invalidated because deletes flow through the same
// topic (soft-delete becomes DELETED action) — a deleted task should
// disappear from active lists and appear in trash without a refresh.
export function useTaskChangedSubscription(operationId: string) {
  const queryClient = useQueryClient()

  useSubscription(
    TaskChangedDocument,
    { operationId },
    {
      onData: (data) => {
        const { action, taskId, task } = data.taskChanged

        if (action === "DELETED") {
          queryClient.removeQueries({ queryKey: taskKeys.detail(taskId) })
        } else if (task) {
          queryClient.setQueryData(taskKeys.detail(taskId), { task })
        }

        queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
        queryClient.invalidateQueries({ queryKey: taskKeys.trashLists() })
        // Any task mutation in the op may add/remove the task from any
        // doc/credential backlink set. The reverse-reference arrays are not
        // in the event payload, so broad-invalidate instead of trying to
        // surgically patch — backlink lists are small (≤200) and per-doc.
        queryClient.invalidateQueries({ queryKey: taskKeys.wikiBacklinks() })
        queryClient.invalidateQueries({
          queryKey: taskKeys.credentialBacklinks(),
        })
      },
      enabled: !!operationId,
    },
  )
}
