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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useOperationStore } from "@/stores/operations"
import { useCreateOperation } from "@/graphql/hooks/operations"

export function CreateOperationDialog() {
  const { createDialogOpen, closeDialogs } = useOperationStore()
  const createOperation = useCreateOperation()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const form = new FormData(e.currentTarget)
    const name = form.get("name") as string
    const description = (form.get("description") as string) || undefined

    try {
      await createOperation.mutateAsync({ name, description })
      closeDialogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create operation")
    }
  }

  return (
    <Dialog
      open={createDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeDialogs()
          setError(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Operation</DialogTitle>
          <DialogDescription>
            Create a new operation. You will be added as its admin.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} autoComplete="off">
          <FieldGroup>
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <Field>
              <FieldLabel htmlFor="create-op-name">Name</FieldLabel>
              <Input
                id="create-op-name"
                name="name"
                type="text"
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="create-op-description">Description</FieldLabel>
              <Input
                id="create-op-description"
                name="description"
                type="text"
                placeholder="Optional"
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button
              type="submit"
              disabled={createOperation.isPending}
            >
              {createOperation.isPending ? "Creating..." : "Create Operation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
