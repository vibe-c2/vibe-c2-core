import type { ReactNode } from "react"
import type { Editor } from "@tiptap/react"
// Side-effect import so the Table extension's module augmentation is in
// scope and chain().addRowBefore() & co. are typed.
import "@tiptap/extension-table"
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
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

interface WikiEditorTableContextMenuProps {
  editor: Editor | null
  children: ReactNode
}

// Base UI merges our handler with the trigger's own and calls ours first;
// preventBaseUIHandler() stops the trigger from opening the menu. The
// synthetic event type does not declare it, so widen locally.
type PreventableEvent = { preventBaseUIHandler?: () => void }

/**
 * Right-click menu for table structure actions. Wraps the editor content so
 * a single trigger covers every table in the document; the handler gates on
 * the click landing inside a <td>/<th>, so right-clicking prose outside a
 * table still gets the browser's native menu.
 *
 * Right-click in contentEditable does not reliably move the caret, so the
 * handler also drops the selection into the clicked cell when it isn't
 * already there — the row/column commands act on the selection, and acting
 * on a cell the user didn't click would be surprising.
 */
export function WikiEditorTableContextMenu({
  editor,
  children,
}: WikiEditorTableContextMenuProps) {
  if (!editor) return <>{children}</>

  const gate = (event: React.SyntheticEvent & PreventableEvent) => {
    const cell = findCell(editor, event.target)
    if (!cell || !editor.isEditable) {
      event.preventBaseUIHandler?.()
      return
    }
    moveSelectionIntoCell(editor, cell, event)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger onContextMenu={gate} onTouchStart={gate}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuLabel>Row</ContextMenuLabel>
          <Item
            icon={ArrowUpToLineIcon}
            label="Insert row above"
            onSelect={() => editor.chain().focus().addRowBefore().run()}
          />
          <Item
            icon={ArrowDownToLineIcon}
            label="Insert row below"
            onSelect={() => editor.chain().focus().addRowAfter().run()}
          />
          <Item
            icon={Rows3Icon}
            label="Delete row"
            destructive
            onSelect={() => editor.chain().focus().deleteRow().run()}
          />
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuLabel>Column</ContextMenuLabel>
          <Item
            icon={ArrowLeftToLineIcon}
            label="Insert column left"
            onSelect={() => editor.chain().focus().addColumnBefore().run()}
          />
          <Item
            icon={ArrowRightToLineIcon}
            label="Insert column right"
            onSelect={() => editor.chain().focus().addColumnAfter().run()}
          />
          <Item
            icon={Columns3Icon}
            label="Delete column"
            destructive
            onSelect={() => editor.chain().focus().deleteColumn().run()}
          />
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuLabel>Cells</ContextMenuLabel>
          <Item
            icon={CombineIcon}
            label="Merge cells"
            disabled={!editor.can().mergeCells()}
            onSelect={() => editor.chain().focus().mergeCells().run()}
          />
          <Item
            icon={SplitIcon}
            label="Split cell"
            disabled={!editor.can().splitCell()}
            onSelect={() => editor.chain().focus().splitCell().run()}
          />
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuLabel>Table</ContextMenuLabel>
          <Item
            icon={PanelTopIcon}
            label="Toggle header row"
            onSelect={() => editor.chain().focus().toggleHeaderRow().run()}
          />
          <Item
            icon={PanelLeftIcon}
            label="Toggle header column"
            onSelect={() => editor.chain().focus().toggleHeaderColumn().run()}
          />
          <Item
            icon={Trash2Icon}
            label="Delete table"
            destructive
            onSelect={() => editor.chain().focus().deleteTable().run()}
          />
        </ContextMenuGroup>
      </ContextMenuContent>
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
  event: React.SyntheticEvent,
) {
  const { view } = editor
  const domSelection = view.dom.ownerDocument.getSelection()
  const anchorNode = domSelection?.anchorNode ?? null
  if (anchorNode && cell.contains(anchorNode)) return

  const native = event.nativeEvent
  const point =
    native instanceof MouseEvent
      ? { left: native.clientX, top: native.clientY }
      : native instanceof TouchEvent && native.touches.length > 0
        ? { left: native.touches[0].clientX, top: native.touches[0].clientY }
        : null
  const coords = point ? view.posAtCoords(point) : null
  const pos = coords?.pos ?? view.posAtDOM(cell, 0)
  editor.chain().focus().setTextSelection(pos).run()
}
