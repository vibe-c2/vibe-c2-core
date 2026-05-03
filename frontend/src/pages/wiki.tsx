import { useEffect, useMemo, useRef } from "react"
import { Navigate, useParams } from "react-router"
import { useScopedOperation } from "@/hooks/use-scoped-operation"
import { useMyOperationRole } from "@/graphql/hooks/operations"
import {
  useWikiDocumentChangedSubscription,
  useWikiDocumentPresenceChangedSubscription,
  useWikiDocumentTree,
} from "@/graphql/hooks/wiki"
import { useWikiStore } from "@/stores/wiki"
import { WikiTreeSidebar } from "@/components/wiki/wiki-tree-sidebar"
import { collectAncestorIds } from "@/components/wiki/wiki-tree-helpers"
import { ResizeHandle } from "@/components/wiki/resize-handle"
import { WikiContentArea } from "@/components/wiki/wiki-content-area"
import { WikiCommandPalette } from "@/components/wiki/wiki-command-palette"
import { CreateWikiDocumentDialog } from "@/components/wiki/create-wiki-document-dialog"
import { DeleteWikiDocumentDialog } from "@/components/wiki/delete-wiki-document-dialog"
import { ImportOutlineDialog } from "@/components/wiki/import-outline-dialog"
import { MoveWikiDocumentDialog } from "@/components/wiki/move-wiki-document-dialog"
import { PermanentDeleteWikiDocumentDialog } from "@/components/wiki/permanent-delete-wiki-document-dialog"
import { WikiTrashPanel } from "@/components/wiki/wiki-trash-panel"
import { WikiBackupPanel } from "@/components/wiki/wiki-backup-panel"

export function WikiPage() {
  const scopedOperation = useScopedOperation()
  const { documentId } = useParams<{ documentId: string }>()

  // Redirect if no operation is scoped.
  if (!scopedOperation) {
    return <Navigate to="/operations" replace />
  }

  return (
    <WikiPageInner
      operationId={scopedOperation.id}
      documentId={documentId ?? null}
    />
  )
}

function WikiPageInner({
  operationId,
  documentId,
}: {
  operationId: string
  documentId: string | null
}) {
  // Note: Dropping the open document on scope change is handled at the
  // route-guard level (ProtectedRoute) so it works across both same-tab and
  // cross-tab switches — the latter unmounts this page during validation.

  const { data: roleData, isLoading: isRoleLoading } = useMyOperationRole(operationId)
  // Default to false while loading to avoid premature WebSocket connections.
  const isEditor = !isRoleLoading && roleData?.myOperationRole !== "VIEWER"

  // Real-time subscriptions scoped to this operation.
  useWikiDocumentChangedSubscription(operationId)
  useWikiDocumentPresenceChangedSubscription(operationId)

  // Fetch tree data once — shared between sidebar and content search breadcrumbs.
  const { data: treeData } = useWikiDocumentTree(operationId)
  // Memoize to keep the array reference stable across renders so effects with
  // `treeDocuments` in their deps (e.g. auto-expand below) don't re-fire on
  // unrelated parent re-renders.
  const treeDocuments = useMemo(
    () => treeData?.wikiDocumentTree ?? [],
    [treeData?.wikiDocumentTree],
  )

  const sidebarWidth = useWikiStore((s) => s.sidebarWidth)
  const setSidebarWidth = useWikiStore((s) => s.setSidebarWidth)
  const openContentSearch = useWikiStore((s) => s.openContentSearch)
  const expandMany = useWikiStore((s) => s.expandMany)

  // Auto-expand the tree to reveal the open document. Fires once per
  // documentId — the user can manually collapse afterwards without us
  // fighting back. Re-fires on a fresh navigation (e.g. from search) or
  // after the tree finishes loading.
  const lastExpandedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!documentId) {
      lastExpandedFor.current = null
      return
    }
    if (treeDocuments.length === 0) return
    if (lastExpandedFor.current === documentId) return
    lastExpandedFor.current = documentId
    const ancestorIds = collectAncestorIds(documentId, treeDocuments)
    if (ancestorIds.length > 0) expandMany(ancestorIds)
  }, [documentId, treeDocuments, expandMany])

  // Global Cmd/Ctrl+K opens the command palette with the "All Documents"
  // scope. Bound at the page level so any focus state inside the wiki
  // surface gets the shortcut. Explicitly skips fires while a text field
  // already has focus *in another modal* by matching on event target — but
  // honored even inside the editor, because search is the whole point.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        openContentSearch(null, "All Documents")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openContentSearch])

  // Shared ref so ResizeHandle can mutate the sidebar's `--wiki-sidebar-width`
  // CSS variable directly during a drag (no React render until mouseup).
  const sidebarRef = useRef<HTMLDivElement | null>(null)

  return (
    <div className="flex h-svh min-h-0 gap-1 overflow-hidden p-2">
      <WikiTreeSidebar
        ref={sidebarRef}
        operationId={operationId}
        isEditor={isEditor}
        documents={treeDocuments}
      />
      <ResizeHandle
        currentWidth={sidebarWidth}
        onResize={setSidebarWidth}
        sidebarRef={sidebarRef}
      />
      <WikiContentArea
        documentId={documentId}
        isEditor={isEditor}
        treeDocuments={treeDocuments}
      />

      {/* Dialogs + panels — mounted once, controlled by store */}
      <CreateWikiDocumentDialog operationId={operationId} />
      <ImportOutlineDialog operationId={operationId} />
      <MoveWikiDocumentDialog documents={treeDocuments} />
      <DeleteWikiDocumentDialog documentId={documentId} />
      <PermanentDeleteWikiDocumentDialog />
      <WikiTrashPanel operationId={operationId} />
      <WikiBackupPanel />
      <WikiCommandPalette operationId={operationId} />
    </div>
  )
}
