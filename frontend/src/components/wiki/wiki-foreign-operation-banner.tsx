import { ArrowRightLeftIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useOperation } from "@/graphql/hooks/operations"
import { useScopedOperationStore } from "@/stores/scoped-operation"
import { useWikiTreeModeStore } from "@/stores/wiki-tree-mode"
import { isPublicOperation } from "@/lib/public-operation"
import type { WikiDocumentFieldsFragment } from "@/graphql/gql/graphql"

interface WikiForeignOperationBannerProps {
  document: WikiDocumentFieldsFragment
}

/**
 * Shown above a document that belongs to an operation other than the one
 * the sidebar is scoped to. A shared link opens the page for anyone with
 * access to its operation, but the tree, the pickers and the footer lists
 * keep following the viewer's own scope, so the page looks orphaned. The
 * banner names both operations and offers to switch scope to the page's,
 * keeping the page open.
 *
 * Public pages are scope-independent and never trigger it; the tree-mode
 * toggle already handles those.
 */
export function WikiForeignOperationBanner({
  document: doc,
}: WikiForeignOperationBannerProps) {
  const scoped = useScopedOperationStore((s) => s.scopedOperation)
  const scopeOperationForWikiDocument = useScopedOperationStore(
    (s) => s.scopeOperationForWikiDocument,
  )
  const setTreeMode = useWikiTreeModeStore((s) => s.setMode)

  const docOperationId = doc.operationId
  const isForeign =
    !isPublicOperation(docOperationId) && scoped?.id !== docOperationId
  const { data } = useOperation(isForeign ? docOperationId : "")
  const operation = data?.operation

  if (!isForeign) return null

  const name = operation?.name ?? "another operation"
  const onSwitch = () => {
    if (!operation) return
    scopeOperationForWikiDocument(
      {
        id: operation.id,
        name: operation.name,
        description: operation.description,
      },
      doc.id,
    )
    // The tree follows the scope only in operation mode; a viewer parked on
    // the Public tree would otherwise switch scope and still see Public.
    setTreeMode("operation")
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-primary/30 bg-primary/10 px-3 py-1.5 text-xs"
    >
      <ArrowRightLeftIcon className="size-3.5 shrink-0 text-primary" />
      <span className="min-w-0">
        This page belongs to <strong className="font-medium">{name}</strong>
        {scoped ? (
          <>
            ; the sidebar is showing{" "}
            <strong className="font-medium">{scoped.name}</strong>.
          </>
        ) : (
          "; no operation is scoped."
        )}
      </span>
      <Button
        variant="outline"
        size="xs"
        onClick={onSwitch}
        disabled={!operation}
        className="ml-auto"
      >
        Switch to {operation?.name ?? "…"}
      </Button>
    </div>
  )
}
