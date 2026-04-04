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
import { useOperationStore } from "@/stores/operations"
import { useDeleteOperation } from "@/graphql/hooks/operations"

export function DeleteOperationDialog() {
  const { deleteDialogOpen, selectedOperation, closeDialogs } = useOperationStore()
  const deleteOperation = useDeleteOperation()
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!selectedOperation) return
    setError(null)

    try {
      await deleteOperation.mutateAsync(selectedOperation.id)
      closeDialogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete operation")
    }
  }

  return (
    <Dialog
      open={deleteDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeDialogs()
          setError(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Operation</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">
              {selectedOperation?.name}
            </span>
            ? This will remove all members and associated data. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={closeDialogs}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteOperation.isPending}
          >
            {deleteOperation.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
