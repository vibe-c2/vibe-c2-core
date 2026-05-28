import type { ReactNode } from "react"
import { toast } from "sonner"
import { LinkIcon, PencilIcon, TrashIcon } from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useTaskStore } from "@/stores/tasks"
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
