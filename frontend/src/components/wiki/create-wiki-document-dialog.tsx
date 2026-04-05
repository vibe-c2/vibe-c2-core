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
import { EmojiPicker } from "@/components/wiki/emoji-picker"

interface CreateWikiDocumentDialogProps {
  operationId: string
}

export function CreateWikiDocumentDialog({ operationId }: CreateWikiDocumentDialogProps) {
  const { createDialogOpen, createParentId, closeCreateDialog } = useWikiStore()
  const expandNode = useWikiStore((s) => s.expandNode)
  const createDocument = useCreateWikiDocument()
  const navigate = useNavigate()

  const [error, setError] = useState<string | null>(null)
  const [emoji, setEmoji] = useState("")

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
          emoji: emoji || undefined,
          parentDocumentId: createParentId ?? undefined,
        },
      })
      // Expand parent so the new child is visible in the tree.
      if (createParentId) expandNode(createParentId)
      closeCreateDialog()
      setEmoji("")
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
          setEmoji("")
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
            <EmojiPicker emoji={emoji} onSelect={setEmoji} />
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
