import { Extension } from "@tiptap/core"
import { TextSelection, type EditorState } from "@tiptap/pm/state"

/**
 * Lets the user escape a non-paragraph block (code block, heading, table, etc.)
 * that sits at the very top or bottom of the document by pressing ArrowUp /
 * ArrowDown — a new empty paragraph is inserted above/below and the cursor
 * moves into it. Without this, a document that opens with a code block is
 * effectively uneditable above the block.
 */
export const WikiEscapeEdgeBlock = Extension.create({
  name: "wikiEscapeEdgeBlock",

  addKeyboardShortcuts() {
    return {
      ArrowUp: () => insertParagraphAtEdge(this.editor.state, this.editor.view, "start"),
      ArrowDown: () => insertParagraphAtEdge(this.editor.state, this.editor.view, "end"),
    }
  },
})

type Edge = "start" | "end"

function insertParagraphAtEdge(
  state: EditorState,
  view: { dispatch: (tr: ReturnType<EditorState["tr"]["scrollIntoView"]>) => void },
  edge: Edge,
): boolean {
  const { selection, doc, schema } = state
  if (!selection.empty) return false

  const paragraphType = schema.nodes.paragraph
  if (!paragraphType) return false

  const $from = selection.$from
  if ($from.depth < 1) return false

  // Every ancestor from the top-level block down to the leaf must be at its
  // start (for ArrowUp) or its end (for ArrowDown) — otherwise the default
  // cursor motion within the current block takes precedence.
  for (let d = 1; d <= $from.depth; d++) {
    const index = $from.index(d)
    const parent = $from.node(d)
    if (edge === "start" && index !== 0) return false
    if (edge === "end" && index !== parent.childCount - 1) return false
  }

  if (edge === "start" && $from.parentOffset !== 0) return false
  if (edge === "end" && $from.parentOffset !== $from.parent.content.size) return false

  const topLevel = edge === "start" ? doc.firstChild : doc.lastChild
  if (!topLevel || topLevel.type === paragraphType) return false

  const insertAt = edge === "start" ? 0 : doc.content.size
  const paragraph = paragraphType.createAndFill()
  if (!paragraph) return false

  const tr = state.tr.insert(insertAt, paragraph)
  const cursorPos = edge === "start" ? 1 : insertAt + 1
  tr.setSelection(TextSelection.create(tr.doc, cursorPos))
  view.dispatch(tr.scrollIntoView())
  return true
}
