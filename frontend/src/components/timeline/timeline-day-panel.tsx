import { useEffect, useRef } from "react"
import { useConnectionNodes } from "@/hooks/use-connection-nodes"
import { CalendarOffIcon, Loader2Icon, XIcon } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useTimelineEventsByDay } from "@/graphql/hooks/timeline"
import type {
  TimelineEventFieldsFragment,
  TimelineGranularity,
} from "@/graphql/gql/graphql"
import { formatRangeLabel } from "./bucket-label"
import { EventRow } from "./event-row"
import { granularityNoun } from "./granularity"

interface Props {
  operationId: string
  bucketStart: string | null
  granularity: TimelineGranularity
  timezone: string
  types: string[] | null
  actorIds: string[] | null
  onEventSelect: (event: TimelineEventFieldsFragment) => void
  onClearSelection: () => void
  // canClear hides the Clear button when clearing would be a no-op —
  // i.e. the parent's auto-select-latest effect would immediately
  // re-select the same bucket, making the button feel broken.
  canClear: boolean
}

// TimelineDayPanel fills the page below the (now fixed-height) canvas with the
// events for the bucket selected on the axis. This is the single surface that
// loads events — the canvas no longer fans out one query per active bucket,
// rendering its dot stack from the topicCounts on timelineBuckets instead.
export function TimelineDayPanel({
  operationId,
  bucketStart,
  granularity,
  timezone,
  types,
  actorIds,
  onEventSelect,
  onClearSelection,
  canClear,
}: Props) {
  if (!bucketStart) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-card/40 p-6 text-center text-sm text-muted-foreground">
        <CalendarOffIcon className="size-5 opacity-60" />
        <div>
          Click any {granularityNoun(granularity)} on the timeline above to see
          its events here.
        </div>
      </div>
    )
  }

  return (
    <DayPanelLoaded
      operationId={operationId}
      bucketStart={bucketStart}
      granularity={granularity}
      timezone={timezone}
      types={types}
      actorIds={actorIds}
      onEventSelect={onEventSelect}
      onClearSelection={onClearSelection}
      canClear={canClear}
    />
  )
}

// Row height estimate used by the virtualizer. The actual row renders icon +
// summary + timestamp at ~52px; the estimate is in the ballpark and
// react-virtual measures real heights via the row's ref.
const ROW_HEIGHT = 52
// How many rows from the bottom of the rendered window trigger the next
// page fetch. Wide enough that the loading indicator rarely scrolls into
// view on fast flicks but tight enough that we don't pre-spend the first
// hundred rows fetching a hundred more.
const PREFETCH_THRESHOLD = 12

// DayPanelLoaded is split out so the hook only mounts when a bucket is
// actually selected — keeps the empty state from holding an enabled-but-stale
// query in cache.
function DayPanelLoaded({
  operationId,
  bucketStart,
  granularity,
  timezone,
  types,
  actorIds,
  onEventSelect,
  onClearSelection,
  canClear,
}: Omit<Props, "bucketStart"> & { bucketStart: string }) {
  const {
    data,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useTimelineEventsByDay(
    operationId,
    bucketStart,
    timezone,
    granularity,
    types,
    actorIds,
  )

  const events = useConnectionNodes(data, (p) => p.timelineEventsByDay)

  const title = formatRangeLabel(bucketStart, granularity, timezone)

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  })

  // Infinite scroll: when the bottom of the rendered window approaches the
  // end of the loaded set, fetch the next page. Skipped while a fetch is in
  // flight to avoid duplicate requests during fast scroll.
  const virtualItems = virtualizer.getVirtualItems()
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return
    const last = virtualItems[virtualItems.length - 1]
    if (!last) return
    if (last.index >= events.length - PREFETCH_THRESHOLD) {
      fetchNextPage()
    }
  }, [virtualItems, events.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  // Reset scroll when the selected bucket or filters change so the new
  // panel always opens at the top instead of inheriting the previous
  // bucket's scroll position.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [bucketStart, granularity, timezone, types, actorIds])

  const countLabel = isLoading
    ? "Loading…"
    : hasNextPage
      ? `${events.length}+ events`
      : `${events.length} event${events.length === 1 ? "" : "s"}`

  return (
    <div className="flex flex-1 min-h-0 flex-col rounded-md border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="truncate text-sm font-medium text-foreground/90">
            {title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {countLabel}
          </span>
        </div>
        {canClear && (
          <button
            type="button"
            onClick={onClearSelection}
            className="flex shrink-0 items-center gap-1 rounded-sm border border-transparent px-1.5 py-0.5 text-xs text-muted-foreground hover:border-border hover:text-foreground transition-colors"
            aria-label="Clear day selection"
          >
            <XIcon className="size-3" />
            Clear
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        {isLoading && events.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2Icon className="size-3 animate-spin" />
            Loading events…
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No events in this {granularityNoun(granularity)}.
          </div>
        )}

        {events.length > 0 && (
          <div
            style={{ height: virtualizer.getTotalSize() }}
            className="relative w-full divide-y"
          >
            {virtualItems.map((item) => {
              const ev = events[item.index]
              if (!ev) return null
              return (
                <div
                  key={ev.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <EventRow
                    event={ev}
                    timezone={timezone}
                    onSelect={() => onEventSelect(ev)}
                  />
                </div>
              )
            })}
            {isFetchingNextPage && (
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 bg-gradient-to-t from-card via-card/95 to-transparent py-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin" />
                Loading more…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

