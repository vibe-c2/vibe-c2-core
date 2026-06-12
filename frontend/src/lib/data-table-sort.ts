// Generic column-sort state for the entity data tables.
//
// A table that supports sorting holds one DataTableSort describing the active
// column and direction, and renders its sortable header cells with
// <SortableHeader> (components/ui/sortable-header.tsx). Tables and columns
// that don't sort simply never adopt these — sorting is opt-in per column.
//
// The direction values intentionally match the GraphQL SortDirection enum
// ("ASC" | "DESC") so a DataTableSort can be passed straight into query
// variables without mapping.

export type SortDirection = "ASC" | "DESC"

export interface DataTableSort<TField extends string = string> {
  field: TField
  direction: SortDirection
}

// Click behavior for a sortable column header:
//   - clicking an inactive column activates it in its preferred initial
//     direction (ASC for text columns; pass "DESC" for recency columns where
//     "newest first" is the natural first ask),
//   - clicking the active column flips the direction.
//
// There is no "unsorted" third state — every table has a defined default
// sort, so a column is always active.
export function toggleSort<TField extends string>(
  current: DataTableSort<TField>,
  field: TField,
  initialDirection: SortDirection = "ASC",
): DataTableSort<TField> {
  if (current.field !== field) {
    return { field, direction: initialDirection }
  }
  return { field, direction: current.direction === "ASC" ? "DESC" : "ASC" }
}
