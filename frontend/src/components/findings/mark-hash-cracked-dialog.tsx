import { useState } from "react"
import { KeyIcon, PlusIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CredentialCreateForm } from "@/components/findings/credential-create-form"
import { CredentialPickerList } from "@/components/findings/credential-picker-list"
import { useHashStore } from "@/stores/hashes"
import { useHash, useMarkHashCracked } from "@/graphql/hooks/hashes"
import { cn } from "@/lib/utils"

type Mode = "list" | "create"

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

  const [mode, setMode] = useState<Mode>("list")
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Reset transient state on every reopen so a stale create form / search
  // doesn't leak from the previous invocation.
  const [wasOpen, setWasOpen] = useState(markCrackedDialogOpen)
  if (wasOpen !== markCrackedDialogOpen) {
    setWasOpen(markCrackedDialogOpen)
    if (markCrackedDialogOpen) {
      setMode("list")
      setSearch("")
      setError(null)
    }
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
    <Dialog
      open={markCrackedDialogOpen}
      onOpenChange={(open) => {
        if (!open) closeMarkCrackedDialog()
      }}
    >
      <DialogContent
        className={cn(
          // Same width strategy as the wiki picker — list is dense, create
          // needs room for the two-column credential form.
          mode === "create" ? "sm:max-w-3xl" : "sm:max-w-xl",
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "create" ? (
              <PlusIcon className="size-4" />
            ) : (
              <KeyIcon className="size-4" />
            )}
            {mode === "create"
              ? "Create new credential"
              : "Mark hash as cracked"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a credential to this operation and link it to this hash."
              : "Pick a credential from this operation to link to this hash."}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {markCrackedDialogOpen && operationId ? (
          mode === "create" ? (
            <CredentialCreateForm
              operationId={operationId}
              initialName={search.trim()}
              idPrefix="mark-cracked-cred-create"
              submitLabel="Create & mark cracked"
              onCreated={linkCredential}
              onBack={() => setMode("list")}
            />
          ) : (
            <CredentialPickerList
              operationId={operationId}
              search={search}
              onSearchChange={setSearch}
              onPick={linkCredential}
              onStartCreate={() => setMode("create")}
            />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
