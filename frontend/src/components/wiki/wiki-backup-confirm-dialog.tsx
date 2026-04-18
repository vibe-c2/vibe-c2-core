import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useWikiStore, type BackupConfirmTarget } from "@/stores/wiki"
import {
  useRestoreWikiDocumentBackup,
  useDeleteWikiDocumentBackup,
} from "@/graphql/hooks/wiki"
import { relativeTime } from "@/lib/relative-time"

// Single dialog that handles both restore and delete. The action + all
// display context are carried on the store target so the dialog can show
// a specific, contextful message without any extra fetches.
export function WikiBackupConfirmDialog() {
  const { backupConfirmTarget, closeBackupConfirm, closeBackupPreview } = useWikiStore()
  const restore = useRestoreWikiDocumentBackup()
  const del = useDeleteWikiDocumentBackup()
  const [error, setError] = useState<string | null>(null)

  const pending = restore.isPending || del.isPending
  const target = backupConfirmTarget
  const isRestore = target?.action === "restore"

  function close() {
    closeBackupConfirm()
    setError(null)
  }

  async function handleConfirm() {
    if (!target) return
    setError(null)
    try {
      if (target.action === "restore") {
        await restore.mutateAsync({ documentId: target.documentId, backupId: target.backupId })
        closeBackupPreview()
        toast.success("Backup restored")
      } else {
        await del.mutateAsync({ id: target.backupId, documentId: target.documentId })
        toast.success("Backup deleted")
      }
      close()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isRestore
            ? "Failed to restore backup"
            : "Failed to delete backup",
      )
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isRestore ? "Restore from Backup" : "Delete Backup"}</DialogTitle>
          <DialogDescription>
            {isRestore
              ? "Replace the current content with the snapshot from"
              : "Permanently remove the snapshot from"}{" "}
            <BackupLabel target={target} />?
          </DialogDescription>
          <p className="text-xs text-muted-foreground">
            {isRestore
              ? "A safety snapshot of the current content will be created automatically before the restore, so you can roll back."
              : "This cannot be undone."}
          </p>
        </DialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={isRestore ? "default" : "destructive"}
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending
              ? isRestore
                ? "Restoring..."
                : "Deleting..."
              : isRestore
                ? "Restore"
                : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BackupLabel({ target }: { target: BackupConfirmTarget | null }) {
  if (!target) return null
  const triggerLabel = target.trigger === "MANUAL" ? "manual" : "auto"
  return (
    <span className="font-medium text-foreground">
      {relativeTime(target.createdAt)} ({triggerLabel}
      {target.description ? ` — "${target.description}"` : ""})
    </span>
  )
}
