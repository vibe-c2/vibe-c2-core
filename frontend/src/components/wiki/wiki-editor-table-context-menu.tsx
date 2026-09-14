import { useEffect, useState } from "react"
import type { Editor } from "@tiptap/react"
// Side-effect import so the Table extension's module augmentation is in
// scope and chain().addRowBefore() & co. are typed.
import "@tiptap/extension-table"
import { CellSelection } from "@tiptap/pm/tables"
import {
  ArrowDownToLineIcon,
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  ArrowUpToLineIcon,
  Columns3Icon,
  CombineIcon,
  PanelLeftIcon,
  PanelTopIcon,
  Rows3Icon,
  SplitIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { decideTableContextMenu } from "@/components/wiki/table-context-menu-gate"

interface WikiEditorTableMenuProps {
  editor: Editor | null
}

// A virtual anchor at a viewport point. Base UI positions a context menu with
// `position: fixed`, so client coordinates from the event are exactly right.
type PointAnchor = { getBoundingClientRect: () => DOMRect }

function pointAnchor(x: number, y: number): PointAnchor {
  return {
    getBoundingClientRect: () =>
      DOMRect.fromRect({ x, y, width: 0, height: 0 }),
  }
}

/**
 * Right-click menu for table structure actions.
 *
 * Controlled-open by design. An earlier version wrapped the whole editor in a
 * Base UI context-menu trigger and tried to let non-table clicks through with
 * preventBaseUIHandler(); that failed because the trigger also installs a
 * document-level `contextmenu` listener which preventDefault()s every click
 * inside it, suppressing the native browser menu across the entire document
 * with no way to opt back out. See table-context-menu-gate.ts.
 *
 * Instead, nothing wraps the editor. One `contextmenu` listener on the editor
 * DOM decides per click: only a right-click inside an editable cell is
 * intercepted (native menu suppressed, our menu opened at the cursor);
 * everything else is left entirely to the browser.
 */
export function WikiEditorTableContextMenu({ editor }: WikiEditorTableMenuProps) {
  const [open, setOpen] = useState(false)
  // The anchor is a ref-backed piece of state: we set it synchronously in the
  // event handler, then open. A plain object is enough for Base UI's
  // getBoundingClientRect-based positioning.
  const [anchor, setAnchor] = useState<PointAnchor | null>(null)

  useEffect(() => {
    if (!editor) return
    // Capture as a non-null const so the nested handler keeps the narrowed
    // type; a prop cannot be narrowed across a closure boundary.
    const ed = editor
    const dom = ed.view.dom

    function handleContextMenu(event: MouseEvent) {
      const cell = findCell(ed, event.target)
      const action = decideTableContextMenu({
        cellFound: cell !== null,
        isEditable: ed.isEditable,
      })
      if (action === "passthrough") return

      // A table cell in an editable doc: this is ours.
      event.preventDefault()
      if (cell) moveSelectionIntoCell(ed, cell, event)
      setAnchor(pointAnchor(event.clientX, event.clientY))
      setOpen(true)
    }

    dom.addEventListener("contextmenu", handleContextMenu)
    return () => dom.removeEventListener("contextmenu", handleContextMenu)
  }, [editor])

  if (!editor) return null

  // editor is non-null past the guard; menu commands close over it directly.
  const run = (fn: (editor: Editor) => void) => {
    fn(editor)
    setOpen(false)
  }

  return (
    <ContextMenu open={open} onOpenChange={setOpen}>
      {anchor && (
        <ContextMenuContent anchor={anchor}>
          <ContextMenuGroup>
            <ContextMenuLabel>Row</ContextMenuLabel>
            <Item
              icon={ArrowUpToLineIcon}
              label="Insert row above"
              onSelect={() => run((e) => e.chain().focus().addRowBefore().run())}
            />
            <Item
              icon={ArrowDownToLineIcon}
              label="Insert row below"
              onSelect={() => run((e) => e.chain().focus().addRowAfter().run())}
            />
            <Item
              icon={Rows3Icon}
              label="Delete row"
              destructive
              onSelect={() => run((e) => e.chain().focus().deleteRow().run())}
            />
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuLabel>Column</ContextMenuLabel>
            <Item
              icon={ArrowLeftToLineIcon}
              label="Insert column left"
              onSelect={() => run((e) => e.chain().focus().addColumnBefore().run())}
            />
            <Item
              icon={ArrowRightToLineIcon}
              label="Insert column right"
              onSelect={() => run((e) => e.chain().focus().addColumnAfter().run())}
            />
            <Item
              icon={Columns3Icon}
              label="Delete column"
              destructive
              onSelect={() => run((e) => e.chain().focus().deleteColumn().run())}
            />
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuLabel>Cells</ContextMenuLabel>
            <Item
              icon={CombineIcon}
              label="Merge cells"
              disabled={!editor.can().mergeCells()}
              onSelect={() => run((e) => e.chain().focus().mergeCells().run())}
            />
            <Item
              icon={SplitIcon}
              label="Split cell"
              disabled={!editor.can().splitCell()}
              onSelect={() => run((e) => e.chain().focus().splitCell().run())}
            />
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuLabel>Table</ContextMenuLabel>
            <Item
              icon={PanelTopIcon}
              label="Toggle header row"
              onSelect={() => run((e) => e.chain().focus().toggleHeaderRow().run())}
            />
            <Item
              icon={PanelLeftIcon}
              label="Toggle header column"
              onSelect={() => run((e) => e.chain().focus().toggleHeaderColumn().run())}
            />
            <Item
              icon={Trash2Icon}
              label="Delete table"
              destructive
              onSelect={() => run((e) => e.chain().focus().deleteTable().run())}
            />
          </ContextMenuGroup>
        </ContextMenuContent>
      )}
    </ContextMenu>
  )
}

function Item({
  icon: Icon,
  label,
  destructive,
  disabled,
  onSelect,
}: {
  icon: LucideIcon
  label: string
  destructive?: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <ContextMenuItem
      variant={destructive ? "destructive" : "default"}
      disabled={disabled}
      onClick={onSelect}
    >
      <Icon className="size-3.5" />
      {label}
    </ContextMenuItem>
  )
}

function findCell(editor: Editor, target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const cell = target.closest<HTMLElement>("td, th")
  if (!cell || !editor.view.dom.contains(cell)) return null
  return cell
}

function moveSelectionIntoCell(
  editor: Editor,
  cell: HTMLElement,
  event: MouseEvent,
) {
  const { view } = editor
  // A right-click on a cell that is part of a drag-selected range must keep
  // that range: merge only works on a multi-cell selection, and the menu
  // is the natural place to reach it after dragging.
  if (view.state.selection instanceof CellSelection && cell.classList.contains("selectedCell")) {
    return
  }
  const domSelection = view.dom.ownerDocument.getSelection()
  const anchorNode = domSelection?.anchorNode ?? null
  if (anchorNode && cell.contains(anchorNode)) return

  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
  const pos = coords?.pos ?? view.posAtDOM(cell, 0)
  editor.chain().focus().setTextSelection(pos).run()
}
