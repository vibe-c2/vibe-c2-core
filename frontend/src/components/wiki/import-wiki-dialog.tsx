// Import dialog. Uploads a Vibe bundle or a markdown zip, lets the operator
// choose where it lands, then watches the background job and shows the
// report. The archive format is detected server-side; the filename only
// picks a sensible default destination.

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
import { useStartImport, useTransferJob } from "@/hooks/use-wiki-transfer"
import {
  IMPORT_MAX_SIZE_BYTES,
  formatBytes,
  isBundleFilename,
  type ImportDestination,
  type ImportReport,
} from "@/lib/wiki-transfer"
import { openWikiDocumentPicker } from "@/components/wiki/wiki-command-palette"
import { TransferProgress, TransferSkipList } from "@/components/wiki/transfer-status"

interface ImportWikiDialogProps {
  operationId: string
}

interface ParentChoice {
  id: string
  title: string
}

export function ImportWikiDialog({ operationId }: ImportWikiDialogProps) {
  const { importDialogOpen, closeImportDialog } = useWikiStore()
  const start = useStartImport()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [destination, setDestination] = useState<ImportDestination["kind"]>("holdingPen")
  const [parent, setParent] = useState<ParentChoice | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const jobQuery = useTransferJob(jobId, operationId)
  const job = jobQuery.data

  const busy = start.isPending || (job !== undefined && (job.status === "queued" || job.status === "running"))

  function reset() {
    setJobId(null)
    setError(null)
    setFileName(null)
    setDestination("holdingPen")
    setParent(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function close() {
    closeImportDialog()
    reset()
  }

  function onFileChange() {
    const f = fileInputRef.current?.files?.[0] ?? null
    setFileName(f?.name ?? null)
    // A bundle usually means "put these pages where they belong"; a foreign
    // zip is best reviewed in the holding pen first.
    if (f && isBundleFilename(f.name) && destination === "holdingPen") setDestination("root")
  }

  function pickParent() {
    openWikiDocumentPicker({
      operationId,
      title: "Import under",
      description: "Pick the page the imported pages will be placed under.",
      onPick: (doc) => {
        setParent({ id: doc.id, title: doc.title || "Untitled" })
        setDestination("parent")
      },
    })
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError("Choose an archive first.")
      return
    }
    if (file.size > IMPORT_MAX_SIZE_BYTES) {
      setError(`Archive exceeds the ${formatBytes(IMPORT_MAX_SIZE_BYTES)} limit.`)
      return
    }
    let dest: ImportDestination
    if (destination === "parent") {
      if (!parent) {
        setError("Pick a page to import under, or choose another destination.")
        return
      }
      dest = { kind: "parent", parentId: parent.id }
    } else {
      dest = { kind: destination }
    }
    try {
      const started = await start.mutateAsync({ operationId, file, destination: dest })
      setJobId(started.jobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed to start")
    }
  }

  const report = job?.status === "done" ? (job.report as ImportReport | undefined) : undefined
  const openTarget = report?.targetParentId ?? report?.rootIds?.[0] ?? null

  return (
    <Dialog
      open={importDialogOpen}
      onOpenChange={(open) => {
        if (open) return
        close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import wiki</DialogTitle>
          <DialogDescription>
            Upload a Vibe bundle (<code>.vibewiki.zip</code>) or a markdown zip from
            Outline or another tool. Pages, links, chips and attachments in a bundle
            come back exactly; other zips import on a best-effort basis.
          </DialogDescription>
        </DialogHeader>

        {jobId !== null ? (
          <div className="flex flex-col gap-3">
            {job === undefined ? (
              <p className="text-sm text-muted-foreground">Starting…</p>
            ) : job.status === "failed" ? (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                <p className="font-medium">Import failed.</p>
                <p className="mt-1">{job.error ?? "Unknown error"}</p>
              </div>
            ) : job.status === "done" ? (
              <>
                <div className="rounded-md bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30">
                  <p className="font-medium">Import complete.</p>
                  {report && (
                    <ul className="mt-2 space-y-0.5 text-muted-foreground">
                      <li>
                        {report.createdDocs} of {report.totalDocs} pages created
                        {report.skippedDocs > 0 ? `, ${report.skippedDocs} skipped` : ""}
                      </li>
                      <li>
                        {report.imagesIngested} image{report.imagesIngested === 1 ? "" : "s"},{" "}
                        {report.filesIngested} file{report.filesIngested === 1 ? "" : "s"}
                      </li>
                      {report.credentialsCreated + report.credentialsReused > 0 && (
                        <li>
                          {report.credentialsReused} credential{report.credentialsReused === 1 ? "" : "s"} reused,{" "}
                          {report.credentialsCreated} created
                        </li>
                      )}
                      {report.chipsDropped > 0 && (
                        <li>
                          {report.chipsDropped} reference{report.chipsDropped === 1 ? "" : "s"} had no match here and
                          became plain text
                        </li>
                      )}
                    </ul>
                  )}
                </div>
                <TransferSkipList skipped={report?.skipped} warnings={report?.warnings} />
              </>
            ) : (
              <TransferProgress
                label="Creating pages and storing attachments"
                done={job.progress.done}
                total={job.progress.total}
              />
            )}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={close}>
                {job?.status === "done" || job?.status === "failed" ? "Close" : "Hide"}
              </Button>
              {job?.status === "done" && openTarget && (
                <Button render={<Link to={`/wiki/${openTarget}`} onClick={close} />}>
                  Open imported pages
                </Button>
              )}
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{error}</div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              required
              disabled={busy}
              onChange={onFileChange}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground hover:file:bg-secondary/80"
            />

            <fieldset className="flex flex-col gap-2" disabled={busy}>
              <legend className="text-sm font-medium">Import into</legend>
              <DestinationOption
                checked={destination === "holdingPen"}
                onChange={() => setDestination("holdingPen")}
                label="Holding pen"
                hint="import/<timestamp>/ — review first, then move pages where they belong."
              />
              <DestinationOption
                checked={destination === "root"}
                onChange={() => setDestination("root")}
                label="Top level"
                hint="Pages land at the root of this operation's wiki."
              />
              <DestinationOption
                checked={destination === "parent"}
                onChange={() => (parent ? setDestination("parent") : pickParent())}
                label={parent ? `Under “${parent.title}”` : "Under a page…"}
                hint={parent ? "Click again to choose a different page." : "Pick an existing page to import under."}
                onLabelClick={pickParent}
              />
            </fieldset>

            {fileName && !isBundleFilename(fileName) && (
              <p className="text-xs text-muted-foreground">
                Not a Vibe bundle: links to other pages, hosts and hashes cannot be
                rewired and may become plain text.
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" type="button" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {start.isPending ? "Uploading…" : "Import"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface DestinationOptionProps {
  checked: boolean
  onChange: () => void
  label: string
  hint: string
  onLabelClick?: () => void
}

function DestinationOption({ checked, onChange, label, hint, onLabelClick }: DestinationOptionProps) {
  return (
    <label
      className={
        "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm " +
        (checked ? "border-primary bg-primary/5" : "hover:bg-muted/50")
      }
      onClick={(e) => {
        if (onLabelClick && checked) {
          e.preventDefault()
          onLabelClick()
        }
      }}
    >
      <input type="radio" name="import-destination" className="mt-0.5" checked={checked} onChange={onChange} />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}
