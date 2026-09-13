import { useEffect, useState } from "react"
import type { Editor } from "@tiptap/react"
// Side-effect import so the Table extension's command typings are in scope.
import "@tiptap/extension-table"
import {
  ArrowDownToLineIcon,
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  ArrowUpToLineIcon,
  Columns3Icon,
  PanelLeftIcon,
  PanelTopIcon,
  PlusIcon,
  Rows3Icon,
  type LucideIcon,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface WikiEditorTableHandlesProps {
  editor: Editor | null
}

interface HoverTarget {
  table: HTMLTableElement
  row: number
  col: number
}

type Axis = "row" | "col"

const OVERLAY_CLASS = "wiki-table-handles"
const GRIP_GAP = 6
const GRIP_THICKNESS = 6
const GRIP_LENGTH = 22
// Must fit inside the scroll container's 16px side padding (minus the 2px
// gap) so the right strip never sits under the scrollbar.
const STRIP_THICKNESS = 12
// How far outside the table the pointer may travel (to reach a grip or
// strip) before the hover target clears.
const HANDLE_REACH = GRIP_GAP + GRIP_THICKNESS + STRIP_THICKNESS + 8
// Invisible hit box around the thin grip so it is easy to catch.
const GRIP_HIT = 16

/**
 * Hover affordances for tables: a grip above the hovered column and left of
 * the hovered row (each opens a menu for that axis), plus "+" strips along
 * the right and bottom edges that append a column or row.
 *
 * Rendered as a fixed overlay positioned from live DOM rects rather than a
 * custom table node view. The extension's own TableView owns the colgroup
 * that column resizing updates, and replacing it would mean re-implementing
 * that; an overlay leaves the document DOM untouched.
 */
export function WikiEditorTableHandles({ editor }: WikiEditorTableHandlesProps) {
  const [target, setTarget] = useState<HoverTarget | null>(null)
  const [openMenu, setOpenMenu] = useState<Axis | null>(null)
  const [highlight, setHighlight] = useState<Axis | null>(null)
  // Bumped on scroll/resize/transaction so rects are re-read from the DOM.
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!editor) return
    const view = editor.view
    let frame = 0
    let pending: MouseEvent | null = null

    const resolve = (event: MouseEvent) => {
      // Keep the current target while a menu is open — closing it via the
      // pointer would otherwise tear the anchor away first.
      if (openMenu) return
      const el = event.target instanceof Element ? event.target : null
      if (el?.closest(`.${OVERLAY_CLASS}`)) return
      const cell = el?.closest<HTMLTableCellElement>("td, th") ?? null
      const table = cell?.closest("table") ?? null
      const row = cell?.parentElement
      if (!cell || !table || !(row instanceof HTMLTableRowElement) || !view.dom.contains(table)) {
        // Between a cell and its grip the pointer crosses a few pixels of
        // non-cell space; keep the target while it stays near the table.
        setTarget((prev) =>
          prev && prev.table.isConnected &&
          inside(grow(prev.table.getBoundingClientRect(), HANDLE_REACH), event.clientX, event.clientY)
            ? prev
            : null,
        )
        return
      }
      setTarget((prev) =>
        prev && prev.table === table && prev.row === row.rowIndex && prev.col === cell.cellIndex
          ? prev
          : { table, row: row.rowIndex, col: cell.cellIndex },
      )
    }

    const onMouseMove = (event: MouseEvent) => {
      pending = event
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (pending) resolve(pending)
        pending = null
      })
    }
    const bump = () => setTick((t) => t + 1)

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("scroll", bump, { capture: true, passive: true })
    window.addEventListener("resize", bump)
    editor.on("transaction", bump)
    return () => {
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("scroll", bump, { capture: true })
      window.removeEventListener("resize", bump)
      editor.off("transaction", bump)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [editor, openMenu])

  if (!editor || !editor.isEditable || !target) return null
  // The table may have been deleted or re-rendered since the last hover.
  if (!target.table.isConnected) return null

  const geometry = measure(editor, target)
  if (!geometry) return null
  const { tableRect, colRect, rowRect, clip } = geometry

  const colGripVisible = inside(clip, colRect.left + colRect.width / 2, tableRect.top - GRIP_GAP)
  const rowGripVisible = inside(clip, tableRect.left - GRIP_GAP, rowRect.top + rowRect.height / 2)

  const runOn = (axis: Axis, command: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => {
    const cellEl = cellFor(target, axis)
    if (!cellEl) return
    const pos = editor.view.posAtDOM(cellEl, 0)
    command(editor.chain().focus().setTextSelection(pos)).run()
    setOpenMenu(null)
  }

  const appendColumn = () => {
    const lastCell = target.table.rows[0]?.cells[target.table.rows[0].cells.length - 1]
    if (!lastCell) return
    const pos = editor.view.posAtDOM(lastCell, 0)
    editor.chain().focus().setTextSelection(pos).addColumnAfter().run()
  }
  const appendRow = () => {
    const lastRow = target.table.rows[target.table.rows.length - 1]
    const cell = lastRow?.cells[0]
    if (!cell) return
    const pos = editor.view.posAtDOM(cell, 0)
    editor.chain().focus().setTextSelection(pos).addRowAfter().run()
  }

  return (
    <div className={cn(OVERLAY_CLASS, "pointer-events-none fixed inset-0 z-40")}>
      {highlight === "col" && (
        <div
          className="fixed rounded-sm bg-primary/10"
          style={{ left: colRect.left, top: tableRect.top, width: colRect.width, height: tableRect.height }}
        />
      )}
      {highlight === "row" && (
        <div
          className="fixed rounded-sm bg-primary/10"
          style={{ left: tableRect.left, top: rowRect.top, width: tableRect.width, height: rowRect.height }}
        />
      )}

      {colGripVisible && (
        <AxisMenu
          axis="col"
          open={openMenu === "col"}
          onOpenChange={(open) => setOpenMenu(open ? "col" : null)}
          onHoverChange={(h) => setHighlight(h ? "col" : null)}
          style={{
            left: colRect.left + colRect.width / 2 - GRIP_LENGTH / 2,
            top: tableRect.top - GRIP_GAP - GRIP_THICKNESS / 2 - GRIP_HIT / 2,
            width: GRIP_LENGTH,
            height: GRIP_HIT,
          }}
          items={[
            { icon: ArrowLeftToLineIcon, label: "Insert column left", run: () => runOn("col", (c) => c.addColumnBefore()) },
            { icon: ArrowRightToLineIcon, label: "Insert column right", run: () => runOn("col", (c) => c.addColumnAfter()) },
            { icon: PanelLeftIcon, label: "Toggle header column", run: () => runOn("col", (c) => c.toggleHeaderColumn()) },
            { icon: Columns3Icon, label: "Delete column", destructive: true, run: () => runOn("col", (c) => c.deleteColumn()) },
          ]}
        />
      )}

      {rowGripVisible && (
        <AxisMenu
          axis="row"
          open={openMenu === "row"}
          onOpenChange={(open) => setOpenMenu(open ? "row" : null)}
          onHoverChange={(h) => setHighlight(h ? "row" : null)}
          style={{
            left: tableRect.left - GRIP_GAP - GRIP_THICKNESS / 2 - GRIP_HIT / 2,
            top: rowRect.top + rowRect.height / 2 - GRIP_LENGTH / 2,
            width: GRIP_HIT,
            height: GRIP_LENGTH,
          }}
          items={[
            { icon: ArrowUpToLineIcon, label: "Insert row above", run: () => runOn("row", (c) => c.addRowBefore()) },
            { icon: ArrowDownToLineIcon, label: "Insert row below", run: () => runOn("row", (c) => c.addRowAfter()) },
            { icon: PanelTopIcon, label: "Toggle header row", run: () => runOn("row", (c) => c.toggleHeaderRow()) },
            { icon: Rows3Icon, label: "Delete row", destructive: true, run: () => runOn("row", (c) => c.deleteRow()) },
          ]}
        />
      )}

      {inside(clip, tableRect.right + 1, tableRect.top + tableRect.height / 2) && (
        <AppendStrip
          label="Add column"
          orientation="vertical"
          onClick={appendColumn}
          style={{ left: tableRect.right + 2, top: tableRect.top, width: STRIP_THICKNESS, height: tableRect.height }}
        />
      )}
      {inside(clip, tableRect.left + tableRect.width / 2, tableRect.bottom + 1) && (
        <AppendStrip
          label="Add row"
          orientation="horizontal"
          onClick={appendRow}
          style={{ left: tableRect.left, top: tableRect.bottom + 2, width: tableRect.width, height: STRIP_THICKNESS }}
        />
      )}
    </div>
  )
}

interface MenuItemSpec {
  icon: LucideIcon
  label: string
  destructive?: boolean
  run: () => void
}

function AxisMenu({
  axis,
  open,
  onOpenChange,
  onHoverChange,
  style,
  items,
}: {
  axis: Axis
  open: boolean
  onOpenChange: (open: boolean) => void
  onHoverChange: (hovering: boolean) => void
  style: React.CSSProperties
  items: MenuItemSpec[]
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={axis === "col" ? "Column options" : "Row options"}
            className="group/grip pointer-events-auto fixed flex items-center justify-center"
            style={style}
            onMouseEnter={() => onHoverChange(true)}
            onMouseLeave={() => onHoverChange(false)}
            // Keep the editor selection; the menu action sets its own.
            onMouseDown={(e) => e.preventDefault()}
          >
            <span
              className={cn(
                "block rounded-full bg-muted-foreground/45 transition-colors group-hover/grip:bg-primary",
                open && "bg-primary",
              )}
              style={
                axis === "col"
                  ? { width: GRIP_LENGTH, height: GRIP_THICKNESS }
                  : { width: GRIP_THICKNESS, height: GRIP_LENGTH }
              }
            />
          </button>
        }
      />
      <DropdownMenuContent
        side={axis === "col" ? "bottom" : "right"}
        align="start"
        sideOffset={6}
        className="w-auto min-w-44"
      >
        {items.map((item, i) => (
          <div key={item.label}>
            {item.destructive && i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem variant={item.destructive ? "destructive" : "default"} onClick={item.run}>
              <item.icon className="size-3.5" />
              {item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AppendStrip({
  label,
  orientation,
  onClick,
  style,
}: {
  label: string
  orientation: "vertical" | "horizontal"
  onClick: () => void
  style: React.CSSProperties
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="group/strip pointer-events-auto fixed flex items-center justify-center rounded-sm transition-colors hover:bg-primary/10"
      style={style}
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
    >
      {/* Resting state: a faint dashed line along the edge so the strip is
          discoverable; hover fills it and brightens the plus. */}
      <span
        className={cn(
          "absolute border-muted-foreground/30 transition-colors group-hover/strip:border-primary/50",
          orientation === "vertical"
            ? "inset-y-1 left-1/2 border-l border-dashed"
            : "inset-x-1 top-1/2 border-t border-dashed",
        )}
      />
      <span className="relative flex size-3.5 items-center justify-center rounded-full bg-background ring-1 ring-muted-foreground/30 transition-colors group-hover/strip:ring-primary">
        <PlusIcon className="size-2.5 text-muted-foreground transition-colors group-hover/strip:text-primary" />
      </span>
    </button>
  )
}

interface Geometry {
  tableRect: DOMRect
  colRect: DOMRect
  rowRect: DOMRect
  clip: DOMRect
}

function measure(editor: Editor, target: HoverTarget): Geometry | null {
  const { table, row, col } = target
  const firstRowCell = table.rows[0]?.cells[Math.min(col, table.rows[0].cells.length - 1)]
  const rowEl = table.rows[row]
  if (!firstRowCell || !rowEl) return null

  const tableRect = table.getBoundingClientRect()
  const colRect = firstRowCell.getBoundingClientRect()
  const rowRect = rowEl.getBoundingClientRect()

  // Handles hang outside the table, so clip to the nearest scroll ancestors:
  // the tableWrapper (horizontal scroll for wide tables) and the editor's
  // own scroll container. Grips for cells scrolled out of view are dropped.
  const wrapper = table.closest(".tableWrapper") ?? table
  const scroller = scrollParent(editor.view.dom)
  const clip = intersect(
    grow(wrapper.getBoundingClientRect(), HANDLE_REACH),
    scroller ? scroller.getBoundingClientRect() : viewportRect(),
  )
  return { tableRect, colRect, rowRect, clip }
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === "auto" || overflowY === "scroll") return node
  }
  return null
}

function viewportRect(): DOMRect {
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight)
}

function cellFor(target: HoverTarget, axis: Axis): HTMLTableCellElement | null {
  const { table, row, col } = target
  if (axis === "row") return table.rows[row]?.cells[0] ?? null
  return table.rows[0]?.cells[Math.min(col, table.rows[0].cells.length - 1)] ?? null
}

function grow(r: DOMRect, by: number): DOMRect {
  return new DOMRect(r.left - by, r.top - by, r.width + by * 2, r.height + by * 2)
}

function intersect(a: DOMRect, b: DOMRect): DOMRect {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  const right = Math.min(a.right, b.right)
  const bottom = Math.min(a.bottom, b.bottom)
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top))
}

function inside(r: DOMRect, x: number, y: number): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}
