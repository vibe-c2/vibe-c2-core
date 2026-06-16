import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { WikiHostChipById } from "@/components/wiki/wiki-host-chip-view"

/**
 * NodeView for `WikiHostReferenceExtension`. Visual + behaviour live in
 * `WikiHostChipView`; this file only adapts the TipTap NodeView API
 * (`NodeViewWrapper`, `selected`, viewport gating) to that presentation.
 * Sibling of WikiHashChip — simpler, because the host chip has no in-editor
 * node-swap action, so the NodeView owns no document-position logic.
 */
export function WikiHostChip({ node, selected }: NodeViewProps) {
  const id = (node.attrs.hostId as string | null) ?? ""

  return (
    <NodeViewWrapper as="span" className="wiki-host-chip-wrapper">
      <WikiHostChipById id={id} gateOnViewport selected={selected} />
    </NodeViewWrapper>
  )
}
