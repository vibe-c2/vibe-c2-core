import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { WikiCredentialChip } from "@/components/wiki/wiki-credential-chip"

/**
 * Inline atom node that points at a Findings credential by id. Renders as a
 * chip whose click opens the same details modal as the credentials table row,
 * and whose right-click surfaces the same per-row action menu. All data
 * (name, validity, username, password, keys) is fetched live from the server
 * via `useCredential` — the node persists only `credentialId` so renames and
 * SSE updates flow through without rewriting the document.
 *
 * Serializes to `<span data-wiki-credential data-credential-id="…">` so any
 * downstream HTML consumer that strips custom nodes still sees a stable
 * reference marker.
 */
export const WikiCredentialReferenceExtension = Node.create({
  name: "wikiCredentialReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      credentialId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-credential-id"),
        renderHTML: (attrs) =>
          attrs.credentialId
            ? { "data-credential-id": attrs.credentialId as string }
            : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-wiki-credential]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-credential": "true",
        class: "wiki-credential-chip",
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiCredentialChip)
  },
})
