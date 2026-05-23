import { useCallback, useEffect, useRef, useState } from "react"
import { Navigate, useParams } from "react-router"
import { useIsFetching } from "@tanstack/react-query"
import { useMyOperationRole } from "@/graphql/hooks/operations"
import { useWikiDocument } from "@/graphql/hooks/wiki"
import { PrintModeProvider } from "@/hooks/use-print-mode"
import { WikiEditor } from "@/components/wiki/wiki-editor"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { Skeleton } from "@/components/ui/skeleton"
import "./wiki-print.css"

// Once the editor signals it has loaded its content and no GraphQL queries
// are in flight, we still wait this long with no new fetches kicking off
// before we commit to printing. Credential and document chips can fan out
// queries the moment they mount, so a brief stability window prevents
// printing in the gap between "the last chip's query resolved" and "the
// next chip just mounted and started its query".
const QUERY_STABILITY_MS = 250

// Hard upper bound on how long we wait for readiness before printing
// anyway. Protects against a wedged query (offline credential ref, server
// hiccup, etc.) leaving the user staring at a print page that never opens
// the dialog. The fallback print still gives a usable PDF — chips that
// failed to load just render as their "no access" / "deleted" placeholders.
const READINESS_TIMEOUT_MS = 8000

// WikiPrintPage is the chromeless render surface used when the user clicks
// "Export as PDF" in the editor header. It mounts the regular WikiEditor in
// read-only mode (so all custom node views, code highlighting, tables, and
// images render IDENTICALLY to the in-app view) but skips every piece of
// surrounding UI: no app sidebar, no wiki tree, no editor header, no
// toolbars, no footer.
//
// Once the editor signals it has loaded its content, we wait for fonts,
// images, and any pending data fetches to settle, then call window.print()
// — which opens the browser's native print dialog. The user picks "Save as
// PDF" from there. The result is a PDF that matches the in-app document
// exactly because the same browser engine is rendering both.
export function WikiPrintPage() {
  const { documentId } = useParams<{ documentId: string }>()

  if (!documentId) {
    return <Navigate to="/wiki" replace />
  }

  return (
    <PrintModeProvider value={true}>
      <WikiPrintPageInner documentId={documentId} />
    </PrintModeProvider>
  )
}

function WikiPrintPageInner({
  documentId,
}: {
  documentId: string
}) {
  // Source of truth for which operation this print belongs to is the doc
  // itself — works uniformly for operation-scoped and Public docs without
  // depending on whatever the user currently has scoped.
  const { data: docData, isLoading: isDocLoading } = useWikiDocument(documentId)
  const doc = docData?.wikiDocument ?? null
  const operationId = doc?.operationId ?? null

  const { data: roleData, isLoading: isRoleLoading } =
    useMyOperationRole(operationId ?? "")
  // We mount the editor as read-only regardless of role — even editors are
  // viewing a print snapshot here, not editing — but we still wait for the
  // role query to settle so we don't kick off the Hocuspocus connection
  // before knowing the user is a member.
  const canRead = !isRoleLoading && roleData?.myOperationRole != null

  // True after WikiEditor calls onReady — Y.js has synced its initial
  // state and the editor view is mounted. ProseMirror's custom node views
  // (notice blocks, credential chips, document refs, images, highlighted
  // code) still mount asynchronously after this flips; the rest of the
  // readiness check below handles that tail.
  const [editorReady, setEditorReady] = useState(false)

  // Live count of in-flight TanStack Query requests anywhere in the tree.
  // Credential chips and document chips fan out one fetch each; print mode
  // forces them all to fire (no viewport gating), and we wait until the
  // count drops to zero and stays there for QUERY_STABILITY_MS.
  const fetchingCount = useIsFetching()

  // One-shot guards. window.print() must fire exactly once, and the
  // outstanding stability timer / overall timeout need to be cancellable
  // when the user navigates away mid-wait.
  const hasPrintedRef = useRef(false)
  const stabilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const overallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEditorReady = useCallback(() => {
    setEditorReady(true)
  }, [])

  // Overall safety timeout: from the moment the editor first signals ready,
  // we will print no later than READINESS_TIMEOUT_MS regardless of pending
  // queries. Prevents an offline / failing chip from blocking the dialog
  // forever.
  useEffect(() => {
    if (!editorReady) return
    if (hasPrintedRef.current) return
    if (overallTimeoutRef.current) clearTimeout(overallTimeoutRef.current)
    overallTimeoutRef.current = setTimeout(() => {
      if (hasPrintedRef.current) return
      void runPrint(hasPrintedRef)
    }, READINESS_TIMEOUT_MS)
    return () => {
      if (overallTimeoutRef.current) clearTimeout(overallTimeoutRef.current)
    }
  }, [editorReady])

  // Main readiness loop: whenever the editor is ready AND no queries are
  // in flight, arm a stability timer. If a new fetch starts before the
  // timer fires, we clear it and wait for the next quiescent window. Only
  // once we get a full QUERY_STABILITY_MS with zero in-flight queries do
  // we move on to the final settle (fonts + images + frames) and print.
  useEffect(() => {
    if (!editorReady) return
    if (hasPrintedRef.current) return

    if (stabilityTimerRef.current) {
      clearTimeout(stabilityTimerRef.current)
      stabilityTimerRef.current = null
    }

    if (fetchingCount > 0) return

    stabilityTimerRef.current = setTimeout(() => {
      if (hasPrintedRef.current) return
      void runPrint(hasPrintedRef)
    }, QUERY_STABILITY_MS)

    return () => {
      if (stabilityTimerRef.current) {
        clearTimeout(stabilityTimerRef.current)
        stabilityTimerRef.current = null
      }
    }
  }, [editorReady, fetchingCount])

  useEffect(() => {
    return () => {
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current)
      if (overallTimeoutRef.current) clearTimeout(overallTimeoutRef.current)
    }
  }, [])

  // Update document title so the browser's "Save as PDF" dialog and the
  // resulting filename default to something descriptive instead of the
  // app's default tab title.
  useEffect(() => {
    if (!doc?.title) return
    const previous = document.title
    document.title = doc.title
    return () => {
      document.title = previous
    }
  }, [doc?.title])

  // Show the skeleton until both the doc and the role query have settled.
  // operationId stays null until the doc loads, which keeps the role query
  // disabled (useMyOperationRole gates on `!!operationId`) — so its
  // isRoleLoading is false during that window even though we have no role
  // answer yet. The `!operationId` clause is what prevents bouncing through
  // the `!canRead` redirect during that gap; do not relax it.
  if (isDocLoading || !doc || !operationId || isRoleLoading) {
    return (
      <div className="wiki-print-shell">
        <div className="flex flex-col gap-3 p-8">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    )
  }

  if (!canRead) {
    // No permission to view — bounce. The role query has settled with no
    // role for this user on this operation.
    return <Navigate to="/operations" replace />
  }

  // The wrapper class scopes the print stylesheet. Width is clamped so the
  // on-screen preview before printing reads the same as the printed page.
  return (
    <div className="wiki-print-shell">
      <article className="wiki-print-article">
        <header className="wiki-print-header">
          <div className="wiki-print-icon">
            <DocumentIcon
              emoji={doc.emoji}
              icon={doc.icon}
              color={doc.color}
              size={32}
            />
          </div>
          <h1 className="wiki-print-title">{doc.title || "Untitled"}</h1>
        </header>
        <div className="wiki-print-body">
          <WikiEditor
            documentId={documentId}
            operationId={operationId}
            isEditor={false}
            onReady={handleEditorReady}
          />
        </div>
      </article>
    </div>
  )
}

// Final settle before printing: wait for fonts to be ready (so the PDF
// doesn't get fallback glyphs mid-export), every image inside the print
// surface to finish decoding (so they render as pixels rather than
// reserved empty boxes), and a couple of animation frames (so any layout
// driven by the just-resolved image dimensions has committed).
async function runPrint(
  hasPrintedRef: { current: boolean },
): Promise<void> {
  if (hasPrintedRef.current) return
  hasPrintedRef.current = true
  try {
    await waitForRender()
  } finally {
    // Even if the settle step throws (it shouldn't, but image.decode()
    // rejects for broken sources), fire the print dialog. A PDF with
    // one broken image is still better than no PDF at all.
    window.print()
  }
}

async function waitForRender(): Promise<void> {
  if (typeof document === "undefined") return

  // Web fonts — printing before they resolve substitutes the fallback
  // family into the PDF.
  if (document.fonts && typeof document.fonts.ready?.then === "function") {
    try {
      await document.fonts.ready
    } catch {
      // Fonts API can reject in edge cases (e.g. font face errors); fall
      // through and print anyway.
    }
  }

  // Images — only those inside the print surface. We call decode() to
  // force the actual bitmap to be ready, not just the network request.
  const root = document.querySelector(".wiki-print-shell")
  if (root) {
    const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("img"))
    await Promise.all(
      imgs.map(async (img) => {
        if (img.complete && img.naturalHeight > 0) return
        try {
          await img.decode()
        } catch {
          // Broken / forbidden image — don't block the rest of the
          // document on a single failure.
        }
      }),
    )
  }

  // Two frames so React/PM commit any layout changes the image decode
  // pass produced, before the browser snapshots the page.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )
}
