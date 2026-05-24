import { Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import type { TimelineGranularity } from "@/graphql/gql/graphql"
import {
  TypesFilter,
  ActorsFilter,
  DateRangeFilter,
  ResetFiltersButton,
  type ActorChip,
} from "./timeline-filters"

interface Props {
  // Operation context — rendered on the left of the toolbar in place of
  // the old "Granularity" label so the canvas can drop its own header.
  operationName: string
  isLoading: boolean

  granularity: TimelineGranularity
  onGranularityChange: (next: TimelineGranularity) => void

  // Active filter state. Empty arrays / nulls represent "no filter".
  types: string[]
  onTypesChange: (next: string[]) => void

  actors: ActorChip[]
  onActorsChange: (next: ActorChip[]) => void

  from: string | null
  to: string | null
  onRangeChange: (next: { from: string | null; to: string | null }) => void

  // True when any filter is set; surfaces a Reset affordance.
  hasActiveFilters: boolean
  onReset: () => void
}

const OPTIONS: Array<{ key: TimelineGranularity; label: string }> = [
  { key: "DAY", label: "Day" },
  { key: "WEEK", label: "Week" },
  { key: "MONTH", label: "Month" },
]

// TimelineToolbar owns the granularity tabs and filter popovers. Sticky to
// the top of its scroll container so it stays in reach when the canvas
// scrolls horizontally on dense timelines.
export function TimelineToolbar({
  operationName,
  isLoading,
  granularity,
  onGranularityChange,
  types,
  onTypesChange,
  actors,
  onActorsChange,
  from,
  to,
  onRangeChange,
  hasActiveFilters,
  onReset,
}: Props) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border bg-card/95 px-2 py-1.5 backdrop-blur">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
        <span className="truncate text-foreground/80 font-medium">
          {operationName}
        </span>
        {isLoading && (
          <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        )}
      </span>

      <Separator orientation="vertical" className="!h-6 mx-1" />

      <div className="flex gap-1 rounded-md border bg-card p-0.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onGranularityChange(opt.key)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-sm transition-colors",
              granularity === opt.key
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <Separator orientation="vertical" className="!h-6 mx-1" />

      <TypesFilter value={types} onChange={onTypesChange} />
      <ActorsFilter value={actors} onChange={onActorsChange} />
      <DateRangeFilter from={from} to={to} onChange={onRangeChange} />

      <ResetFiltersButton visible={hasActiveFilters} onClick={onReset} />
    </div>
  )
}
