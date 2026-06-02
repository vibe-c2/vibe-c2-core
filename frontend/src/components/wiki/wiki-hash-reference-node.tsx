import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { WikiHashChip } from "@/components/wiki/wiki-hash-chip"

/**
 * Inline atom node that points at a Findings hash by id. Renders as a chip
 * whose click opens the same details modal as the hashes table row, and whose
 * right-click surfaces the same per-row action menu. All data (value, cracked
 * status, linked credential) is fetched live from the server via `useHash` —
 * the node persists only `hashId` so status changes and SSE updates flow
 * through without rewriting the document.
 *
 * Serializes to `<span data-wiki-hash data-hash-id="…">` so any downstream
 * HTML consumer that strips custom nodes still sees a stable reference marker.
 * Sibling of WikiCredentialReferenceExtension.
 */
export const WikiHashReferenceExtension = Node.create({
  name: "wikiHashReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      hashId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-hash-id"),
        renderHTML: (attrs) =>
          attrs.hashId ? { "data-hash-id": attrs.hashId as string } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-wiki-hash]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-hash": "true",
        class: "wiki-hash-chip",
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiHashChip)
  },
})
