import { Mark, mergeAttributes } from "@tiptap/core"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiHighlight: {
      setWikiHighlight: (color: string) => ReturnType
      unsetWikiHighlight: () => ReturnType
    }
  }
}

// Render highlight backgrounds as a translucent mix of the stored OKLCH
// source color so the swatch palette (which gives us foreground tones at
// L≈0.65) reads as a readable highlight tint instead of a fully saturated
// fill. The data-color attribute is what round-trips through markdown —
// CSS derives the actual background on render.
function highlightBackgroundStyle(color: string): string {
  return `background-color: color-mix(in oklch, ${color} 28%, transparent);`
}

export const WikiHighlightMark = Mark.create({
  name: "wikiHighlight",
  inclusive: true,

  addAttributes() {
    return {
      color: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-color") ?? "",
        renderHTML: (attrs) => {
          const color = typeof attrs.color === "string" ? attrs.color : ""
          if (!color) return {}
          return {
            "data-color": color,
            style: highlightBackgroundStyle(color),
          }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: "mark" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "mark",
      mergeAttributes(HTMLAttributes, { class: "wiki-highlight" }),
      0,
    ]
  },

  addCommands() {
    return {
      setWikiHighlight:
        (color: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { color }),
      unsetWikiHighlight:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },
})
