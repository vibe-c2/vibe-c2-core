import { useEffect, useMemo, useRef } from "react"
import { dayjs } from "./dayjs-setup"
import { useTimelineBuckets, useTimelineLiveUpdates } from "@/graphql/hooks/timeline"
import type {
  TimelineEventFieldsFragment,
  TimelineGranularity,
} from "@/graphql/gql/graphql"
import {
  advanceGranularity,
  buildSegments,
  truncateToGranularity,
} from "./piecewise-axis"
import { ActiveDaySegment } from "./active-day-segment"
import { CompressedGap } from "./compressed-gap"
import { OperationCreatedMarker } from "./operation-created-marker"
import { TodayMarker } from "./today-marker"

interface Props {
  operationId: string
  operationCreatedAt: string
  granularity: TimelineGranularity
  timezone: string
  types?: string[] | null
  actorIds?: string[] | null
  from?: string | null
  to?: string | null
  selectedBucketStart: string | null
  onSelectBucket: (bucketStart: string) => void
  onEventClick: (event: TimelineEventFieldsFragment) => void
}

// Fixed pixel height for the canvas. Picked so the dot stack (capped at 16
// groups @ ~36px each) fits comfortably with the axis line + label without
// dominating the page — the actual event list lives in the detail panel
// below, so the canvas is a navigation overview, not the full surface.
const CANVAS_HEIGHT_PX = 380

// TimelineCanvas renders the page's horizontal axis. Owns the bucket count
// query and the live-update subscription; per-event detail and per-day
// expansion are now lifted to the parent page so the canvas can stay a thin
// navigation surface above the detail panel.
export function TimelineCanvas({
  operationId,
  operationCreatedAt,
  granularity,
  timezone,
  types,
  actorIds,
  from,
  to,
  selectedBucketStart,
  onSelectBucket,
  onEventClick,
}: Props) {
  // Live updates — bumps the buckets + events queries via cache invalidation.
  useTimelineLiveUpdates(operationId)

  const { data, isLoading, error } = useTimelineBuckets({
    operationId,
    granularity,
    timezone,
    types: types ?? null,
    actorIds: actorIds ?? null,
    from: from ?? null,
    to: to ?? null,
  })

  const segments = useMemo(() => {
    if (!data) return []
    // When the user picks an explicit From/To range we clip the rendered
    // axis to that window. Otherwise the natural bounds are operation
    // creation through today — guarantees the canvas always covers the
    // operation's full lifetime.
    const baseLo = from ? dayjs(from) : dayjs(operationCreatedAt)
    const hi = to ? dayjs(to) : dayjs()
    // OperationCreatedMarker visually occupies the slot of the creation
    // bucket, so advance the lower bound past that bucket. Without this
    // the gap counter would label the same day twice — once as the START
    // bookend, once as a "1 day" gap immediately after — which read as
    // an empty day between START and the next active bucket. Mirrors how
    // TodayMarker takes the trailing slot so the closing gap excludes
    // today.
    const lo = from
      ? baseLo
      : advanceGranularity(
          truncateToGranularity(baseLo.tz(timezone), granularity),
          granularity,
        )
    return buildSegments(
      data.timelineBuckets.map((b) => ({
        bucketStart: b.bucketStart,
        count: b.count,
      })),
      lo,
      hi,
      granularity,
      timezone,
    )
  }, [data, operationCreatedAt, granularity, timezone, from, to])

  // Auto-scroll the selected segment into view. Without this, picking a
  // bucket out of camera (e.g. via deep link) would leave the user staring
  // at an off-screen highlight while the detail panel changes silently.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!selectedBucketStart) return
    const root = scrollRef.current
    if (!root) return
    const el = root.querySelector<HTMLElement>(
      `[data-bucket-start="${cssEscape(selectedBucketStart)}"]`,
    )
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })
  }, [selectedBucketStart, segments])

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        Failed to load timeline. {(error as Error).message}
      </div>
    )
  }

  // Only render the "From" bookend when we're viewing the full operation —
  // a clipped From/To window has its own implicit boundaries via the gap
  // segments at either end.
  const showOperationMarker = !from

  return (
    <div
      className="flex shrink-0 flex-col rounded-md border bg-card"
      style={{ height: `${CANVAS_HEIGHT_PX}px` }}
    >
      {/* Horizontal scroll container fills the card vertically; each
          segment then sizes its dot stack to fill all the available
          height so the axis line lands at the bottom of the canvas. */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden"
      >
        <div className="flex h-full items-stretch px-3 py-4 min-w-fit">
          {showOperationMarker && (
            <OperationCreatedMarker
              createdAt={operationCreatedAt}
              timezone={timezone}
            />
          )}

          {segments.map((seg, i) => {
            if (seg.kind === "gap") {
              return (
                <CompressedGap
                  key={`gap-${i}-${seg.fromBucketStart}`}
                  spanBuckets={seg.spanBuckets}
                  widthPx={seg.widthPx}
                  granularity={granularity}
                />
              )
            }
            return (
              <div
                key={`active-${seg.bucketStart}`}
                data-bucket-start={seg.bucketStart}
                className="flex"
              >
                <ActiveDaySegment
                  operationId={operationId}
                  bucketStart={seg.bucketStart}
                  count={seg.count}
                  widthPx={seg.widthPx}
                  granularity={granularity}
                  timezone={timezone}
                  types={types ?? null}
                  actorIds={actorIds ?? null}
                  isSelected={seg.bucketStart === selectedBucketStart}
                  onEventClick={onEventClick}
                  onSelectBucket={onSelectBucket}
                />
              </div>
            )
          })}

          <TodayMarker
            operationCreatedAt={operationCreatedAt}
            timezone={timezone}
          />
        </div>
      </div>

      {!isLoading && segments.length === 0 && (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
          No events yet. Activity will appear here as you work.
        </div>
      )}
    </div>
  )
}

// CSS.escape isn't available in all runtimes (notably older test envs and
// some SSR paths), so fall back to a tiny escaper for the values we
// actually feed it — ISO timestamps with offsets contain `:` and `+` which
// querySelector would otherwise interpret as pseudo-classes / next sibling.
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`)
}
