// The decision the wiki table context menu makes on every right-click, kept
// pure so it can be unit-tested without a DOM.
//
// This is the fix for the whole-page regression: the previous version wrapped
// the entire editor in a Base UI context-menu trigger, whose document-level
// `contextmenu` listener called preventDefault() for every right-click inside
// it — killing the native browser menu across the whole document, with no way
// to opt a click back out. Now nothing wraps the editor; a single listener
// asks this function what to do and only ever preventDefault()s for a click
// that lands in an editable table cell. Everything else passes through to the
// browser untouched.

export type TableContextMenuAction =
  // Right-click landed in an editable table cell: suppress the native menu
  // and open our table menu at the cursor.
  | "open"
  // Anything else — prose, a non-editable (read-only) document, a click
  // outside the editor: do nothing, let the browser show its own menu.
  | "passthrough"

export interface TableContextMenuInput {
  // Whether the right-click landed inside a <td>/<th> that belongs to this
  // editor. The DOM lookup lives in the component; this function only judges
  // the result.
  cellFound: boolean
  // Whether the editor is editable. A read-only page has no table actions to
  // offer, so its cells behave like ordinary content.
  isEditable: boolean
}

export function decideTableContextMenu({
  cellFound,
  isEditable,
}: TableContextMenuInput): TableContextMenuAction {
  if (cellFound && isEditable) return "open"
  return "passthrough"
}
