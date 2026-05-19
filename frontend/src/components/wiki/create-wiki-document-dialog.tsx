import { type FormEvent, useState } from "react"
import { useNavigate } from "react-router"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useWikiStore } from "@/stores/wiki"
import { useCreateWikiDocument } from "@/graphql/hooks/wiki"
import {
  DocumentIconPicker,
  type DocumentIconValue,
} from "@/components/wiki/document-icon-picker"
import { ADAPTIVE_ICON_NAME } from "@/components/wiki/icon-catalog"

interface CreateWikiDocumentDialogProps {
  operationId: string
}

// Adaptive default: renders as a page icon on a leaf doc, swaps to a
// folder once children land. Picked here over the legacy "📂" emoji so a
// brand-new doc reads as a page until it actually nests.
const DEFAULT_ICON_VALUE: DocumentIconValue = {
  emoji: "",
  icon: ADAPTIVE_ICON_NAME,
  color: "",
}

export function CreateWikiDocumentDialog({ operationId }: CreateWikiDocumentDialogProps) {
  const { createDialogOpen, createParentId, closeCreateDialog } = useWikiStore()
  const expandNode = useWikiStore((s) => s.expandNode)
  const setPendingFocusDocId = useWikiStore((s) => s.setPendingFocusDocId)
  const createDocument = useCreateWikiDocument()
  const navigate = useNavigate()

  const [error, setError] = useState<string | null>(null)
  const [iconValue, setIconValue] = useState<DocumentIconValue>(DEFAULT_ICON_VALUE)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const form = new FormData(e.currentTarget)
    const title = (form.get("title") as string).trim()

    if (!title) return

    try {
      const result = await createDocument.mutateAsync({
        operationId,
        input: {
          title,
          emoji: iconValue.emoji || undefined,
          icon: iconValue.icon || undefined,
          color: iconValue.color || undefined,
          parentDocumentId: createParentId ?? undefined,
        },
      })
      // Expand parent so the new child is visible in the tree.
      if (createParentId) expandNode(createParentId)
      closeCreateDialog()
      setIconValue(DEFAULT_ICON_VALUE)
      // One-shot signal — the editor reads + clears this when it mounts for
      // the new doc, so the caret lands inside the empty body without the
      // user needing to click.
      setPendingFocusDocId(result.createWikiDocument.id)
      navigate(`/wiki/${result.createWikiDocument.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create document")
    }
  }

  return (
    <Dialog
      open={createDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeCreateDialog()
          setError(null)
          setIconValue(DEFAULT_ICON_VALUE)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Document</DialogTitle>
          <DialogDescription>
            Create a new wiki document
            {createParentId ? " as a child of the selected document" : ""}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="flex items-center gap-2">
            <DocumentIconPicker value={iconValue} onSelect={setIconValue} />
            <Input
              name="title"
              placeholder="Document title"
              required
              autoFocus
              maxLength={200}
              className="flex-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={closeCreateDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={createDocument.isPending}>
              {createDocument.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
