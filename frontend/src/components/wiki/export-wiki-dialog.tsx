// Export dialog driven by the wiki store. Two modes:
//
//   - Tree export: opened from the sidebar header. exportTarget is null;
//     the dialog offers a download of the whole operation's wiki.
//   - Subtree export: opened from the 3-dots menu on a tree row. exportTarget
//     is populated with the root document's id, title, and child count, and
//     the dialog labels the export with that root.
//
// On success the hook triggers a browser download via the temporary <a>
// pattern, and the dialog flips into a "downloaded" confirmation so the
// user can close cleanly. Errors surface inline.

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
import { useExportWiki } from "@/hooks/use-export-wiki"

interface ExportWikiDialogProps {
  operationId: string
}

export function ExportWikiDialog({ operationId }: ExportWikiDialogProps) {
  const { exportDialogOpen, exportTarget, closeExportDialog } = useWikiStore()
  const exportMutation = useExportWiki()

  const [error, setError] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)

  function reset() {
    setError(null)
    setDownloaded(false)
  }

  async function handleExport() {
    setError(null)
    try {
      await exportMutation.mutateAsync({
        operationId,
        rootId: exportTarget?.id ?? null,
      })
      setDownloaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed")
    }
  }

  const scopeLabel = exportTarget
    ? `“${exportTarget.title}” + ${exportTarget.childCount} ${
        exportTarget.childCount === 1 ? "descendant" : "descendants"
      }`
    : "the entire wiki tree"

  return (
    <Dialog
      open={exportDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          // Block close while the request is in flight — large exports
          // take real time and the dialog's progress state is the only
          // place we surface success/failure.
          if (exportMutation.isPending) return
          closeExportDialog()
          reset()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export wiki</DialogTitle>
          <DialogDescription>
            Download {scopeLabel} as a markdown zip. The format is compatible
            with the import flow — the same archive can be re-imported later
            into this or another operation.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {downloaded ? (
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm">
            <p className="font-medium">Export downloaded.</p>
            <p className="mt-1 text-muted-foreground">
              Check your downloads folder. The zip includes an
              <code className="mx-1">EXPORT_REPORT.json</code>
              with per-document warnings, if any.
            </p>
          </div>
        ) : exportMutation.isPending ? (
          <p className="text-sm text-muted-foreground">
            Rendering documents and bundling attachments — this can take a
            minute for large wikis. Don't close this window.
          </p>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              closeExportDialog()
              reset()
            }}
            disabled={exportMutation.isPending}
          >
            {downloaded ? "Close" : "Cancel"}
          </Button>
          {!downloaded && (
            <Button
              type="button"
              onClick={handleExport}
              disabled={exportMutation.isPending}
            >
              {exportMutation.isPending ? "Exporting…" : "Export"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
