import { useCallback, useEffect, useRef } from "react"
import { Navigate, useParams } from "react-router"
import { useScopedOperation } from "@/hooks/use-scoped-operation"
import { useMyOperationRole } from "@/graphql/hooks/operations"
import { useWikiDocument } from "@/graphql/hooks/wiki"
import { WikiEditor } from "@/components/wiki/wiki-editor"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { Skeleton } from "@/components/ui/skeleton"
import "./wiki-print.css"

// Brief wait after the editor signals ready before we trigger the print
// dialog. The editor reports ready as soon as Y.js has applied its initial
// state, but ProseMirror's custom node views (notice blocks, credential
// chips, document references, image previews, highlighted code blocks)
// mount asynchronously the next render or two. Without this settle delay,
// the print preview occasionally captures the doc with skeleton placeholders
// where chips should be. 400ms is enough on a fast machine; up to ~1.5s on
// throttled CPUs we've tested.
const PRINT_SETTLE_MS = 400

// WikiPrintPage is the chromeless render surface used when the user clicks
// "Export as PDF" in the editor header. It mounts the regular WikiEditor in
// read-only mode (so all custom node views, code highlighting, tables, and
// images render IDENTICALLY to the in-app view) but skips every piece of
// surrounding UI: no app sidebar, no wiki tree, no editor header, no
// toolbars, no footer.
//
// Once the editor signals it has loaded its content, we call window.print(),
// which opens the browser's native print dialog. The user picks "Save as
// PDF" from there. The result is a PDF that matches the in-app document
// exactly — because the same browser engine is rendering both.
export function WikiPrintPage() {
  const scopedOperation = useScopedOperation()
  const { documentId } = useParams<{ documentId: string }>()

  if (!scopedOperation) {
    return <Navigate to="/operations" replace />
  }
  if (!documentId) {
    return <Navigate to="/wiki" replace />
  }

  return (
    <WikiPrintPageInner
      operationId={scopedOperation.id}
      documentId={documentId}
    />
  )
}

function WikiPrintPageInner({
  operationId,
  documentId,
}: {
  operationId: string
  documentId: string
}) {
  const { data: roleData, isLoading: isRoleLoading } =
    useMyOperationRole(operationId)
  // We mount the editor as read-only regardless of role — even editors are
  // viewing a print snapshot here, not editing — but we still wait for the
  // role query to settle so we don't kick off the Hocuspocus connection
  // before knowing the user is a member.
  const canRead = !isRoleLoading && roleData?.myOperationRole != null

  const { data: docData, isLoading: isDocLoading } = useWikiDocument(documentId)
  const doc = docData?.wikiDocument ?? null

  // Ref-based one-shot guard: window.print() should fire exactly once per
  // page mount. Using a ref instead of useState keeps handleEditorReady
  // referentially stable, so the editor's onReady effect doesn't re-fire
  // every render. The settle timer is also kept in a ref so the cleanup
  // effect can cancel it if the user navigates away mid-wait.
  const hasPrintedRef = useRef(false)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEditorReady = useCallback(() => {
    if (hasPrintedRef.current) return
    hasPrintedRef.current = true
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      window.print()
    }, PRINT_SETTLE_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current)
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

  if (!canRead && !isRoleLoading) {
    // No permission to view — bounce. We don't render the print surface
    // for unauthorized requests, so the user just sees the operations
    // page instead of an empty print dialog.
    return <Navigate to="/operations" replace />
  }

  if (isRoleLoading || isDocLoading || !doc) {
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
