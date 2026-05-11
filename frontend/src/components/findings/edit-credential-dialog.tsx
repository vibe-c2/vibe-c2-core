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
import { Switch } from "@/components/ui/switch"
import { useCredentialStore } from "@/stores/credentials"
import {
  useCredential,
  useUpdateCredential,
} from "@/graphql/hooks/credentials"
import {
  CredentialFormFields,
  type CredentialFormValues,
} from "@/components/findings/credential-form-fields"
import {
  keyDraftsFromWire,
  keyDraftsToInputs,
} from "@/components/findings/credential-key-drafts"
import type { CredentialFieldsFragment } from "@/graphql/gql/graphql"

export function EditCredentialDialog() {
  const { editDialogOpen, selected, closeEditDialog } = useCredentialStore()
  const { data, isLoading } = useCredential(selected?.id ?? "")
  const credential = data?.credential

  return (
    <Dialog
      open={editDialogOpen}
      onOpenChange={(open) => {
        if (!open) closeEditDialog()
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit credential</DialogTitle>
          <DialogDescription>
            Update credential details, tags, and validity.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !credential ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          // Remount the form on credential id change so its initial state
          // re-seeds from the freshly loaded entity. Avoids setState-in-effect.
          <EditCredentialForm
            key={credential.id}
            credential={credential}
            onSaved={closeEditDialog}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface EditCredentialFormProps {
  credential: CredentialFieldsFragment
  onSaved: () => void
}

function EditCredentialForm({ credential, onSaved }: EditCredentialFormProps) {
  const updateCredential = useUpdateCredential()
  const [values, setValues] = useState<CredentialFormValues>({
    name: credential.name,
    type: credential.type,
    username: credential.username,
    password: credential.password,
    keys: keyDraftsFromWire(credential.keys),
    isValid: credential.isValid,
    tags: credential.tags,
  })
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    try {
      await updateCredential.mutateAsync({
        id: credential.id,
        input: {
          name: values.name,
          type: values.type,
          username: values.username,
          password: values.password,
          keys: keyDraftsToInputs(values.keys),
          isValid: values.isValid,
          tags: values.tags,
        },
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update credential")
    }
  }

  return (
    <form onSubmit={handleSubmit} autoComplete="off">
      {error && (
        <div className="mb-3 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <CredentialFormFields
        idPrefix="edit-cred"
        values={values}
        onChange={setValues}
      />
      <DialogFooter className="mt-4 flex-row items-center justify-between sm:justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch
            checked={values.isValid}
            onCheckedChange={(checked) =>
              setValues((v) => ({ ...v, isValid: checked }))
            }
          />
          <span>Mark as valid</span>
        </label>
        <Button
          type="submit"
          disabled={updateCredential.isPending || !values.name.trim()}
        >
          {updateCredential.isPending ? "Saving..." : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  )
}
