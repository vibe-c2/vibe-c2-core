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
import { useOperation, useUpdateOperation } from "@/graphql/hooks/operations"

export function EditOperationDialog() {
  const { editDialogOpen, selectedOperation, closeDialogs } = useOperationStore()
  const { data, isLoading } = useOperation(selectedOperation?.id ?? "")
  const updateOperation = useUpdateOperation()
  const [error, setError] = useState<string | null>(null)

  const operation = data?.operation

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedOperation) return
    setError(null)

    const form = new FormData(e.currentTarget)
    const name = form.get("name") as string
    const description = form.get("description") as string

    try {
      await updateOperation.mutateAsync({
        id: selectedOperation.id,
        input: { name, description },
      })
      closeDialogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update operation")
    }
  }

  return (
    <Dialog
      open={editDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeDialogs()
          setError(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Operation</DialogTitle>
          <DialogDescription>
            Update operation details.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !operation ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <form onSubmit={handleSubmit} key={operation.id}>
            <FieldGroup>
              {error && (
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <Field>
                <FieldLabel htmlFor="edit-op-name">Name</FieldLabel>
                <Input
                  id="edit-op-name"
                  name="name"
                  type="text"
                  required
                  defaultValue={operation.name}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-op-description">Description</FieldLabel>
                <Input
                  id="edit-op-description"
                  name="description"
                  type="text"
                  defaultValue={operation.description}
                />
              </Field>
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button
                type="submit"
                disabled={updateOperation.isPending}
              >
                {updateOperation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
