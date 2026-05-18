import { WikiChildDocumentList } from "@/components/wiki/wiki-child-document-list"
import { WikiBacklinkList } from "@/components/wiki/wiki-backlink-list"

interface WikiDocumentFooterListsProps {
  documentId: string
  operationId: string
  isEditor: boolean
}

/**
 * Combined "Sub-pages + Backlinks" footer block. The two lists share a
 * border-divider header and a container-query grid so they sit side-by-side
 * when the editor pane is wide and stack when it's narrow.
 *
 * Container queries (`@container/footer` + `@3xl/footer:grid-cols-2`) instead
 * of viewport media queries because the editor pane width is independent of
 * the viewport — sidebar collapse, resize, and zoom-mode all shift it without
 * touching window size. ~3xl (≈768px) is the threshold where two columns of
 * row-shaped link lists feel comfortable rather than cramped.
 */
export function WikiDocumentFooterLists({
  documentId,
  operationId,
  isEditor,
}: WikiDocumentFooterListsProps) {
  return (
    <div className="@container/footer mt-8 border-t pt-4">
      <div className="grid grid-cols-1 gap-6 @3xl/footer:grid-cols-2 @3xl/footer:gap-8">
        <WikiChildDocumentList
          documentId={documentId}
          operationId={operationId}
          isEditor={isEditor}
        />
        <WikiBacklinkList documentId={documentId} />
      </div>
    </div>
  )
}
