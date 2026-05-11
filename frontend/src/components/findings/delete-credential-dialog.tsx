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
import { useCredentialStore } from "@/stores/credentials"
import { useDeleteCredential } from "@/graphql/hooks/credentials"

export function DeleteCredentialDialog() {
  const { deleteDialogOpen, selected, closeDeleteDialog } = useCredentialStore()
  const deleteCredential = useDeleteCredential()
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!selected) return
    setError(null)
    try {
      await deleteCredential.mutateAsync(selected.id)
      closeDeleteDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete credential")
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete credential</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">
              {selected?.name}
            </span>
            ? This will remove all of its comments as well. This action cannot be undone.
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
            disabled={deleteCredential.isPending}
          >
            {deleteCredential.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
