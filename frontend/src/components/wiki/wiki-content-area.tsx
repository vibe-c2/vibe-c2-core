import { FileTextIcon } from "lucide-react"
import { WikiEditorPane } from "@/components/wiki/wiki-editor-pane"

interface WikiContentAreaProps {
  documentId: string | null
  operationId: string
  isEditor: boolean
}

// Content area for the wiki page. Search used to live here inline; it's now
// a floating command palette (see WikiCommandPalette) that doesn't cover the
// editor while typing.
export function WikiContentArea({
  documentId,
  operationId,
  isEditor,
}: WikiContentAreaProps) {
  if (documentId) {
    return (
      <WikiEditorPane
        documentId={documentId}
        operationId={operationId}
        isEditor={isEditor}
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
