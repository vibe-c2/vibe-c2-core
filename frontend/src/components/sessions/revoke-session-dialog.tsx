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
import { useSessionStore } from "@/stores/sessions"
import { useRevokeSession, useAdminRevokeSession } from "@/graphql/hooks/sessions"

export function RevokeSessionDialog() {
  const { revokeDialogOpen, selectedSessionId, revokeIsAdmin, closeRevokeDialog } = useSessionStore()
  const revokeSession = useRevokeSession()
  const adminRevokeSession = useAdminRevokeSession()
  const [error, setError] = useState<string | null>(null)

  const mutation = revokeIsAdmin ? adminRevokeSession : revokeSession

  async function handleRevoke() {
    if (!selectedSessionId) return
    setError(null)

    try {
      await mutation.mutateAsync(selectedSessionId)
      closeRevokeDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke session")
    }
  }

  return (
    <Dialog
      open={revokeDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeRevokeDialog()
          setError(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke Session</DialogTitle>
          <DialogDescription>
            Are you sure you want to revoke this session? The user will be
            logged out on that device.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={closeRevokeDialog}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleRevoke}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Revoking..." : "Revoke"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
