import { useMemo } from "react"
import { Loader2Icon } from "lucide-react"
import { useTimelineEventsByDay } from "@/graphql/hooks/timeline"
import type {
  TimelineEventFieldsFragment,
  TimelineGranularity,
} from "@/graphql/gql/graphql"
import { dayjs } from "./dayjs-setup"
import { subjectKindIcon, subjectKindAccent } from "./event-icons"
import { renderEventSummary, renderGroupSummary } from "./event-summary"
import { granularityNoun } from "./granularity"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// Maximum *group* dots rendered in the vertical stack before we collapse the
// rest into a "+N more" affordance. Groups collapse same-topic events into a
// single badge'd icon, so this cap is now per topic, not per event — far
// less likely to overflow in practice.
const MAX_VISIBLE_DOTS = 16

interface Props {
  operationId: string
  bucketStart: string
  count: number
  widthPx: number
  granularity: TimelineGranularity
  timezone: string
  types: string[] | null
  actorIds: string[] | null
  isSelected: boolean
  onEventClick: (event: TimelineEventFieldsFragment) => void
  // Fired when the user clicks the axis dot or the "+N more" affordance.
  // The page treats this as "select this bucket" — the detail panel below
  // the canvas then renders every event in the bucket.
  onSelectBucket: (bucketStart: string) => void
}

// ActiveDaySegment renders one active bucket on the axis: a capped vertical
// stack of event dots above the horizontal line, a "+N more" overflow chip
// when the bucket exceeds the cap, the dot on the line itself, and the date
// label below. Events are fetched lazily — the bucket's events only load
// when this segment mounts, so a long sparse timeline doesn't fan out
// hundreds of queries on first paint.
//
// The segment is itself a flex column so the dot stack grows into all the
// available vertical space (anchored bottom-up via flex-col-reverse) and
// the axis line + label always sit at the very bottom of the canvas.
export function ActiveDaySegment({
  operationId,
  bucketStart,
  count,
  widthPx,
  granularity,
  timezone,
  types,
  actorIds,
  isSelected,
  onEventClick,
  onSelectBucket,
}: Props) {
  const { data, isLoading } = useTimelineEventsByDay(
    operationId,
    bucketStart,
    timezone,
    granularity,
    types,
    actorIds,
  )

  const events = data?.timelineEventsByDay.edges.map((e) => e.node) ?? []

  // Group fetched events by topic — a day with 956 wiki creates and 3
  // credentials becomes two stacked badges, not 959 dots fighting for the
  // viewport. Sort by count desc, topic asc so dense groups dock near the
  // axis (the eye-end of a flex-col-reverse stack) and ordering stays
  // stable across renders.
  const groups = useMemo(() => {
    const map = new Map<string, TimelineEventFieldsFragment[]>()
    for (const ev of events) {
      const list = map.get(ev.topic)
      if (list) list.push(ev)
      else map.set(ev.topic, [ev])
    }
    return Array.from(map.entries())
      .map(([topic, evs]) => ({ topic, events: evs }))
      .sort(
        (a, b) =>
          b.events.length - a.events.length || a.topic.localeCompare(b.topic),
      )
  }, [events])

  // When every fetched event shares a single topic, the bucket count is
  // unambiguously this group's true total — even if the page truncated to
  // 100. Promote the badge so the user sees "956" instead of a misleading
  // "100" with a separate "+856 more" sitting next to it.
  const singleGroupPromotion = groups.length === 1 && count > events.length
  const visibleGroups = groups.slice(0, MAX_VISIBLE_DOTS)

  // Hidden = events the day stack can't show: groups beyond the cap plus
  // any unfetched bucket overflow. Skipped under single-group promotion
  // because the badge already absorbs the unfetched tail.
  const overflowGroups = groups.slice(MAX_VISIBLE_DOTS)
  const overflowGroupEvents = overflowGroups.reduce(
    (sum, g) => sum + g.events.length,
    0,
  )
  const unfetchedCount = Math.max(0, count - events.length)
  const hiddenCount = singleGroupPromotion
    ? 0
    : overflowGroupEvents + unfetchedCount
  const totalKnown = Math.max(events.length, count)

  const label = formatBucketLabel(bucketStart, granularity, timezone)
  // Visual density: vary the axis dot size by bucket count so dense days
  // read as "heavier" without needing a numeric badge.
  const density = densityClass(count)

  return (
    <div
      className="relative shrink-0 flex flex-col"
      style={{ width: `${widthPx}px` }}
    >
      {/* Stack fills the entire available height. flex-col-reverse pins the
          content to the bottom so the newest event sits right above the
          axis line, with older events climbing into the empty space above.
          min-h-0 lets the column shrink inside the parent flex layout. */}
      <div className="flex-1 min-h-0 flex flex-col-reverse items-center gap-1.5 pb-2 overflow-hidden">
        {isLoading && (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        )}
        {visibleGroups.map((g) => {
          const displayCount =
            singleGroupPromotion && g === visibleGroups[0]
              ? totalKnown
              : g.events.length
          return (
            <EventGroupDot
              key={g.topic}
              topic={g.topic}
              events={g.events}
              displayCount={displayCount}
              onEventClick={onEventClick}
              onGroupClick={() => onSelectBucket(bucketStart)}
            />
          )
        })}
        {/* "+N more" sits at the top of the stack (above the older end)
            because the user reads the stack downward into the axis line.
            Renders last in DOM → flex-col-reverse hoists it to the top.
            Also doubles as the "click to see all" affordance when no dots
            have been loaded yet (hidden = count, visible = 0). */}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => onSelectBucket(bucketStart)}
            className="text-xs leading-none px-2 py-1 rounded-full border border-border bg-muted/60 text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted transition-colors tabular-nums"
            aria-label={`Show all ${totalKnown} events in this ${granularityNoun(granularity)}`}
          >
            +{hiddenCount} more
          </button>
        )}
      </div>

      {/* Horizontal axis line sits at the bottom of the segment. The dot is
          centered on the line; clicking it selects the bucket so the detail
          panel below the canvas renders every event in that range. */}
      <div className="relative h-4 border-t border-border">
        <button
          type="button"
          onClick={() => onSelectBucket(bucketStart)}
          className={cn(
            "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background transition-[transform,box-shadow] hover:scale-125",
            density,
            // A selected bucket gets a thick accent ring so the user can see
            // at a glance which day populates the panel below. We swap the
            // ring colour instead of the dot colour so the density encoding
            // (size) remains readable.
            isSelected && "ring-primary scale-125",
          )}
          aria-label={`Show ${count} events on ${label}`}
          aria-pressed={isSelected}
          title={`${count} event${count === 1 ? "" : "s"}`}
        />
      </div>

      <div
        className={cn(
          "pt-1.5 text-center text-xs tabular-nums",
          isSelected
            ? "text-foreground font-medium"
            : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      {/* Invisible subtitle row reserves the same footer height as the Start
          and Today bookend markers — without this, those markers' axis lines
          float higher than the active segments' and the horizontal axis
          reads as broken across the canvas. */}
      <div
        aria-hidden
        className="pt-1 text-center text-[10px] uppercase tracking-wide invisible"
      >
        ·
      </div>
    </div>
  )
}

// EventGroupDot renders a stack of same-topic events as a single iconed
// button. Singletons keep the familiar "click → details dialog" UX; groups
// of 2+ get a count badge in the corner and route the click to the day
// dialog so the user can scan every event behind the badge.
function EventGroupDot({
  topic,
  events,
  displayCount,
  onEventClick,
  onGroupClick,
}: {
  topic: string
  events: TimelineEventFieldsFragment[]
  // displayCount may exceed events.length when the bucket has unfetched
  // events and we know they all belong to this group (see
  // singleGroupPromotion in the parent).
  displayCount: number
  onEventClick: (event: TimelineEventFieldsFragment) => void
  onGroupClick: () => void
}) {
  const first = events[0]
  const Icon = subjectKindIcon(first.subjectKind)
  const accent = subjectKindAccent(first.subjectKind)
  const isSingle = displayCount === 1
  const handleClick = isSingle ? () => onEventClick(first) : onGroupClick
  const tooltip = isSingle
    ? renderEventSummary(first)
    : renderGroupSummary(topic, displayCount)

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={handleClick}
            className={cn(
              "relative flex size-8 items-center justify-center rounded-full border bg-card",
              "hover:scale-110 hover:border-foreground/40 transition-transform",
            )}
            aria-label={tooltip}
          >
            <Icon className={cn("size-4", accent)} />
            {!isSingle && (
              <span
                className={cn(
                  "absolute -top-2 -right-2.5 min-w-[22px] h-[18px]",
                  "flex items-center justify-center px-1.5 rounded-full",
                  "border border-border bg-card text-[11px] leading-none",
                  "text-muted-foreground tabular-nums",
                )}
              >
                {formatBadgeCount(displayCount)}
              </span>
            )}
          </button>
        }
      />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

// formatBadgeCount keeps the corner badge to a tight 1-4 character width so
// it doesn't stretch the dot. Big buckets degrade to "1.2k" / "12k" rather
// than spraying digits across the axis.
function formatBadgeCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10000) {
    const v = (n / 1000).toFixed(1)
    return v.endsWith(".0") ? `${v.slice(0, -2)}k` : `${v}k`
  }
  return `${Math.floor(n / 1000)}k`
}

// densityClass maps bucket count to the axis-dot Tailwind size class. Three
// steps are enough to read "low / medium / high" at a glance without making
// the smallest dot disappear next to the gap markers.
function densityClass(count: number): string {
  if (count >= 25) return "size-5"
  if (count >= 5) return "size-4"
  return "size-3"
}

function formatBucketLabel(
  bucketStart: string,
  granularity: TimelineGranularity,
  timezone: string,
): string {
  const d = dayjs(bucketStart).tz(timezone)
  switch (granularity) {
    case "WEEK":
      return d.format("MMM D")
    case "MONTH":
      return d.format("MMM YYYY")
    default:
      return d.format("MMM D")
  }
}
