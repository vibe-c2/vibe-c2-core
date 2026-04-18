import { FileTextIcon } from "lucide-react"
import { WikiEditorPane } from "@/components/wiki/wiki-editor-pane"
import type { WikiDocumentTreeFieldsFragment } from "@/graphql/gql/graphql"

interface WikiContentAreaProps {
  documentId: string | null
  isEditor: boolean
  treeDocuments: WikiDocumentTreeFieldsFragment[]
}

// Content area for the wiki page. Search used to live here inline; it's now
// a floating command palette (see WikiCommandPalette) that doesn't cover the
// editor while typing.
export function WikiContentArea({
  documentId,
  isEditor,
  treeDocuments,
}: WikiContentAreaProps) {
  if (documentId) {
    return (
      <WikiEditorPane
        documentId={documentId}
        isEditor={isEditor}
        treeDocuments={treeDocuments}
      />
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <FileTextIcon className="size-10 opacity-40" />
      <p className="text-sm">Select or create a document</p>
    </div>
  )
}
