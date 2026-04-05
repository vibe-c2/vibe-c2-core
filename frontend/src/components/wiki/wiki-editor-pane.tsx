import { Component, type ErrorInfo, type ReactNode } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { useWikiDocument } from "@/graphql/hooks/wiki"
import { WikiEditorHeader } from "@/components/wiki/wiki-editor-header"
import { WikiEditor } from "@/components/wiki/wiki-editor"

interface WikiEditorPaneProps {
  documentId: string
  isEditor: boolean
}

export function WikiEditorPane({
  documentId,
  isEditor,
}: WikiEditorPaneProps) {
  const { data, isLoading, error } = useWikiDocument(documentId)
  const document = data?.wikiDocument

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded" />
          <Skeleton className="h-7 w-64" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    )
  }

  if (error || !document) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm">Document not found</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <WikiEditorHeader
        document={document}
        isEditor={isEditor}
      />
      <EditorErrorBoundary key={documentId}>
        <WikiEditor
          documentId={documentId}
          isEditor={isEditor}
          content={document.content}
        />
      </EditorErrorBoundary>
    </div>
  )
}

// Error boundary — catches editor crashes and shows a recovery UI
// instead of white-screening the entire wiki page.

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

class EditorErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Wiki editor crashed:", error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return <EditorErrorFallback onRetry={() => this.setState({ error: null })} />
    }
    return this.props.children
  }
}

function EditorErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <p className="text-sm">Something went wrong loading the editor.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
