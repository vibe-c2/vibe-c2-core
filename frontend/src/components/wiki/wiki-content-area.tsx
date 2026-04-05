import { FileTextIcon } from "lucide-react"
import { useWikiStore } from "@/stores/wiki"
import { WikiEditorPane } from "@/components/wiki/wiki-editor-pane"
import { WikiSearchResults } from "@/components/wiki/wiki-search-results"
import type { WikiDocumentTreeFieldsFragment } from "@/graphql/gql/graphql"

interface WikiContentAreaProps {
  operationId: string
  documentId: string | null
  isEditor: boolean
  treeDocuments: WikiDocumentTreeFieldsFragment[]
}

export function WikiContentArea({
  operationId,
  documentId,
  isEditor,
  treeDocuments,
}: WikiContentAreaProps) {
  const searchScope = useWikiStore((s) => s.searchScope)

  // Content search replaces the editor when active.
  if (searchScope) {
    return (
      <WikiSearchResults
        operationId={operationId}
        scope={searchScope}
        treeDocuments={treeDocuments}
      />
    )
  }

  // Document selected — show editor.
  if (documentId) {
    return (
      <WikiEditorPane
        key={documentId}
        documentId={documentId}
        isEditor={isEditor}
      />
    )
  }

  // No document selected — empty state.
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <FileTextIcon className="size-10 opacity-40" />
      <p className="text-sm">Select or create a document</p>
    </div>
  )
}
