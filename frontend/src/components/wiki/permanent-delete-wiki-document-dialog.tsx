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
import { useWikiStore } from "@/stores/wiki"
import { usePermanentlyDeleteWikiDocument } from "@/graphql/hooks/wiki"

export function PermanentDeleteWikiDocumentDialog() {
  const {
    permanentDeleteDialogOpen,
    permanentDeleteTarget,
    closePermanentDeleteDialog,
  } = useWikiStore()
  const permanentlyDelete = usePermanentlyDeleteWikiDocument()
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!permanentDeleteTarget) return
    setError(null)

    try {
      await permanentlyDelete.mutateAsync(permanentDeleteTarget.id)
      closePermanentDeleteDialog()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to permanently delete document",
      )
    }
  }

  return (
    <Dialog
      open={permanentDeleteDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closePermanentDeleteDialog()
          setError(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permanently Delete</DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete{" "}
            <span className="font-medium text-foreground">
              {permanentDeleteTarget?.title}
            </span>
            ? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={closePermanentDeleteDialog}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={permanentlyDelete.isPending}
          >
            {permanentlyDelete.isPending ? "Deleting..." : "Delete Forever"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
