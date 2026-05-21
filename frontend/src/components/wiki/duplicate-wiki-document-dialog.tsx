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
import { useDuplicateWikiDocument } from "@/graphql/hooks/wiki"

// Asks whether the user wants a shallow copy (document only) or a deep copy
// (document + all descendants). Only mounted for documents with children;
// leaf duplicates fire the mutation directly from the tree row without ever
// reaching this dialog.
export function DuplicateWikiDocumentDialog() {
  const { duplicateDialogOpen, duplicateTarget, closeDuplicateDialog } =
    useWikiStore()
  const duplicateDocument = useDuplicateWikiDocument()
  const [error, setError] = useState<string | null>(null)
  const [pendingMode, setPendingMode] = useState<"shallow" | "deep" | null>(
    null,
  )

  async function handleDuplicate(withChildren: boolean) {
    if (!duplicateTarget) return
    setError(null)
    setPendingMode(withChildren ? "deep" : "shallow")
    try {
      await duplicateDocument.mutateAsync({
        id: duplicateTarget.id,
        withChildren,
      })
      closeDuplicateDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate")
    } finally {
      setPendingMode(null)
    }
  }

  const childCount = duplicateTarget?.childCount ?? 0
  const isPending = duplicateDocument.isPending

  return (
    <Dialog
      open={duplicateDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeDuplicateDialog()
          setError(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate document</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">
              {duplicateTarget?.title}
            </span>{" "}
            has {childCount} {childCount === 1 ? "child" : "children"}. Do you
            want to copy the document on its own, or copy it together with its
            entire subtree?
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={closeDuplicateDialog}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => handleDuplicate(false)}
            disabled={isPending}
          >
            {pendingMode === "shallow" ? "Duplicating..." : "Document only"}
          </Button>
          <Button
            onClick={() => handleDuplicate(true)}
            disabled={isPending}
          >
            {pendingMode === "deep"
              ? "Duplicating..."
              : `With ${childCount} ${childCount === 1 ? "child" : "children"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
