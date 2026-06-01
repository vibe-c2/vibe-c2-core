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
import { useHashStore } from "@/stores/hashes"
import { useDeleteHash } from "@/graphql/hooks/hashes"

export function DeleteHashDialog() {
  const { deleteDialogOpen, closeDeleteDialog, selected } = useHashStore()
  const deleteHash = useDeleteHash()
  const [error, setError] = useState<string | null>(null)

  if (!selected) return null

  async function handleDelete() {
    if (!selected) return
    setError(null)
    try {
      await deleteHash.mutateAsync(selected.id)
      closeDeleteDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete hash")
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
          <DialogTitle>Delete hash</DialogTitle>
          <DialogDescription>
            Delete <strong>{selected.label}</strong>? This cannot be undone. Any
            wiki references to it will become inert.
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
            disabled={deleteHash.isPending}
          >
            {deleteHash.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
