import { useCallback } from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { WikiHashChipById } from "@/components/wiki/wiki-hash-chip-view"

/**
 * NodeView for `WikiHashReferenceExtension`. Visual + behaviour live in
 * `WikiHashChipView`; this file only adapts the TipTap NodeView API
 * (`NodeViewWrapper`, `selected`, viewport gating, context menu wiring) to
 * that presentation. Sibling of WikiCredentialChip.
 *
 * The one editor-specific concern owned here is the "Replace with credential
 * reference" swap: only the NodeView has the editor + node position needed to
 * rewrite this `wikiHashReference` atom into a `wikiCredentialReference` atom
 * in place. The view decides *when* the action is offered (cracked hash with a
 * linked credential) and gates it behind a warning; this callback performs the
 * actual document edit.
 */
export function WikiHashChip({
  node,
  selected,
  editor,
  getPos,
}: NodeViewProps) {
  const id = (node.attrs.hashId as string | null) ?? ""

  const replaceWithCredential = useCallback(
    (credentialId: string) => {
      const pos = typeof getPos === "function" ? getPos() : undefined
      if (pos == null) return
      // Inline atom → nodeSize is 1, but read it off the node so a future
      // schema change can't silently leave a stray character behind.
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: pos, to: pos + node.nodeSize },
          { type: "wikiCredentialReference", attrs: { credentialId } },
        )
        .run()
    },
    [editor, getPos, node],
  )

  return (
    <NodeViewWrapper as="span" className="wiki-hash-chip-wrapper">
      <WikiHashChipById
        id={id}
        gateOnViewport
        selected={selected}
        withContextMenu
        onReplaceWithCredential={replaceWithCredential}
      />
    </NodeViewWrapper>
  )
}
