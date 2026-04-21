import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { WikiFileCard } from "@/components/wiki/wiki-file-card"

/**
 * Atom block node representing a generic file attachment. Bytes live in the
 * wiki_files bucket; this node persists only the metadata needed to re-render
 * the download card and (for safe types) open an inline preview.
 *
 * Round-trips through HTML as a `<div data-wiki-file>` wrapping an anchor so
 * any consumer that strips custom nodes still sees the file URL — and so the
 * sweeper's URL regex can detect the reference in any HTML serialization.
 */
export const WikiFileExtension = Node.create({
  name: "wikiFile",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      fileId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-file-id"),
        renderHTML: (attrs) =>
          attrs.fileId ? { "data-file-id": attrs.fileId as string } : {},
      },
      url: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-url"),
        renderHTML: (attrs) =>
          attrs.url ? { "data-url": attrs.url as string } : {},
      },
      filename: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-filename") ?? "",
        renderHTML: (attrs) =>
          attrs.filename
            ? { "data-filename": attrs.filename as string }
            : {},
      },
      size: {
        default: 0,
        parseHTML: (el) => {
          const raw = el.getAttribute("data-size")
          const n = raw ? Number(raw) : NaN
          return Number.isFinite(n) ? n : 0
        },
        renderHTML: (attrs) => ({ "data-size": String(attrs.size ?? 0) }),
      },
      contentType: {
        default: "application/octet-stream",
        parseHTML: (el) =>
          el.getAttribute("data-content-type") ??
          "application/octet-stream",
        renderHTML: (attrs) => ({
          "data-content-type":
            (attrs.contentType as string) ?? "application/octet-stream",
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-wiki-file]" }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const filename = (node.attrs.filename as string) || "file"
    const url = (node.attrs.url as string | null) ?? ""
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-file": "true",
        class: "wiki-file-card",
      }),
      ["a", { href: url, download: filename, rel: "noopener noreferrer" }, filename],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiFileCard)
  },
})
