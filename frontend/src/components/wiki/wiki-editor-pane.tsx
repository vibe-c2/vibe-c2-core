import { Component, type ErrorInfo, type ReactNode } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { useWikiDocument } from "@/graphql/hooks/wiki"
import { WikiEditorHeader } from "@/components/wiki/wiki-editor-header"
import { WikiDocumentMeta } from "@/components/wiki/wiki-document-meta"
import { WikiEditor } from "@/components/wiki/wiki-editor"
import { WikiChildDocumentList } from "@/components/wiki/wiki-child-document-list"
import type { WikiDocumentTreeFieldsFragment } from "@/graphql/gql/graphql"

interface WikiEditorPaneProps {
  documentId: string
  isEditor: boolean
  treeDocuments: WikiDocumentTreeFieldsFragment[]
}

export function WikiEditorPane({
  documentId,
  isEditor,
  treeDocuments,
}: WikiEditorPaneProps) {
  const { data, isLoading, error } = useWikiDocument(documentId)
  const document = data?.wikiDocument

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-4 rounded-lg border bg-card p-4">
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
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border bg-card text-muted-foreground">
        <p className="text-sm">Document not found</p>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
      <WikiEditorHeader
        document={document}
        isEditor={isEditor}
        treeDocuments={treeDocuments}
      />
      <WikiDocumentMeta document={document} />
      <EditorErrorBoundary documentId={documentId}>
        <WikiEditor
          documentId={documentId}
          isEditor={isEditor}
          footer={
            <WikiChildDocumentList
              documentId={documentId}
              treeDocuments={treeDocuments}
              isEditor={isEditor}
            />
          }
        />
      </EditorErrorBoundary>
    </div>
  )
}

// Error boundary — catches editor crashes and shows a recovery UI
// instead of white-screening the entire wiki page.

interface ErrorBoundaryProps {
  documentId: string
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
  documentId: string
}

class EditorErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, documentId: this.props.documentId }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (props.documentId !== state.documentId) {
      return { error: null, documentId: props.documentId }
    }
    return null
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
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
