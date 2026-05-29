import { PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { TaskBacklinkList } from "@/components/tasks/task-backlink-list"
import { openTaskPicker } from "@/components/tasks/task-picker-dialog"
import {
  useTasksReferencingWikiDocument,
  useTaskChangedSubscription,
  useAddTaskWikiReference,
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
 *
 * Add affordance: the `+` button in the section header opens the global
 * task picker. On pick the current document is appended to the chosen
 * task's wiki references via the atomic addTaskWikiReference mutation.
 * Already-linked tasks render disabled in the picker (the excludeIds set
 * is built from this list's current rows).
 */
export function WikiTaskBacklinkList({
  documentId,
  operationId,
}: WikiTaskBacklinkListProps) {
  const { data, isLoading } = useTasksReferencingWikiDocument(documentId)
  const openEditDialog = useTaskStore((s) => s.openEditDialog)
  const addRef = useAddTaskWikiReference()
  const tasks = data?.tasksReferencingWikiDocument ?? []

  useTaskChangedSubscription(operationId)

  function handleAdd() {
    openTaskPicker({
      operationId,
      excludeIds: tasks.map((t) => t.id),
      title: "Link this document to a task",
      description:
        "Pick a task in this operation. The current document will be added to its references.",
      onPick: (task) => {
        addRef.mutate(
          { taskId: task.id, wikiId: documentId },
          {
            onSuccess: () => {
              toast.success(`Linked to “${task.name || "Untitled"}”`)
            },
            onError: (err) => {
              toast.error(
                err instanceof Error
                  ? err.message
                  : "Failed to link document to task",
              )
            },
          },
        )
      },
    })
  }

  // Render the `+` trigger even on an empty list — TaskBacklinkList treats
  // headerAction as an implicit showWhenEmpty, so an unlinked document
  // still surfaces the affordance.
  const headerAction = (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={handleAdd}
            aria-label="Add this document to a task"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            disabled={addRef.isPending}
          />
        }
      >
        <PlusIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>Add to task</TooltipContent>
    </Tooltip>
  )

  return (
    <TaskBacklinkList
      tasks={tasks}
      isLoading={isLoading}
      onTaskClick={(task) => openEditDialog({ id: task.id, name: task.name })}
      headerAction={headerAction}
    />
  )
}
