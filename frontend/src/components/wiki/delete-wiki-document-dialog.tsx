import { useState } from "react"
import { useNavigate } from "react-router"
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
import { useDeleteWikiDocument } from "@/graphql/hooks/wiki"

interface DeleteWikiDocumentDialogProps {
  /** Currently selected document ID from URL. */
  documentId: string | null
}

export function DeleteWikiDocumentDialog({ documentId }: DeleteWikiDocumentDialogProps) {
  const { deleteDialogOpen, deleteTarget, closeDeleteDialog } = useWikiStore()
  const deleteDocument = useDeleteWikiDocument()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!deleteTarget) return
    setError(null)

    try {
      await deleteDocument.mutateAsync(deleteTarget.id)
      // If the deleted doc was the one open in the editor, clear the selection.
      if (deleteTarget.id === documentId) {
        navigate("/wiki", { replace: true })
      }
      closeDeleteDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document")
    }
  }

  return (
    <Dialog
      open={deleteDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeDeleteDialog()
          setError(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Document</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">
              {deleteTarget?.title}
            </span>
            ? This moves the document and its children to trash.
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
            disabled={deleteDocument.isPending}
          >
            {deleteDocument.isPending ? "Deleting..." : "Move to Trash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
