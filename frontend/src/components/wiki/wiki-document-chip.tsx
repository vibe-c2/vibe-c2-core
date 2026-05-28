import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { WikiDocumentChipById } from "@/components/wiki/wiki-document-chip-view"

/**
 * NodeView for `WikiDocumentReferenceExtension`. Visual + behaviour live in
 * `WikiDocumentChipView`; this file only adapts the TipTap NodeView API
 * (`NodeViewWrapper`, `selected`, viewport gating) to that presentation.
 *
 * Failure modes (missing id / loading / fetch error / deleted) all render
 * inside the view so the chip footprint stays stable across states.
 */
export function WikiDocumentChip({ node, selected }: NodeViewProps) {
  const id = (node.attrs.documentId as string | null) ?? ""
  return (
    <NodeViewWrapper as="span" className="wiki-document-chip-wrapper">
      <WikiDocumentChipById id={id} gateOnViewport selected={selected} />
    </NodeViewWrapper>
  )
}
