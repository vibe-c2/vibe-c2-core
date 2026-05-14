import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { Link } from "react-router"
import { FileTextIcon, LinkIcon } from "lucide-react"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { useWikiDocumentLite } from "@/graphql/hooks/wiki"
import { GraphQLRequestError } from "@/lib/graphql-client"
import { cn } from "@/lib/utils"

/**
 * NodeView for `WikiDocumentReferenceExtension`. Hydrates the chip from the
 * referenced document via `useWikiDocumentLite` and renders an inline pill
 * that navigates to the target page on click.
 *
 * Failure modes render as inert placeholders so the surrounding prose stays
 * intact when the referenced document is missing, deleted, or inaccessible.
 */
export function WikiDocumentChip({ node, selected }: NodeViewProps) {
  const id = (node.attrs.documentId as string | null) ?? ""
  const { data, isLoading, error } = useWikiDocumentLite(id)
  const doc = data?.wikiDocument

  if (!id) {
    return (
      <NodeViewWrapper as="span" className="wiki-document-chip-wrapper">
        <span
          className={cn(
            "wiki-document-chip wiki-document-chip--missing",
            selected && "is-selected",
          )}
          title="This document reference is missing an id"
        >
          <LinkIcon className="size-3.5" />
          <span className="wiki-document-chip__name">Broken reference</span>
        </span>
      </NodeViewWrapper>
    )
  }

  if (isLoading && !doc) {
    return (
      <NodeViewWrapper as="span" className="wiki-document-chip-wrapper">
        <span
          className={cn(
            "wiki-document-chip wiki-document-chip--loading",
            selected && "is-selected",
          )}
        >
          <FileTextIcon className="size-3.5" />
          <span className="wiki-document-chip__skel" aria-hidden />
        </span>
      </NodeViewWrapper>
    )
  }

  if (error || !doc) {
    const forbidden = isForbiddenError(error)
    return (
      <NodeViewWrapper as="span" className="wiki-document-chip-wrapper">
        <span
          className={cn(
            "wiki-document-chip wiki-document-chip--missing",
            selected && "is-selected",
          )}
          title={
            forbidden
              ? "You don't have access to this document"
              : "Document not found — it may have been deleted"
          }
        >
          <FileTextIcon className="size-3.5" />
          <span className="wiki-document-chip__name">
            {forbidden ? "No access" : "Document deleted"}
          </span>
        </span>
      </NodeViewWrapper>
    )
  }

  const isDeleted = !!doc.deletedAt
  const displayTitle = doc.title || "Untitled"

  const iconAndLabel = (
    <>
      <span className="wiki-document-chip__icon">
        <DocumentIcon emoji={doc.emoji} icon={doc.icon} color={doc.color} />
      </span>
      <span className="wiki-document-chip__name">{displayTitle}</span>
    </>
  )

  if (isDeleted) {
    return (
      <NodeViewWrapper as="span" className="wiki-document-chip-wrapper">
        <span
          className={cn(
            "wiki-document-chip wiki-document-chip--missing",
            selected && "is-selected",
          )}
          aria-disabled="true"
          title="This document is in the trash"
        >
          {iconAndLabel}
        </span>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper as="span" className="wiki-document-chip-wrapper">
      <Link
        to={`/wiki/${doc.id}`}
        className={cn("wiki-document-chip", selected && "is-selected")}
        title={displayTitle}
      >
        {iconAndLabel}
      </Link>
    </NodeViewWrapper>
  )
}

function isForbiddenError(error: unknown): boolean {
  return (
    error instanceof GraphQLRequestError &&
    error.errors.some((e) => e.extensions?.code === "FORBIDDEN")
  )
}
