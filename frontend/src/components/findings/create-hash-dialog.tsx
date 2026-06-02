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
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useHashStore } from "@/stores/hashes"
import {
  useCreateHash,
  useHashTags,
  useMyHashTags,
} from "@/graphql/hooks/hashes"
import {
  OperationSinglePicker,
  type OperationSinglePickerValue,
} from "@/components/findings/operation-single-select"
import { TagComboboxInput } from "@/components/findings/tag-combobox-input"

interface CreateHashDialogProps {
  // Scoped mode: parent fixes the target operation. Global mode: omit so the
  // dialog renders an op picker (same pattern as CreateCredentialDialog).
  operationId?: string
}

interface HashFormValues {
  value: string
  comment: string
  tags: string[]
}

const emptyValues: HashFormValues = {
  value: "",
  comment: "",
  tags: [],
}

export function CreateHashDialog({ operationId }: CreateHashDialogProps) {
  const { createDialogOpen, closeCreateDialog } = useHashStore()
  const createHash = useCreateHash()
  const [values, setValues] = useState<HashFormValues>(emptyValues)
  const [error, setError] = useState<string | null>(null)
  const [pickedOp, setPickedOp] =
    useState<OperationSinglePickerValue | null>(null)

  const isGlobalMode = operationId === undefined
  const targetOpId = operationId ?? pickedOp?.id ?? null

  // Tag suggestions: scoped to the target op when known; otherwise fall back to
  // the caller's cross-op tag pool during global-mode composition. Mirrors the
  // pattern in CreateCredentialDialog.
  const scopedTags = useHashTags(targetOpId ?? "")
  const myTagsFallback = useMyHashTags(null, {
    enabled: isGlobalMode && !targetOpId,
  })
  const tagSuggestions = targetOpId
    ? scopedTags.data?.hashTags ?? []
    : myTagsFallback.data?.myHashTags ?? []
  const tagSuggestionsLoading = targetOpId
    ? scopedTags.isLoading
    : myTagsFallback.isLoading

  function reset() {
    setValues(emptyValues)
    setError(null)
    setPickedOp(null)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!targetOpId) {
      setError("Pick an operation to add this hash to.")
      return
    }
    try {
      await createHash.mutateAsync({
        operationId: targetOpId,
        input: {
          value: values.value.trim(),
          comment: values.comment.trim() || null,
          tags: values.tags,
        },
      })
      reset()
      closeCreateDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create hash")
    }
  }

  return (
    <Dialog
      open={createDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset()
          closeCreateDialog()
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add hash</DialogTitle>
          <DialogDescription>
            Record a single password hash. Use bulk import for many at once.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-3">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {isGlobalMode && (
            <div className="grid gap-1.5">
              <Label>Operation</Label>
              <OperationSinglePicker
                value={pickedOp}
                onChange={setPickedOp}
                placeholder="Pick the operation to add this hash to"
                className="w-full"
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="hash-value">Hash value</Label>
            <Textarea
              id="hash-value"
              value={values.value}
              onChange={(e) =>
                setValues((v) => ({ ...v, value: e.target.value }))
              }
              placeholder="aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0"
              rows={3}
              className="font-mono text-xs"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hash-comment">Comment</Label>
            <Textarea
              id="hash-comment"
              value={values.comment}
              onChange={(e) =>
                setValues((v) => ({ ...v, comment: e.target.value }))
              }
              placeholder="Free-form notes (source, context, etc.)"
              rows={3}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hash-tags-input">Tags</Label>
            <TagComboboxInput
              value={values.tags}
              onChange={(tags) => setValues((v) => ({ ...v, tags }))}
              suggestions={tagSuggestions}
              loading={tagSuggestionsLoading}
              inputId="hash-tags-input"
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                createHash.isPending || !values.value.trim() || !targetOpId
              }
            >
              {createHash.isPending ? "Saving..." : "Add hash"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
