import { TaskBacklinkList } from "@/components/tasks/task-backlink-list"
import {
  useTasksReferencingWikiDocument,
  useTaskChangedSubscription,
} from "@/graphql/hooks/tasks"
import { useTaskStore } from "@/stores/tasks"

interface WikiTaskBacklinkListProps {
  documentId: string
  operationId: string
}

/**
 * Renders the "Task backlinks" footer block — sibling to the doc → doc
 * backlinks and the sub-pages list. Lists every active task in the same
 * operation that links to this document via its `wikiReferences` array.
 *
 * Click semantics mirror the wiki credential chip: the row opens the global
 * EditTaskDialog (mounted in AppLayout) without navigating away from the
 * wiki page. The dialog is store-driven, so the operator stays in context.
 *
 * Real-time updates come from `useTaskChangedSubscription` scoped to the
 * document's operation. The subscription handler invalidates the entire
 * `wikiBacklinks` query prefix on any task change in the op — the
 * reverse-reference arrays aren't on the event payload, so broad-invalidate
 * beats trying to surgically patch each per-document cache entry.
 */
export function WikiTaskBacklinkList({
  documentId,
  operationId,
}: WikiTaskBacklinkListProps) {
  const { data, isLoading } = useTasksReferencingWikiDocument(documentId)
  const openEditDialog = useTaskStore((s) => s.openEditDialog)
  const tasks = data?.tasksReferencingWikiDocument ?? []

  // Subscribe so a task gaining or losing this doc as a reference, or being
  // soft-deleted, refreshes the list without the operator reloading the page.
  // Scoped to the document's operation — the wiki page itself does not
  // otherwise subscribe to task events.
  useTaskChangedSubscription(operationId)

  return (
    <TaskBacklinkList
      tasks={tasks}
      isLoading={isLoading}
      onTaskClick={(task) => openEditDialog({ id: task.id, name: task.name })}
    />
  )
}
