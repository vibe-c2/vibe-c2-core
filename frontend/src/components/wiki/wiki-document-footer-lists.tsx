import { WikiChildDocumentList } from "@/components/wiki/wiki-child-document-list"
import { WikiBacklinkList } from "@/components/wiki/wiki-backlink-list"
import { WikiTaskBacklinkList } from "@/components/wiki/wiki-task-backlink-list"

interface WikiDocumentFooterListsProps {
  documentId: string
  operationId: string
  isEditor: boolean
}

/**
 * Combined "Sub-pages + Backlinks + Task backlinks" footer block. The three
 * lists share a border-divider header and a container-query grid so they sit
 * side-by-side when the editor pane is wide, fall to two columns on medium
 * panes, and stack on narrow ones.
 *
 * Container queries (`@container/footer` + `@3xl/footer:grid-cols-2`
 * + `@5xl/footer:grid-cols-3`) instead of viewport media queries because the
 * editor pane width is independent of the viewport — sidebar collapse,
 * resize, and zoom-mode all shift it without touching window size. The
 * breakpoints aim at "two columns once each list has comfortable row width,
 * three once the pane could host all three without cramping any of them."
 */
export function WikiDocumentFooterLists({
  documentId,
  operationId,
  isEditor,
}: WikiDocumentFooterListsProps) {
  return (
    <div className="@container/footer mt-8 border-t pt-4">
      <div className="grid grid-cols-1 gap-6 @3xl/footer:grid-cols-2 @3xl/footer:gap-8 @5xl/footer:grid-cols-3">
        <WikiChildDocumentList
          documentId={documentId}
          operationId={operationId}
          isEditor={isEditor}
        />
        <WikiBacklinkList documentId={documentId} />
        <WikiTaskBacklinkList
          documentId={documentId}
          operationId={operationId}
        />
      </div>
    </div>
  )
}
