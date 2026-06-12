import type { ReactNode } from "react"
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react"
import {
  toggleSort,
  type DataTableSort,
  type SortDirection,
} from "@/lib/data-table-sort"
import { cn } from "@/lib/utils"

// Clickable column header for VirtualizedDataTable. Drop it into the table's
// `header` slot in place of a plain <div>Label</div> for each sortable
// column — non-sortable columns keep their plain divs, so sorting stays
// opt-in per column:
//
//   <SortableHeader label="Name" field="NAME" sort={sort} onSortChange={set} />
//
// Typography (text-xs, uppercase, muted) is inherited from the header row;
// the button only adds the interaction affordances. The active column is
// emphasized and shows its direction; inactive sortable columns show a faint
// both-ways chevron so they're discoverable as sortable.
interface SortableHeaderProps<TField extends string> {
  label: ReactNode
  field: TField
  sort: DataTableSort<TField>
  onSortChange: (next: DataTableSort<TField>) => void
  // Direction applied when this column is first activated. Use "DESC" for
  // recency columns ("newest first" is the natural first ask); text columns
  // keep the ASC default.
  initialDirection?: SortDirection
  className?: string
}

export function SortableHeader<TField extends string>({
  label,
  field,
  sort,
  onSortChange,
  initialDirection = "ASC",
  className,
}: SortableHeaderProps<TField>) {
  const isActive = sort.field === field

  return (
    <button
      type="button"
      onClick={() => onSortChange(toggleSort(sort, field, initialDirection))}
      aria-label={`Sort by ${typeof label === "string" ? label : field}`}
      className={cn(
        // -mx-1 lets the click target bleed past the label without shifting
        // the column's text alignment relative to plain headers.
        "-mx-1 flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 transition-colors select-none hover:bg-muted hover:text-foreground",
        isActive && "text-foreground",
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {isActive ? (
        sort.direction === "ASC" ? (
          <ArrowUpIcon className="size-3 shrink-0" />
        ) : (
          <ArrowDownIcon className="size-3 shrink-0" />
        )
      ) : (
        <ChevronsUpDownIcon className="size-3 shrink-0 opacity-40" />
      )}
    </button>
  )
}
