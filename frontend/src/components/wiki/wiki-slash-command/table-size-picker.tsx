import { forwardRef, useImperativeHandle, useState } from "react"
import { cn } from "@/lib/utils"
import { DEFAULT_TABLE_SIZE, type TableSize } from "./items"

export const TABLE_PICKER_MAX_ROWS = 8
export const TABLE_PICKER_MAX_COLS = 10

export interface TableSizePickerHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

interface TableSizePickerProps {
  onPick: (size: TableSize) => void
}

/**
 * Hover grid for choosing a table's initial size, rendered inside the slash
 * menu after the user picks "Table". Mouse: hover to preview, click to
 * insert. Keyboard: arrows grow/shrink the selection, Enter inserts. The
 * counter includes the header row, matching what insertTable produces.
 */
export const TableSizePicker = forwardRef<TableSizePickerHandle, TableSizePickerProps>(
  function TableSizePicker({ onPick }, ref) {
    const [size, setSize] = useState<TableSize>(DEFAULT_TABLE_SIZE)

    useImperativeHandle(ref, () => ({
      onKeyDown(event) {
        const step = ARROW_STEPS[event.key]
        if (step) {
          setSize((s) => ({
            rows: clamp(s.rows + step.rows, 1, TABLE_PICKER_MAX_ROWS),
            cols: clamp(s.cols + step.cols, 1, TABLE_PICKER_MAX_COLS),
          }))
          return true
        }
        if (event.key === "Enter") {
          onPick(size)
          return true
        }
        return false
      },
    }))

    const cells = []
    for (let r = 1; r <= TABLE_PICKER_MAX_ROWS; r++) {
      for (let c = 1; c <= TABLE_PICKER_MAX_COLS; c++) {
        const active = r <= size.rows && c <= size.cols
        cells.push(
          <button
            key={`${r}-${c}`}
            type="button"
            tabIndex={-1}
            aria-label={`${c} × ${r}`}
            className={cn(
              "size-4 rounded-[3px] border transition-colors",
              active ? "border-primary/60 bg-primary/30" : "border-border bg-muted/40",
            )}
            onMouseEnter={() => setSize({ rows: r, cols: c })}
            onMouseDown={(e) => {
              e.preventDefault()
              onPick({ rows: r, cols: c })
            }}
          />,
        )
      }
    }

    return (
      <div className="z-50 rounded-lg bg-popover p-2 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
        <div
          role="grid"
          aria-label="Table size"
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${TABLE_PICKER_MAX_COLS}, minmax(0, 1fr))` }}
        >
          {cells}
        </div>
        <div className="mt-1.5 flex items-baseline justify-between px-0.5 text-xs text-muted-foreground">
          <span>
            {size.cols} × {size.rows}
          </span>
          <span>columns × rows</span>
        </div>
      </div>
    )
  },
)

const ARROW_STEPS: Record<string, TableSize> = {
  ArrowRight: { rows: 0, cols: 1 },
  ArrowLeft: { rows: 0, cols: -1 },
  ArrowDown: { rows: 1, cols: 0 },
  ArrowUp: { rows: -1, cols: 0 },
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}
