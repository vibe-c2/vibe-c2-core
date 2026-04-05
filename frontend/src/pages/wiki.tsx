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
import { ResizeHandle } from "@/components/wiki/resize-handle"
import { WikiContentArea } from "@/components/wiki/wiki-content-area"
import { CreateWikiDocumentDialog } from "@/components/wiki/create-wiki-document-dialog"
import { DeleteWikiDocumentDialog } from "@/components/wiki/delete-wiki-document-dialog"
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
  const { data: roleData, isLoading: isRoleLoading } = useMyOperationRole(operationId)
  // Default to false while loading to avoid premature WebSocket connections.
  const isEditor = !isRoleLoading && roleData?.myOperationRole !== "VIEWER"

  // Real-time subscriptions scoped to this operation.
  useWikiDocumentChangedSubscription(operationId)
  useWikiDocumentPresenceChangedSubscription(operationId)

  // Fetch tree data once — shared between sidebar and content search breadcrumbs.
  const { data: treeData } = useWikiDocumentTree(operationId)
  const treeDocuments = treeData?.wikiDocumentTree ?? []

  const sidebarWidth = useWikiStore((s) => s.sidebarWidth)
  const setSidebarWidth = useWikiStore((s) => s.setSidebarWidth)

  return (
    <div className="flex flex-1 gap-2 p-2 overflow-hidden">
      <WikiTreeSidebar
        operationId={operationId}
        isEditor={isEditor}
        documents={treeDocuments}
      />
      <ResizeHandle
        currentWidth={sidebarWidth}
        onResize={setSidebarWidth}
      />
      <WikiContentArea
        operationId={operationId}
        documentId={documentId}
        isEditor={isEditor}
        treeDocuments={treeDocuments}
      />

      {/* Dialogs + panels — mounted once, controlled by store */}
      <CreateWikiDocumentDialog operationId={operationId} />
      <MoveWikiDocumentDialog documents={treeDocuments} />
      <DeleteWikiDocumentDialog documentId={documentId} />
      <PermanentDeleteWikiDocumentDialog />
      <WikiTrashPanel operationId={operationId} />
      <WikiBackupPanel />
    </div>
  )
}
