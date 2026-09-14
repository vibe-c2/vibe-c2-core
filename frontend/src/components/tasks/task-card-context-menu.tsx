import type { ReactNode } from "react"
import { toast } from "sonner"
import { CheckCircle2Icon, LinkIcon, PencilIcon, TrashIcon, XCircleIcon } from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useTaskStore } from "@/stores/tasks"
import { useChangeTaskStage } from "@/graphql/hooks/tasks"
import { buildTaskShareUrl } from "@/components/tasks/task-share-link"
import type { TaskFieldsFragment } from "@/graphql/gql/graphql"

interface TaskCardContextMenuProps {
  task: TaskFieldsFragment
  children: ReactNode
}

// Right-click context menu wrapper for a kanban task card. Mirrors the
// credentials row menu pattern: copy share link, open edit dialog, open
// delete dialog. The trigger wraps the card so right-click anywhere on
// the card surface opens the menu.
export function TaskCardContextMenu({
  task,
  children,
}: TaskCardContextMenuProps) {
  const openEdit = useTaskStore((s) => s.openEditDialog)
  const openDelete = useTaskStore((s) => s.openDeleteDialog)
  const changeStage = useChangeTaskStage()

  // A closed task can have its outcome corrected from the board without
  // opening the dialog. This is an intra-Done status flip, so it keeps the
  // completion summary and time; we offer only the outcome the task isn't
  // already at. Not shown for tasks that aren't Done, or that somehow lack a
  // terminal status.
  const closedOutcome =
    task.stage === "DONE" && task.status !== "UNDEFINED" ? task.status : null

  async function setOutcome(status: "SUCCESS" | "FAIL") {
    try {
      await changeStage.mutateAsync({ taskId: task.id, stage: "DONE", status })
      toast.success(status === "SUCCESS" ? "Marked Success" : "Marked Fail")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update outcome")
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(buildTaskShareUrl(task.id))
      toast.success("Link copied")
    } catch {
      toast.error("Failed to copy link")
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={copyShareLink}>
          <LinkIcon className="size-4" />
          Copy link
        </ContextMenuItem>

        {closedOutcome === "FAIL" && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => setOutcome("SUCCESS")}>
              <CheckCircle2Icon className="size-4" />
              Mark as Success
            </ContextMenuItem>
          </>
        )}
        {closedOutcome === "SUCCESS" && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => setOutcome("FAIL")}>
              <XCircleIcon className="size-4" />
              Mark as Fail
            </ContextMenuItem>
          </>
        )}

        <ContextMenuSeparator />

        <ContextMenuItem
          onClick={() => openEdit({ id: task.id, name: task.name })}
        >
          <PencilIcon className="size-4" />
          Edit
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onClick={() => openDelete({ id: task.id, name: task.name })}
        >
          <TrashIcon className="size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
