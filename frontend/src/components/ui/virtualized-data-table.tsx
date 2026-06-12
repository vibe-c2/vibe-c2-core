import { useMemo, type ReactNode } from "react"
import { Virtuoso } from "react-virtuoso"
import { LoaderIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// Shared shell for every infinite-scrolling entity table (credentials,
// hashes, hosts, operations, users, sessions). Owns the chrome and the
// pagination mechanics — card border, fixed grid header, loading skeleton,
// empty state, Virtuoso wiring, and the loading/end-of-list footer — so the
// per-entity components only describe their columns and rows.
//
// Rows are rendered by the caller (some are buttons, some plain divs, some
// wrapped in context menus); use `dataTableRowClass(gridCols)` so the row
// grid stays aligned with the header.

interface VirtualizedDataTableProps<T> {
  items: T[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  // Tailwind grid template class, e.g. "grid-cols-[2fr_1fr_140px]". Must be
  // the same value passed to dataTableRowClass by renderRow.
  gridCols: string
  // Header cells, one element per column, in column order.
  header: ReactNode
  renderRow: (item: T, index: number) => ReactNode
  // Rendered inside the standard centered empty container — typically an
  // icon plus a short message.
  emptyState: ReactNode
  // Plural noun for the end-of-list footer: "No more {entityNoun} to load".
  entityNoun: string
}

const SKELETON_ROWS = 5

export function VirtualizedDataTable<T>({
  items,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  gridCols,
  header,
  renderRow,
  emptyState,
  entityNoun,
}: VirtualizedDataTableProps<T>) {
  const showEmpty = !isLoading && items.length === 0
  const showList = !isLoading && items.length > 0

  // Memoized so Virtuoso sees a stable Footer reference — a fresh component
  // identity per render would remount the footer DOM on every state change.
  const itemCount = items.length
  const components = useMemo(
    () => ({
      Footer: () => {
        if (isFetchingNextPage) {
          return (
            <div className="flex items-center justify-center py-4">
              <LoaderIcon className="size-4 animate-spin" />
            </div>
          )
        }
        if (!hasNextPage && itemCount > 0) {
          return (
            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
              No more {entityNoun} to load
            </div>
          )
        }
        return null
      },
    }),
    [isFetchingNextPage, hasNextPage, itemCount, entityNoun],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="shrink-0 border-b bg-muted/50">
        <div
          className={`grid ${gridCols} gap-3 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide`}
        >
          {header}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3 p-4">
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {showEmpty && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          {emptyState}
        </div>
      )}

      {showList && (
        <div className="flex min-h-0 flex-1 flex-col">
          <Virtuoso
            data={items}
            endReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage()
            }}
            overscan={200}
            style={{ height: "100%" }}
            className="min-h-0 flex-1"
            itemContent={(index, item) => renderRow(item, index)}
            components={components}
          />
        </div>
      )}
    </div>
  )
}

// Canonical row classes. `w-full text-left` only matters for button rows but
// is harmless on divs, so every row shares one string and stays aligned with
// the header grid.
export function dataTableRowClass(gridCols: string, className?: string): string {
  return cn(
    `grid ${gridCols} w-full items-center gap-3 border-b px-4 py-2 text-left text-sm transition-colors hover:bg-muted/50`,
    className,
  )
}
