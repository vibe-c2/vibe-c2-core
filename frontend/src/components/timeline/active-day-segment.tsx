import { createElement, useMemo } from "react"
import type { TimelineGranularity } from "@/graphql/gql/graphql"
import { dayjs } from "./dayjs-setup"
import { subjectKindIcon, subjectKindAccent } from "./event-icons"
import { renderSubjectKindSummary } from "./event-summary"
import { granularityNoun } from "./granularity"
import type { BucketTopicCount } from "./piecewise-axis"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// Maximum *group* dots rendered in the vertical stack before we collapse the
// rest into a "+N more" affordance. Groups collapse same-subject-kind events
// into a single badge'd icon, so this cap is per subject kind, not per event.
const MAX_VISIBLE_DOTS = 16

// SubjectGroup is the dot-stack rendering unit: one badge'd icon per subject
// kind, summing every topic that shares that kind. The bucket aggregation
// returns counts split by (topic, subjectKind) — e.g. hash.created and
// hash.cracked are two rows that both carry subjectKind "hash" — so we merge
// them here to render a single hash circle instead of two identical-looking
// purple dots.
interface SubjectGroup {
  subjectKind: string
  count: number
}

// mergeBySubjectKind collapses per-topic counts into per-subject-kind groups,
// preserving the incoming order (server sorts count desc, topic asc) by the
// first topic seen for each kind.
function mergeBySubjectKind(topicCounts: BucketTopicCount[]): SubjectGroup[] {
  const order: string[] = []
  const byKind = new Map<string, number>()
  for (const tc of topicCounts) {
    const prev = byKind.get(tc.subjectKind)
    if (prev === undefined) order.push(tc.subjectKind)
    byKind.set(tc.subjectKind, (prev ?? 0) + tc.count)
  }
  return order.map((subjectKind) => ({
    subjectKind,
    count: byKind.get(subjectKind) ?? 0,
  }))
}

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
  // Fired when the user clicks the anchor on the axis line or the "+N more"
  // overflow chip. Selects the bucket so the detail panel below the canvas
  // renders every event in the bucket.
  onSelectBucket: (bucketStart: string) => void
  // Fired when the user clicks an individual chip. The page opens a modal
  // that lists just the events in that one subject-kind group — tighter than
  // the day panel, which shows the whole bucket.
  onSelectGroup: (bucketStart: string, subjectKind: string) => void
}

// ActiveDaySegment renders one active bucket on the axis: a vertical stack of
// topic-group chips (with a guide line connecting them to the anchor), a "+N
// more" overflow chip when the bucket exceeds the cap, the anchor dot on the
// axis line, and the date label below.
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
  onSelectGroup,
}: Props) {
  const subjectGroups = useMemo(
    () => mergeBySubjectKind(topicCounts),
    [topicCounts],
  )
  const visibleGroups = subjectGroups.slice(0, MAX_VISIBLE_DOTS)
  const overflowGroups = subjectGroups.slice(MAX_VISIBLE_DOTS)
  const hiddenCount = overflowGroups.reduce((sum, g) => sum + g.count, 0)

  const label = formatBucketLabel(bucketStart, granularity, timezone)
  const hasStackContent = visibleGroups.length > 0 || hiddenCount > 0

  return (
    <div
      className="relative shrink-0 flex flex-col"
      style={{ width: `${widthPx}px` }}
    >
      {/* Outer column takes the remaining vertical space and pins the stack
          to the bottom; the inner column shrinks to fit just the chips so
          the guide line can span exactly from the topmost chip down to the
          anchor, no further. min-h-0 lets the column shrink inside the
          parent flex layout. */}
      <div className="flex-1 min-h-0 flex flex-col-reverse items-center overflow-hidden">
        <div className="relative flex flex-col-reverse items-center gap-1.5 pb-2">
          {hasStackContent && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-3 bottom-0 -translate-x-1/2 w-px bg-border"
            />
          )}
          {visibleGroups.map((g) => (
            <EventGroupChip
              key={g.subjectKind}
              subjectKind={g.subjectKind}
              count={g.count}
              onClick={() => onSelectGroup(bucketStart, g.subjectKind)}
            />
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => onSelectBucket(bucketStart)}
              className="relative z-10 text-xs leading-none px-2 py-1 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted transition-colors tabular-nums"
              aria-label={`Show all ${count} events in this ${granularityNoun(granularity)}`}
            >
              +{hiddenCount} more
            </button>
          )}
        </div>
      </div>

      {/* Horizontal axis line sits at the bottom of the segment. The anchor
          is centered on the line; clicking it selects the bucket so the
          detail panel below the canvas renders every event in that range.
          Anchor size is fixed — density is communicated by the chip stack
          above, not by the anchor itself. */}
      <div className="relative h-4 border-t border-border">
        <button
          type="button"
          onClick={() => onSelectBucket(bucketStart)}
          className={cn(
            "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 size-2.5 rounded-full bg-muted-foreground/50 ring-2 ring-background transition-colors hover:bg-foreground",
            isSelected && "bg-foreground ring-primary/40",
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

// EventGroupChip renders a single subject-kind group as a count-badged icon
// button. Clicks fire onSelectGroup so the page can open the group-scoped
// modal that lists just the events of this subject kind in the bucket.
function EventGroupChip({
  subjectKind,
  count,
  onClick,
}: {
  subjectKind: string
  count: number
  onClick: () => void
}) {
  const icon = subjectKindIcon(subjectKind)
  const accent = subjectKindAccent(subjectKind)
  const tooltip = renderSubjectKindSummary(subjectKind, count)
  const showBadge = count > 1

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            className={cn(
              "relative z-10 flex size-8 items-center justify-center rounded-full border bg-card",
              "hover:scale-110 hover:border-foreground/40 transition-transform",
            )}
            aria-label={tooltip}
          >
            {createElement(icon, { className: cn("size-4", accent) })}
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
