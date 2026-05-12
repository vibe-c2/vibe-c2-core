import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { WikiDocumentChip } from "@/components/wiki/wiki-document-chip"

/**
 * Inline atom node that points at another wiki document by id. Inserted via
 * the `/doc` slash command; clicking the rendered chip navigates to the
 * referenced page. All data (title, icon trio, deleted state) is fetched
 * live via `useWikiDocumentLite` — the node persists only `documentId` so
 * renames and metadata edits flow through without rewriting the document.
 *
 * Serializes to `<span data-wiki-document data-document-id="…">` so any
 * downstream HTML consumer that strips custom nodes still sees a stable
 * reference marker. The Hocuspocus sidecar scans for this node type to
 * populate `wiki_documents.references`, which drives the backlinks list.
 */
export const WikiDocumentReferenceExtension = Node.create({
  name: "wikiDocumentReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      documentId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-document-id"),
        renderHTML: (attrs) =>
          attrs.documentId
            ? { "data-document-id": attrs.documentId as string }
            : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-wiki-document]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-document": "true",
        class: "wiki-document-chip",
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiDocumentChip)
  },
})
