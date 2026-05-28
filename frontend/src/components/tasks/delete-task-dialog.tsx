import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useTaskStore } from "@/stores/tasks"
import { useDeleteTask } from "@/graphql/hooks/tasks"

export function DeleteTaskDialog() {
  const deleteDialogOpen = useTaskStore((s) => s.deleteDialogOpen)
  const closeDeleteDialog = useTaskStore((s) => s.closeDeleteDialog)
  const closeEditDialog = useTaskStore((s) => s.closeEditDialog)
  const selected = useTaskStore((s) => s.selected)
  const deleteTask = useDeleteTask()
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    if (!selected) return
    setError(null)
    try {
      await deleteTask.mutateAsync(selected.id)
      // The edit dialog may be stacked underneath (delete is reachable from
      // its footer); close it too so we don't leave a stale form bound to a
      // task that no longer exists.
      closeDeleteDialog()
      closeEditDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete task")
    }
  }

  return (
    <Dialog
      open={deleteDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          setError(null)
          closeDeleteDialog()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete task</DialogTitle>
          <DialogDescription>
            {selected
              ? `“${selected.name}” will move to the trash. You can restore it later.`
              : "This task will move to the trash."}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => closeDeleteDialog()}
            disabled={deleteTask.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleteTask.isPending}
          >
            {deleteTask.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
