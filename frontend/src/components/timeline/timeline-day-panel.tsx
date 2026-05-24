import { CalendarOffIcon, Loader2Icon, XIcon } from "lucide-react"
import { useTimelineEventsByDay } from "@/graphql/hooks/timeline"
import type {
  TimelineEventFieldsFragment,
  TimelineGranularity,
} from "@/graphql/gql/graphql"
import { dayjs } from "./dayjs-setup"
import { subjectKindIcon, subjectKindAccent } from "./event-icons"
import { renderEventSummary } from "./event-summary"
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
// events for the bucket selected on the axis. Reuses useTimelineEventsByDay so
// React Query dedupes against the per-segment hook in ActiveDaySegment when
// the same bucket is hovered/expanded — opening this panel does not re-fetch.
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
  const { data, isLoading } = useTimelineEventsByDay(
    operationId,
    bucketStart,
    timezone,
    granularity,
    types,
    actorIds,
  )

  const events = data?.timelineEventsByDay.edges.map((e) => e.node) ?? []
  const title = formatRangeLabel(bucketStart, granularity, timezone)

  return (
    <div className="flex flex-1 min-h-0 flex-col rounded-md border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="truncate text-sm font-medium text-foreground/90">
            {title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {isLoading
              ? "Loading…"
              : `${events.length} event${events.length === 1 ? "" : "s"}`}
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

      <div className="flex-1 min-h-0 overflow-y-auto">
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
          <ul className="divide-y">
            {events.map((ev) => (
              <li key={ev.id}>
                <EventRow
                  event={ev}
                  timezone={timezone}
                  onSelect={() => onEventSelect(ev)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function EventRow({
  event,
  timezone,
  onSelect,
}: {
  event: TimelineEventFieldsFragment
  timezone: string
  onSelect: () => void
}) {
  const Icon = subjectKindIcon(event.subjectKind)
  const accent = subjectKindAccent(event.subjectKind)
  const t = dayjs(event.occurredAt).tz(timezone)
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${accent}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{renderEventSummary(event)}</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {t.format("HH:mm")} · {t.fromNow()}
        </div>
      </div>
    </button>
  )
}

function formatRangeLabel(
  bucketStart: string,
  granularity: TimelineGranularity,
  timezone: string,
): string {
  const start = dayjs(bucketStart).tz(timezone)
  switch (granularity) {
    case "WEEK": {
      const end = start.add(6, "day")
      const sameMonth = start.month() === end.month()
      return sameMonth
        ? `${start.format("MMM D")} – ${end.format("D, YYYY")}`
        : `${start.format("MMM D")} – ${end.format("MMM D, YYYY")}`
    }
    case "MONTH":
      return start.format("MMMM YYYY")
    default:
      return start.format("dddd, MMM D, YYYY")
  }
}
