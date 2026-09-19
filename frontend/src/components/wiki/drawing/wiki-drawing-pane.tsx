// The drawing page's body, mirroring WikiEditorPane.
//
// Everything around the body is shared with prose pages — the same header,
// the same foreign-operation banner, the same metadata line, the same
// sub-page footer — because a drawing is a wiki page that happens to hold a
// canvas, not a separate kind of thing with its own chrome.

import { Suspense, lazy, useEffect } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { useWikiDocument } from "@/graphql/hooks/wiki"
import { useHocuspocus } from "@/hooks/use-hocuspocus"
import { useAuthStore } from "@/stores/auth"
import { WikiEditorHeader } from "@/components/wiki/wiki-editor-header"
import { WikiForeignOperationBanner } from "@/components/wiki/wiki-foreign-operation-banner"
import { WikiDocumentMeta } from "@/components/wiki/wiki-document-meta"
import { WikiDocumentFooterLists } from "@/components/wiki/wiki-document-footer-lists"
import { ConnectionBanner } from "@/components/wiki/connection-banner"
import { useWikiStore } from "@/stores/wiki"
import { cn } from "@/lib/utils"

// Lazily loaded, and the reason the whole drawing surface is in its own
// directory: this import is the boundary past which Excalidraw's chunk exists.
// A static import here would put ~47 MB of dependency graph in the bundle of
// every operator who never opens a drawing.
const WikiDrawingCanvas = lazy(() => import("./wiki-drawing-canvas"))

interface WikiDrawingPaneProps {
  documentId: string
  operationId: string
  isEditor: boolean
}

export function WikiDrawingPane({
  documentId,
  operationId,
  isEditor,
}: WikiDrawingPaneProps) {
  const { data, isLoading, error } = useWikiDocument(documentId)
  const document = data?.wikiDocument
  const user = useAuthStore((s) => s.user)
  const { ydoc, provider, connectionStatus, isSynced, isReady } = useHocuspocus(documentId)

  // Focus mode. The header that hosts the toggle is shared with the prose
  // pane, so without these the button flips its own icon and nothing else
  // happens — and the flag is left set for whichever page is opened next.
  const editorZoomed = useWikiStore((s) => s.editorZoomed)
  const setEditorZoom = useWikiStore((s) => s.setEditorZoom)

  // Dropped only on full unmount (leaving the wiki page entirely), matching
  // the prose pane: switching between documents keeps focus mode on so
  // navigating the sub-page list does not kick the user out of it.
  useEffect(() => {
    return () => setEditorZoom(false)
  }, [setEditorZoom])

  // Escape leaves focus mode — but Excalidraw uses Escape itself, to clear a
  // selection or cancel the active tool, so defer whenever it has handled the
  // key. Without that guard a deselect would also throw the operator out of
  // fullscreen. The header button is the unambiguous way out either way.
  useEffect(() => {
    if (!editorZoomed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.key === "Escape") setEditorZoom(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editorZoomed, setEditorZoom])

  if (isLoading) {
    return <DrawingSkeleton />
  }

  if (error || !document) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border bg-card text-muted-foreground">
        <p className="text-sm">Document not found</p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card",
        // z-40 so dialogs, the backup sheet and the command palette (z-50)
        // still stack above a zoomed canvas.
        editorZoomed && "fixed inset-0 z-40 rounded-none border-0",
      )}
    >
      <WikiEditorHeader
        document={document}
        operationId={operationId}
        isEditor={isEditor}
      />
      <WikiForeignOperationBanner document={document} />
      <WikiDocumentMeta document={document} />
      <ConnectionBanner
        connectionStatus={connectionStatus}
        isSynced={isSynced}
        isReady={isReady}
      />

      {/* The canvas is mounted only once the room has synced. Excalidraw reads
          its initialData exactly once, so mounting early would open an empty
          canvas and then have to reconcile the real scene into it — which the
          user would watch happen. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {isReady ? (
          <Suspense fallback={<DrawingSkeleton />}>
            <WikiDrawingCanvas
              documentId={documentId}
              ydoc={ydoc}
              provider={provider}
              isEditor={isEditor}
              user={user ? { userId: user.userId, username: user.username } : null}
            />
          </Suspense>
        ) : (
          <DrawingSkeleton />
        )}
      </div>

      {/* Padded to the same gutter as the header and meta line, which the
          canvas above deliberately ignores because a canvas is full-bleed.

          Scrolls on its own rather than with the page: the canvas owns the
          wheel (Excalidraw zooms and pans with it), so the pane cannot be one
          scrolling column the way the prose pane is. Without this the footer
          is simply clipped by the card's overflow-hidden once a page has more
          sub-pages than the leftover height fits, with no way to reach them.
          Capped so a long list cannot squeeze the drawing out of its own
          page. */}
      <div className="max-h-[40%] shrink-0 overflow-y-auto px-4 pb-4">
        <WikiDocumentFooterLists
          documentId={documentId}
          operationId={operationId}
          isEditor={isEditor}
          className="mt-0"
        />
      </div>
    </div>
  )
}

function DrawingSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <Skeleton className="h-8 w-48 self-center rounded-lg" />
      <Skeleton className="min-h-0 flex-1 rounded-lg" />
    </div>
  )
}
