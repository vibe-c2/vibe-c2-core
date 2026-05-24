import type { TimelineGranularity } from "@/graphql/gql/graphql"
import { dayjs } from "./dayjs-setup"
import { subjectKindIcon, subjectKindAccent } from "./event-icons"
import { renderGroupSummary } from "./event-summary"
import { granularityNoun } from "./granularity"
import type { BucketTopicCount } from "./piecewise-axis"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// Maximum *group* dots rendered in the vertical stack before we collapse the
// rest into a "+N more" affordance. Groups collapse same-topic events into a
// single badge'd icon, so this cap is per topic, not per event.
const MAX_VISIBLE_DOTS = 16

interface Props {
  bucketStart: string
  count: number
  // Per-topic breakdown for the bucket. Comes from the timelineBuckets
  // aggregation, which means we no longer need to fan out an N-bucket
  // timelineEventsByDay query just to render the dot stack. Server-side
  // sort guarantees count desc, topic asc.
  topicCounts: BucketTopicCount[]
  widthPx: number
  granularity: TimelineGranularity
  timezone: string
  isSelected: boolean
  // Fired when the user clicks anywhere on the segment (axis dot, group
  // icon, "+N more"). The page treats this as "select this bucket" — the
  // detail panel below the canvas then renders every event in the bucket.
  onSelectBucket: (bucketStart: string) => void
}

// ActiveDaySegment renders one active bucket on the axis: a capped vertical
// stack of topic-group dots above the horizontal line, a "+N more" overflow
// chip when the bucket exceeds the cap, the dot on the line itself, and the
// date label below.
//
// All data comes from the parent's bucket query — no per-segment GraphQL
// fetch. A timeline with N active buckets renders in 1 query, not N+1.
export function ActiveDaySegment({
  bucketStart,
  count,
  topicCounts,
  widthPx,
  granularity,
  timezone,
  isSelected,
  onSelectBucket,
}: Props) {
  const visibleGroups = topicCounts.slice(0, MAX_VISIBLE_DOTS)
  const overflowGroups = topicCounts.slice(MAX_VISIBLE_DOTS)
  const hiddenCount = overflowGroups.reduce((sum, g) => sum + g.count, 0)

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
        {visibleGroups.map((g) => (
          <EventGroupDot
            key={`${g.topic}:${g.subjectKind}`}
            topic={g.topic}
            subjectKind={g.subjectKind}
            count={g.count}
            onClick={() => onSelectBucket(bucketStart)}
          />
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => onSelectBucket(bucketStart)}
            className="text-xs leading-none px-2 py-1 rounded-full border border-border bg-muted/60 text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted transition-colors tabular-nums"
            aria-label={`Show all ${count} events in this ${granularityNoun(granularity)}`}
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

// EventGroupDot renders a single topic group as a count-badged icon button.
// All clicks route to onSelectBucket so the day panel becomes the single
// surface for "see the actual events" — the canvas is navigation only.
function EventGroupDot({
  topic,
  subjectKind,
  count,
  onClick,
}: {
  topic: string
  subjectKind: string
  count: number
  onClick: () => void
}) {
  const Icon = subjectKindIcon(subjectKind)
  const accent = subjectKindAccent(subjectKind)
  const tooltip = renderGroupSummary(topic, count)
  const showBadge = count > 1

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            className={cn(
              "relative flex size-8 items-center justify-center rounded-full border bg-card",
              "hover:scale-110 hover:border-foreground/40 transition-transform",
            )}
            aria-label={tooltip}
          >
            <Icon className={cn("size-4", accent)} />
            {showBadge && (
              <span
                className={cn(
                  "absolute -top-2 -right-2.5 min-w-[22px] h-[18px]",
                  "flex items-center justify-center px-1.5 rounded-full",
                  "border border-border bg-card text-[11px] leading-none",
                  "text-muted-foreground tabular-nums",
                )}
              >
                {formatBadgeCount(count)}
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
