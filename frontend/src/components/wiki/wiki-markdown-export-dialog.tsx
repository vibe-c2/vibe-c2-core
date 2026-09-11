import { useEffect, useMemo, useRef } from "react"
import { CopyIcon, DownloadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { copyToClipboard } from "@/lib/copy-to-clipboard"
import { useWikiDocumentMarkdown } from "@/graphql/hooks/wiki"
import { markdownFilename } from "@/components/wiki/wiki-markdown-filename"
import { absolutizeWikiMedia } from "@/components/wiki/wiki-absolute-urls"

interface WikiMarkdownExportDialogProps {
  documentId: string
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Shows a page's Markdown source, ready to copy or save.
 *
 * The source is rendered server-side from the CRDT body, not from the search
 * projection the `content` field carries, so what lands here is the same
 * Markdown the importer would read back — paste it into another instance and
 * the page rebuilds, checklists and reference chips included.
 *
 * Read-only rather than an editor. This is an export surface: the document
 * itself is edited in place, collaboratively, and offering a second editable
 * copy of the same text would invite someone to type into a buffer nothing
 * ever saves.
 */
export function WikiMarkdownExportDialog({
  documentId,
  title,
  open,
  onOpenChange,
}: WikiMarkdownExportDialogProps) {
  // Gated on `open` so the sidecar round trip only happens for someone who
  // actually asked to export.
  const { data, isLoading, isError, error } = useWikiDocumentMarkdown(documentId, {
    enabled: open,
  })
  // Absolute links, because the whole point of this dialog is that the text
  // leaves the app. A relative /api/v1/wiki/files/... resolves against
  // nothing once it is pasted into Obsidian or a ticket.
  const markdown = useMemo(
    () =>
      absolutizeWikiMedia(
        data?.wikiDocumentMarkdown ?? "",
        window.location.origin,
      ),
    [data?.wikiDocumentMarkdown],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Export as Markdown</DialogTitle>
          <DialogDescription>
            The source for {title || "this page"}. Copy it, or save it as a
            file.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-[60vh] w-full" />
        ) : isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Could not render this page as Markdown."}
          </div>
        ) : (
          <MarkdownSource markdown={markdown} />
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {isLoading ? "" : `${markdown.length.toLocaleString()} characters`}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={isLoading || markdown === ""}
              onClick={() => void copyToClipboard(markdown, "Markdown")}
            >
              <CopyIcon className="size-4" />
              Copy
            </Button>
            <Button
              disabled={isLoading || markdown === ""}
              onClick={() => downloadMarkdown(title, markdown)}
            >
              <DownloadIcon className="size-4" />
              Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The source block.
 *
 * A `textarea` rather than a `pre`, for one reason: select-all inside it picks
 * up the Markdown and nothing else. In a `pre`, Ctrl+A selects the whole
 * dialog, and a user who reaches for the keyboard instead of the Copy button
 * gets the heading and the button labels along with their document.
 */
function MarkdownSource({ markdown }: { markdown: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Start at the top on every open. Browsers restore scroll position on a
  // reused element, which on a long page means the dialog opens halfway down
  // somebody else's document.
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0
  }, [markdown])

  return (
    <textarea
      ref={ref}
      readOnly
      spellCheck={false}
      value={markdown}
      aria-label="Markdown source"
      onFocus={(e) => e.currentTarget.setSelectionRange(0, 0)}
      className="h-[60vh] w-full resize-none rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  )
}

/** Save the source as a .md file named after the page. */
function downloadMarkdown(title: string, markdown: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${markdownFilename(title)}.md`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revoking synchronously can cancel the download in some browsers, so give
  // the click a turn of the event loop first.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
