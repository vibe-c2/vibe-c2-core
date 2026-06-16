import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { WikiHostChip } from "@/components/wiki/wiki-host-chip"

/**
 * Inline atom node that points at a Findings host by id. Renders as a chip
 * whose click opens the host dialog (the app's host detail + edit surface).
 * All data (hostname, OS glyph, interfaces) is fetched live from the server via
 * `useHost` — the node persists only `hostId`, so renames and topology edits
 * flow through without rewriting the document.
 *
 * Serializes to `<span data-wiki-host data-host-id="…">` so any downstream HTML
 * consumer that strips custom nodes still sees a stable reference marker.
 * Sibling of WikiHashReferenceExtension.
 */
export const WikiHostReferenceExtension = Node.create({
  name: "wikiHostReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      hostId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-host-id"),
        renderHTML: (attrs) =>
          attrs.hostId ? { "data-host-id": attrs.hostId as string } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-wiki-host]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-host": "true",
        class: "wiki-host-chip",
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiHostChip)
  },
})
