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
import { useBulkImportHashes, useHashTags } from "@/graphql/hooks/hashes"
import { TagComboboxInput } from "@/components/findings/tag-combobox-input"

interface BulkImportDialogProps {
  operationId: string
}

export function BulkImportHashesDialog({ operationId }: BulkImportDialogProps) {
  const { bulkImportDialogOpen, closeBulkImportDialog } = useHashStore()
  const bulkImport = useBulkImportHashes()

  const [text, setText] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [comment, setComment] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(
    null,
  )

  const tagsQuery = useHashTags(operationId)
  const tagSuggestions = tagsQuery.data?.hashTags ?? []

  function reset() {
    setText("")
    setTags([])
    setComment("")
    setError(null)
    setResult(null)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setResult(null)
    const trimmed = text.trim()
    if (!trimmed) {
      setError("Paste at least one hash.")
      return
    }
    try {
      const data = await bulkImport.mutateAsync({
        operationId,
        input: {
          text: trimmed,
          tags,
          comment: comment.trim() || null,
        },
      })
      setResult({
        added: data.bulkImportHashes.added,
        skipped: data.bulkImportHashes.skipped,
      })
      // Keep dialog open so the user sees the summary; "Done" closes it.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk import failed")
    }
  }

  return (
    <Dialog
      open={bulkImportDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset()
          closeBulkImportDialog()
        }
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk import hashes</DialogTitle>
          <DialogDescription>
            One hash per line. Duplicates within the operation are silently
            skipped.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-3">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {result && (
            <div className="rounded-md bg-emerald-100 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              Imported <strong>{result.added}</strong> · skipped{" "}
              <strong>{result.skipped}</strong> duplicate
              {result.skipped === 1 ? "" : "s"}.
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="bulk-hash-text">Paste</Label>
            <Textarea
              id="bulk-hash-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="font-mono text-xs"
              placeholder={
                "31d6cfe0d16ae931b73c59d7e0c089c0\n8846f7eaee8fb117ad06bdd830b7586c"
              }
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bulk-hash-comment">Comment</Label>
            <Textarea
              id="bulk-hash-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Applied to every imported hash (source, context, etc.)"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bulk-hash-tags-input">Tags</Label>
            <TagComboboxInput
              value={tags}
              onChange={setTags}
              suggestions={tagSuggestions}
              loading={tagsQuery.isLoading}
              inputId="bulk-hash-tags-input"
            />
          </div>
          <DialogFooter>
            {result ? (
              <Button
                type="button"
                onClick={() => {
                  reset()
                  closeBulkImportDialog()
                }}
              >
                Done
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={bulkImport.isPending || !text.trim()}
              >
                {bulkImport.isPending ? "Importing..." : "Import"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
