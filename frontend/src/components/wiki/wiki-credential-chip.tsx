import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { WikiCredentialChipById } from "@/components/wiki/wiki-credential-chip-view"

/**
 * NodeView for `WikiCredentialReferenceExtension`. Visual + behaviour live in
 * `WikiCredentialChipView`; this file only adapts the TipTap NodeView API
 * (`NodeViewWrapper`, `selected`, viewport gating, context menu wiring) to
 * that presentation. See the view file for the chip's failure modes and the
 * SHA-1 / segment rendering rationale.
 */
export function WikiCredentialChip({ node, selected }: NodeViewProps) {
  const id = (node.attrs.credentialId as string | null) ?? ""
  return (
    <NodeViewWrapper as="span" className="wiki-credential-chip-wrapper">
      <WikiCredentialChipById
        id={id}
        gateOnViewport
        selected={selected}
        withContextMenu
      />
    </NodeViewWrapper>
  )
}
