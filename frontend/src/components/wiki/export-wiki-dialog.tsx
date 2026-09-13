// Export dialog. Starts a background export job for the whole wiki or one
// subtree, shows its progress, and offers the archive for download once
// the job is done.
//
// Two formats: the native bundle (lossless — every page, link, chip and
// attachment comes back exactly, and it can be imported into any operation
// or installation) and a markdown zip (portable to other tools, lossy).

import { useState } from "react"
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
import { useStartExport, useTransferJob } from "@/hooks/use-wiki-transfer"
import {
  formatBytes,
  jobDownloadUrl,
  type ExportReport,
  type TransferFormat,
} from "@/lib/wiki-transfer"
import { TransferProgress, TransferSkipList } from "@/components/wiki/transfer-status"

interface ExportWikiDialogProps {
  operationId: string
}

const FORMATS: Array<{ value: TransferFormat; label: string; hint: string }> = [
  {
    value: "bundle",
    label: "Vibe bundle",
    hint: "Lossless. Re-import into any operation with links, chips and attachments intact.",
  },
  {
    value: "markdown",
    label: "Markdown zip",
    hint: "For Obsidian, Outline and other tools. Vibe-only features do not survive.",
  },
]

export function ExportWikiDialog({ operationId }: ExportWikiDialogProps) {
  const { exportDialogOpen, exportTarget, closeExportDialog } = useWikiStore()
  const start = useStartExport()
  const [format, setFormat] = useState<TransferFormat>("bundle")
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const jobQuery = useTransferJob(jobId, operationId)
  const job = jobQuery.data

  const busy = start.isPending || (job !== undefined && (job.status === "queued" || job.status === "running"))

  function reset() {
    setJobId(null)
    setError(null)
    setFormat("bundle")
  }

  function close() {
    closeExportDialog()
    reset()
  }

  async function handleStart() {
    setError(null)
    try {
      const started = await start.mutateAsync({
        operationId,
        rootId: exportTarget?.id ?? null,
        format,
      })
      setJobId(started.jobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed to start")
    }
  }

  const scopeLabel = exportTarget
    ? `“${exportTarget.title}” + ${exportTarget.childCount} ${
        exportTarget.childCount === 1 ? "descendant" : "descendants"
      }`
    : "the entire wiki tree"

  const report = job?.status === "done" ? (job.report as ExportReport | undefined) : undefined

  return (
    <Dialog
      open={exportDialogOpen}
      onOpenChange={(open) => {
        if (open) return
        // The job keeps running server-side; closing only stops watching it.
        close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export wiki</DialogTitle>
          <DialogDescription>
            Export {scopeLabel}. The archive is built in the background and kept
            for 24 hours.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{error}</div>
        )}

        {jobId === null ? (
          <fieldset className="flex flex-col gap-2" disabled={busy}>
            <legend className="text-sm font-medium">Format</legend>
            {FORMATS.map((f) => (
              <label
                key={f.value}
                className={
                  "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm " +
                  (format === f.value ? "border-primary bg-primary/5" : "hover:bg-muted/50")
                }
              >
                <input
                  type="radio"
                  name="export-format"
                  className="mt-0.5"
                  checked={format === f.value}
                  onChange={() => setFormat(f.value)}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{f.label}</span>
                  <span className="text-muted-foreground">{f.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : job === undefined ? (
          <p className="text-sm text-muted-foreground">Starting…</p>
        ) : job.status === "failed" ? (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            <p className="font-medium">Export failed.</p>
            <p className="mt-1">{job.error ?? "Unknown error"}</p>
          </div>
        ) : job.status === "done" ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-md bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30">
              <p className="font-medium">Export ready.</p>
              {report && (
                <ul className="mt-2 space-y-0.5 text-muted-foreground">
                  <li>
                    {report.exportedDocs} of {report.totalDocs} pages exported
                    {report.skippedDocs > 0 ? `, ${report.skippedDocs} skipped` : ""}
                  </li>
                  <li>
                    {report.imagesExported} image{report.imagesExported === 1 ? "" : "s"},{" "}
                    {report.filesExported} file{report.filesExported === 1 ? "" : "s"}
                    {report.credentialsExported > 0
                      ? `, ${report.credentialsExported} credential${report.credentialsExported === 1 ? "" : "s"}`
                      : ""}
                  </li>
                  {job.artifactName && (
                    <li className="break-all">
                      {job.artifactName}
                      {job.artifactSize ? ` · ${formatBytes(job.artifactSize)}` : ""}
                    </li>
                  )}
                </ul>
              )}
            </div>
            <TransferSkipList skipped={report?.skipped} warnings={report?.warnings} />
          </div>
        ) : (
          <TransferProgress
            label="Rendering pages and bundling attachments"
            done={job.progress.done}
            total={job.progress.total}
          />
        )}

        <DialogFooter>
          <Button variant="outline" type="button" onClick={close}>
            {job?.status === "done" ? "Close" : busy ? "Hide" : "Cancel"}
          </Button>
          {jobId === null && (
            <Button type="button" onClick={handleStart} disabled={busy}>
              {start.isPending ? "Starting…" : "Export"}
            </Button>
          )}
          {job?.status === "done" && (
            <Button
              render={<a href={jobDownloadUrl(job.jobId)} download={job.artifactName ?? undefined} />}
            >
              Download
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
