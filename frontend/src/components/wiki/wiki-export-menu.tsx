import { useState } from "react"
import { FileDownIcon, FileTextIcon, PrinterIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { WikiMarkdownExportDialog } from "@/components/wiki/wiki-markdown-export-dialog"

interface WikiExportMenuProps {
  documentId: string
  title: string
  /** A drawing has no Markdown body, so that option is not offered for one. */
  isDrawing?: boolean
}

/**
 * The page's export options.
 *
 * PDF leaves through the browser's print dialog and Markdown through a
 * modal — two different shapes of interaction, so they sit behind one menu
 * rather than two header buttons that look alike and do unlike things.
 *
 * Not gated on edit rights: exporting is reading.
 */
export function WikiExportMenu({
  documentId,
  title,
  isDrawing = false,
}: WikiExportMenuProps) {
  const [markdownOpen, setMarkdownOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        {/* Labelled rather than icon-only, unlike its neighbours in the
            header. It is the one control here that opens a menu instead of
            doing something, and a word says that where an icon cannot — it
            also means no tooltip, so there is no trigger-inside-trigger
            composition to get wrong. */}
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="sm" aria-label="Export" />}
        >
          <FileDownIcon className="size-4" />
          Export
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="min-w-44">
          {/* Opens the chromeless print route in a new tab. That page mounts
              the same WikiEditor read-only and calls window.print() once the
              document loads; the user picks "Save as PDF" from the browser's
              dialog. Cookies ride along on the new tab, so the protected
              route still authenticates. */}
          <DropdownMenuItem
            onClick={() =>
              window.open(
                `/wiki/${encodeURIComponent(documentId)}/print`,
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            <PrinterIcon className="size-4" />
            PDF
          </DropdownMenuItem>

          {/* Offered only for prose. A drawing renders to an empty .md file,
              and an export that silently produces nothing is worse than one
              that is not on the menu. Images are exported from the canvas
              itself, which already has Excalidraw's own PNG/SVG export. */}
          {!isDrawing && (
            <DropdownMenuItem onClick={() => setMarkdownOpen(true)}>
              <FileTextIcon className="size-4" />
              Markdown
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mounted only while open so closing the dialog drops the rendered
          source rather than holding a stale copy of the body in memory. */}
      {markdownOpen && (
        <WikiMarkdownExportDialog
          documentId={documentId}
          title={title}
          open={markdownOpen}
          onOpenChange={setMarkdownOpen}
        />
      )}
    </>
  )
}
