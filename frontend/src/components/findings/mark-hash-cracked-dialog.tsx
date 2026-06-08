import { useState } from "react"
import { CredentialPickerDialog } from "@/components/findings/credential-picker-dialog"
import { useHashStore } from "@/stores/hashes"
import { useHash, useMarkHashCracked } from "@/graphql/hooks/hashes"

export function MarkHashCrackedDialog() {
  const { markCrackedDialogOpen, closeMarkCrackedDialog, selected } =
    useHashStore()
  const mark = useMarkHashCracked()

  // The hash row is already cached from the list query, so this is a
  // synchronous read in practice. We only need operationId to scope the
  // credential picker.
  const { data: hashData } = useHash(selected?.id ?? "", {
    enabled: !!selected?.id && markCrackedDialogOpen,
  })
  const operationId = hashData?.hash?.operationId ?? ""

  const [error, setError] = useState<string | null>(null)

  // Clear any stale error on reopen so it doesn't leak from a prior attempt.
  const [wasOpen, setWasOpen] = useState(markCrackedDialogOpen)
  if (wasOpen !== markCrackedDialogOpen) {
    setWasOpen(markCrackedDialogOpen)
    if (markCrackedDialogOpen) setError(null)
  }

  async function linkCredential(credentialId: string) {
    if (!selected || mark.isPending) return
    setError(null)
    try {
      await mark.mutateAsync({
        id: selected.id,
        input: { credentialId, newCredential: null },
      })
      closeMarkCrackedDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark cracked")
    }
  }

  return (
    <CredentialPickerDialog
      open={markCrackedDialogOpen}
      onOpenChange={(open) => {
        if (!open) closeMarkCrackedDialog()
      }}
      operationId={operationId}
      title="Mark hash as cracked"
      description="Pick a credential from this operation to link to this hash."
      createDescription="Add a credential to this operation and link it to this hash."
      createSubmitLabel="Create & mark cracked"
      createIdPrefix="mark-cracked-cred-create"
      onPick={(c) => void linkCredential(c.id)}
      banner={
        error ? (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null
      }
    />
  )
}
