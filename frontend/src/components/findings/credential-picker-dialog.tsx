import { useState, type ReactNode } from "react"
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
import type { CredentialFieldsFragment } from "@/graphql/gql/graphql"
import { cn } from "@/lib/utils"

/**
 * Shared "pick or create a credential" modal. One dialog shell wraps the
 * searchable {@link CredentialPickerList} and the inline {@link CredentialCreateForm},
 * toggling between them with a "Create new credential" footer. Used by every
 * surface that links a credential — the wiki "Insert credential reference"
 * slash command, the findings "Mark hash as cracked" dialog, and the task
 * relations credential picker — so the rows, search, keyboard model, and create flow are
 * identical everywhere.
 *
 * Both an existing-row pick and a freshly-created credential funnel through the
 * single `onPick` callback, which receives the full credential node. Callers
 * decide what to do next (insert a reference, link a hash, add a chip) and
 * whether to close: every current caller closes from inside `onPick`, but a
 * multi-select caller could leave it open and pass `excludeIds` so the
 * just-picked row drops out of the list.
 */
interface CredentialPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  operationId: string
  /** Header title + description shown while browsing the list. */
  title: string
  description: string
  /** Header description shown while filling out the create form. */
  createDescription: string
  /** Submit button label on the create form, e.g. "Create & link". */
  createSubmitLabel: string
  /** Stable DOM id prefix for the create form fields (avoids id collisions). */
  createIdPrefix: string
  /** Fired for BOTH an existing-row pick and a freshly-created credential. */
  onPick: (credential: CredentialFieldsFragment) => void
  /** Rows to hide — e.g. credentials already linked in a multi-select caller. */
  excludeIds?: ReadonlySet<string>
  /** Optional banner rendered under the header — e.g. a caller mutation error. */
  banner?: ReactNode
}

type Mode = "list" | "create"

export function CredentialPickerDialog({
  open,
  onOpenChange,
  operationId,
  title,
  description,
  createDescription,
  createSubmitLabel,
  createIdPrefix,
  onPick,
  excludeIds,
  banner,
}: CredentialPickerDialogProps) {
  const [mode, setMode] = useState<Mode>("list")
  // Hoisted so the create view can pre-fill its `name` from whatever the
  // operator was searching for when they hit "Create new credential".
  const [search, setSearch] = useState("")

  // Reset transient UI on every reopen so a stale create form / search doesn't
  // leak in from the previous invocation.
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setMode("list")
      setSearch("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // List mode is dense — search input + a scroll list fits at xl.
          // Create mode swaps in the credential form whose two-column rows
          // need ~3xl to avoid collapsing to a single column on desktop.
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
            {mode === "create" ? "Create new credential" : title}
          </DialogTitle>
          <DialogDescription>
            {mode === "create" ? createDescription : description}
          </DialogDescription>
        </DialogHeader>
        {banner}
        {open && operationId ? (
          mode === "create" ? (
            <CredentialCreateForm
              operationId={operationId}
              initialName={search.trim()}
              idPrefix={createIdPrefix}
              submitLabel={createSubmitLabel}
              onCreated={(credential) => {
                // Back to the list first so a multi-select caller that stays
                // open lands on the browse view rather than a blank form.
                setMode("list")
                onPick(credential)
              }}
              onBack={() => setMode("list")}
            />
          ) : (
            <CredentialPickerList
              operationId={operationId}
              search={search}
              onSearchChange={setSearch}
              onPick={onPick}
              excludeIds={excludeIds}
              onStartCreate={() => setMode("create")}
            />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
