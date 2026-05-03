// Dialog for importing an Outline (getoutline.com) workspace export.
//
// The whole flow is server-side: this dialog uploads the zip, the backend
// parses it, ingests attachments, and calls the Hocuspocus sidecar to seed
// each imported document's Y.js content_state. We just show progress and
// the per-import report. See docs/wiki-outline-import.md for the format
// spec and docs/wiki-outline-import-implementation-plan.md for the wiring.

import { type FormEvent, useRef, useState } from "react"
import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useWikiStore } from "@/stores/wiki"
import { useImportOutline } from "@/hooks/use-import-outline"
import {
  OUTLINE_IMPORT_MAX_SIZE_BYTES,
  type OutlineImportReport,
} from "@/lib/wiki-outline-import"

interface ImportOutlineDialogProps {
  operationId: string
}

export function ImportOutlineDialog({ operationId }: ImportOutlineDialogProps) {
  const { importOutlineDialogOpen, closeImportOutlineDialog } = useWikiStore()
  const importMutation = useImportOutline()

  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<OutlineImportReport | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setError(null)
    setReport(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError("Choose an Outline export zip first.")
      return
    }
    if (file.size > OUTLINE_IMPORT_MAX_SIZE_BYTES) {
      setError(
        `Zip exceeds the ${OUTLINE_IMPORT_MAX_SIZE_BYTES / (1024 * 1024)} MB limit.`,
      )
      return
    }

    try {
      const result = await importMutation.mutateAsync({ file, operationId })
      setReport(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed")
    }
  }

  return (
    <Dialog
      open={importOutlineDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          // Block close while a request is in flight — the backend is
          // doing real work and the dialog's progress state is the only
          // place we surface success/failure.
          if (importMutation.isPending) return
          closeImportOutlineDialog()
          reset()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Markdown</DialogTitle>
          <DialogDescription>
            Upload a zip of markdown files. Imported documents land under{" "}
            <code>import/&lt;timestamp&gt;/</code> so you can review and move
            them later.{" "}
            <span className="text-muted-foreground">
              Outline workspace exports are the tested format; other tools
              import on a best-effort basis (tool-specific syntax like
              callouts, wikilinks, or attachment metadata may not survive).
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Success view: show the report and a link to the new folder. */}
        {report ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm">
              <p className="font-medium">Import complete.</p>
              <ul className="mt-2 space-y-0.5 text-muted-foreground">
                <li>{report.createdDocs} of {report.totalDocs} documents created</li>
                {report.skippedDocs > 0 && (
                  <li>{report.skippedDocs} skipped</li>
                )}
                <li>
                  {report.imagesIngested} image{report.imagesIngested === 1 ? "" : "s"},{" "}
                  {report.filesIngested} file{report.filesIngested === 1 ? "" : "s"} ingested
                </li>
              </ul>
            </div>

            {report.skipped && report.skipped.length > 0 && (
              <details className="rounded-md border p-3 text-xs">
                <summary className="cursor-pointer font-medium">
                  {report.skipped.length} skipped — see details
                </summary>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {report.skipped.map((s, i) => (
                    <li key={i}>
                      <span className="font-mono">{s.path}</span> — {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  closeImportOutlineDialog()
                  reset()
                }}
              >
                Close
              </Button>
              <Button
                render={
                  <Link
                    to={`/wiki/${report.timestampParentId}`}
                    onClick={() => {
                      closeImportOutlineDialog()
                      reset()
                    }}
                  />
                }
              >
                Open imported folder
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              required
              disabled={importMutation.isPending}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground hover:file:bg-secondary/80"
            />

            {importMutation.isPending && (
              <p className="text-sm text-muted-foreground">
                Uploading and importing — this can take a minute or two for
                large exports. Don't close this window.
              </p>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  closeImportOutlineDialog()
                  reset()
                }}
                disabled={importMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={importMutation.isPending}>
                {importMutation.isPending ? "Importing..." : "Import"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
