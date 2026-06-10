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
import { useHostStore } from "@/stores/hosts"
import { useDeleteHost } from "@/graphql/hooks/hosts"

export function DeleteHostDialog() {
  const { deleteDialogOpen, closeDeleteDialog, selected } = useHostStore()
  const deleteHost = useDeleteHost()
  const [error, setError] = useState<string | null>(null)

  if (!selected) return null

  async function handleDelete() {
    if (!selected) return
    setError(null)
    try {
      await deleteHost.mutateAsync(selected.id)
      closeDeleteDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete host")
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
          <DialogTitle>Delete host</DialogTitle>
          <DialogDescription>
            Delete <strong>{selected.hostname}</strong>? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={closeDeleteDialog}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteHost.isPending}
          >
            {deleteHost.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
