import { type FormEvent, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useHostStore } from "@/stores/hosts"
import { useCreateHost, useUpdateHost } from "@/graphql/hooks/hosts"
import { HostFormFields } from "@/components/findings/host-form-fields"
import { HostImportStep } from "@/components/findings/host-import-step"
import {
  emptyHostFormValues,
  hostFormValuesFromWire,
  interfaceDraftsToInputs,
  routeDraftsToInputs,
  type HostFormValues,
} from "@/components/findings/host-drafts"
import type { HostFieldsFragment } from "@/graphql/gql/graphql"

interface HostFormDialogProps {
  operationId: string
}

// One dialog covers both create and edit (selected === null → create).
// Unlike credentials, create never needs an operation picker (the Hosts tab
// only exists scoped) and edit never needs a fetch (the row fragment already
// carries full interfaces/routes), so the two modes differ only in copy and
// which mutation fires.
export function HostFormDialog({ operationId }: HostFormDialogProps) {
  const { formDialogOpen, selected, closeFormDialog } = useHostStore()

  return (
    <Dialog
      open={formDialogOpen}
      onOpenChange={(open) => {
        if (!open) closeFormDialog()
      }}
    >
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)] max-h-[calc(100dvh-2rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{selected ? "Edit host" : "Add host"}</DialogTitle>
          <DialogDescription>
            {selected
              ? "Update hostname, OS, interfaces, and routes."
              : "Record a discovered machine — its interfaces and routes describe where it sits on the target network."}
          </DialogDescription>
        </DialogHeader>
        {/* Remount the form when the subject changes so its initial state
            re-seeds from the selected host (or resets for create). Avoids
            setState-in-effect. */}
        <HostForm
          key={selected?.id ?? "create"}
          operationId={operationId}
          host={selected}
          onSaved={closeFormDialog}
        />
      </DialogContent>
    </Dialog>
  )
}

interface HostFormProps {
  operationId: string
  host: HostFieldsFragment | null
  onSaved: () => void
}

function HostForm({ operationId, host, onSaved }: HostFormProps) {
  const createHost = useCreateHost()
  const updateHost = useUpdateHost()
  const [values, setValues] = useState<HostFormValues>(() =>
    host ? hostFormValuesFromWire(host) : emptyHostFormValues(),
  )
  const [error, setError] = useState<string | null>(null)
  // Two sub-views share one set of form values: the normal field editor and the
  // "Magic" command-output importer. The importer only patches `values` (one
  // category at a time) and hands control back; saving always happens from the
  // form view.
  const [step, setStep] = useState<"form" | "import">("form")

  const isPending = createHost.isPending || updateHost.isPending

  if (step === "import") {
    return (
      <HostImportStep
        onBack={() => setStep("form")}
        onApply={(patch) => {
          setValues((v) => ({ ...v, ...patch }))
          setStep("form")
        }}
      />
    )
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    // Always send the full lists (never omit): on update an omitted list
    // means "leave unchanged" server-side, which would make clearing the
    // last interface/route impossible.
    const input = {
      hostname: values.hostname.trim(),
      os: values.os.trim(),
      interfaces: interfaceDraftsToInputs(values.interfaces),
      routes: routeDraftsToInputs(values.routes),
    }
    try {
      if (host) {
        await updateHost.mutateAsync({ id: host.id, input })
      } else {
        await createHost.mutateAsync({ operationId, input })
      }
      onSaved()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : host
            ? "Failed to update host"
            : "Failed to create host",
      )
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      autoComplete="off"
      className="flex min-h-0 flex-col"
    >
      {/* Body scrolls; header (parent) and footer stay pinned. The negative
          inset + padding keeps focus rings from being clipped by overflow. */}
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {error && (
          <div className="mb-3 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {/* Shortcut past manual entry: paste `ip a` / `ip ro` output and let
            the importer fill the interfaces/routes editors below. The trigger
            lives next to each list's "Add" button (see HostFormFields). */}
        <HostFormFields
          idPrefix={host ? "edit-host" : "create-host"}
          values={values}
          onChange={setValues}
          onImport={() => setStep("import")}
        />
      </div>
      <DialogFooter className="mt-4">
        <Button
          type="submit"
          disabled={isPending || !values.hostname.trim()}
        >
          {isPending
            ? "Saving..."
            : host
              ? "Save changes"
              : "Create host"}
        </Button>
      </DialogFooter>
    </form>
  )
}
