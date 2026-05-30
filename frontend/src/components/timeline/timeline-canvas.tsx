import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { ChevronLeftIcon, Loader2Icon } from "lucide-react"
import { dayjs } from "./dayjs-setup"
import { useTimelineLiveUpdates } from "@/graphql/hooks/timeline"
import type { TimelineGranularity } from "@/graphql/gql/graphql"
import type { TimelineBucketFragment } from "@/graphql/hooks/timeline"
import { buildSegments } from "./piecewise-axis"
import { ActiveDaySegment } from "./active-day-segment"
import { CompressedGap } from "./compressed-gap"
import { OperationCreatedMarker } from "./operation-created-marker"
import { TodayMarker } from "./today-marker"
import { cn } from "@/lib/utils"

interface Props {
  operationId: string
  operationCreatedAt: string
  granularity: TimelineGranularity
  timezone: string
  // User-applied filter range from the URL. When set, suppresses the
  // operation-start / today markers — the axis is clipped to the filter.
  from?: string | null
  to?: string | null
  buckets: TimelineBucketFragment[]
  // ISO of the earliest loaded window's left edge, used to gate the
  // operation-start marker (only render once we've loaded back that far).
  earliestLoaded: string | null
  isLoadingInitial: boolean
  isLoadingOlder: boolean
  hasMoreOlder: boolean
  onLoadOlder: () => void
  selectedBucketStart: string | null
  onSelectBucket: (bucketStart: string) => void
  // Chip click in the dot stack — opens the group-scoped event modal at the
  // page level. The page owns this dialog because the same page also owns
  // the per-event details dialog and threads selection state for both.
  onSelectGroup: (
    bucketStart: string,
    topic: string,
    subjectKind: string,
  ) => void
}

// Fixed pixel height for the canvas. Picked so the dot stack (capped at 16
// groups @ ~36px each) fits comfortably with the axis line + label without
// dominating the page — the actual event list lives in the detail panel
// below, so the canvas is a navigation overview, not the full surface.
const CANVAS_HEIGHT_PX = 380

// Trigger threshold for the scroll-driven older-window fetch. When the user
// scrolls within this many CSS pixels of the left edge, kick off the next
// window so its data has a chance to arrive before they hit the edge.
const LOAD_OLDER_TRIGGER_MARGIN_PX = 400

// TimelineCanvas renders the page's horizontal axis. The page owns the
// bucket data (windowed loading); the canvas is a presentational+navigation
// surface that also drives the scroll-triggered "load older when the user
// reaches the left edge" affordance.
export function TimelineCanvas({
  operationId,
  operationCreatedAt,
  granularity,
  timezone,
  from,
  to,
  buckets,
  earliestLoaded,
  isLoadingInitial,
  isLoadingOlder,
  hasMoreOlder,
  onLoadOlder,
  selectedBucketStart,
  onSelectBucket,
  onSelectGroup,
}: Props) {
  // Live updates — bumps the buckets + events queries via cache invalidation.
  useTimelineLiveUpdates(operationId)

  // Render the operation-start marker only when the loaded window actually
  // covers operationCreatedAt. Without this gate the marker would attach to
  // the left edge of whatever window happens to be loaded — visually lying
  // about when the operation started.
  const showOperationStart = useMemo(() => {
    if (from) return false
    if (!earliestLoaded) return false
    return !dayjs(operationCreatedAt).isBefore(earliestLoaded)
  }, [from, earliestLoaded, operationCreatedAt])

  const segments = useMemo(() => {
    return buildSegments({
      buckets: buckets.map((b) => ({
        bucketStart: b.bucketStart,
        count: b.count,
        topicCounts: b.topicCounts.map((tc) => ({
          topic: tc.topic,
          subjectKind: tc.subjectKind,
          count: tc.count,
        })),
      })),
      granularity,
      timezone,
      operationCreatedAt: showOperationStart ? operationCreatedAt : null,
      now: to ? null : dayjs().toISOString(),
      from: from ?? null,
      to: to ?? null,
    })
  }, [
    buckets,
    operationCreatedAt,
    showOperationStart,
    granularity,
    timezone,
    from,
    to,
  ])

  const scrollRef = useRef<HTMLDivElement | null>(null)

  // --- Scroll anchoring on older-window prepend ----------------------
  //
  // When loadOlder fires and the new window's buckets arrive, the segment
  // list grows on the left. Without this hook the scroll container would
  // anchor to the left and visually snap the viewport away from whatever
  // the user was reading. We capture scrollWidth and the leftmost segment
  // key in a ref and, when a render produces an earlier leftmost segment,
  // bump scrollLeft by the width delta so the visible window stays put.
  const prevScrollWidthRef = useRef(0)
  const earliestSegmentKeyRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const newScrollWidth = root.scrollWidth
    const earliestKey = leftmostSegmentKey(segments)

    if (
      earliestSegmentKeyRef.current &&
      earliestKey &&
      earliestKey < earliestSegmentKeyRef.current
    ) {
      const delta = newScrollWidth - prevScrollWidthRef.current
      if (delta > 0) {
        root.scrollLeft += delta
      }
    }

    earliestSegmentKeyRef.current = earliestKey
    prevScrollWidthRef.current = newScrollWidth
  }, [segments])

  // --- Initial scroll-to-selected + per-selection-change scroll -------
  //
  // The page auto-selects the most recent bucket on mount, which is far to
  // the right of the scroll container. Scroll to it once segments are
  // available. Subsequent segment changes (older window loads) do NOT
  // re-scroll — the user-driven scroll-anchor above is the authority on
  // scrollLeft once initial positioning is done.
  const lastScrolledToRef = useRef<string | null>(null)
  // useLayoutEffect so scrollIntoView runs before the browser paints. Plain
  // useEffect let the canvas paint at scrollLeft=0 first, then jump — the
  // visible jump (or, on cached data, the lucky no-jump landing at the end)
  // was the source of "I sometimes land at the start, sometimes at the end".
  useLayoutEffect(() => {
    if (!selectedBucketStart) return
    if (lastScrolledToRef.current === selectedBucketStart) return
    const root = scrollRef.current
    if (!root) return
    const el = root.querySelector<HTMLElement>(
      `[data-bucket-start="${cssEscape(selectedBucketStart)}"]`,
    )
    if (!el) return // segments haven't arrived yet; effect re-fires once they do
    el.scrollIntoView({
      behavior: "auto",
      block: "nearest",
      inline: "center",
    })
    lastScrolledToRef.current = selectedBucketStart
  }, [selectedBucketStart, segments])

  // --- Load older when scrolled near the left edge --------------------
  //
  // Direct scroll listener instead of IntersectionObserver: simpler to
  // reason about, behaves identically across browsers for horizontal
  // overflow, and easy to debug because the trigger condition is just a
  // scrollLeft comparison. The refs below are read inside the listener
  // closure so we don't rebuild the listener on every isLoading change.
  const isLoadingOlderRef = useRef(isLoadingOlder)
  isLoadingOlderRef.current = isLoadingOlder
  const isLoadingInitialRef = useRef(isLoadingInitial)
  isLoadingInitialRef.current = isLoadingInitial

  useEffect(() => {
    if (!hasMoreOlder) return
    const root = scrollRef.current
    if (!root) return

    const onScroll = () => {
      if (isLoadingOlderRef.current) return
      if (isLoadingInitialRef.current) return
      if (root.scrollLeft <= LOAD_OLDER_TRIGGER_MARGIN_PX) {
        onLoadOlder()
      }
    }
    root.addEventListener("scroll", onScroll, { passive: true })
    return () => root.removeEventListener("scroll", onScroll)
  }, [hasMoreOlder, onLoadOlder])

  const showEmpty = !isLoadingInitial && segments.length === 0 && !hasMoreOlder

  return (
    <div
      className="flex shrink-0 flex-col rounded-md border bg-card"
      style={{ height: `${CANVAS_HEIGHT_PX}px` }}
    >
      {/* Horizontal scroll container fills the card vertically; each
          segment then sizes its dot stack to fill all the available
          height so the axis line lands at the bottom of the canvas.
          Markers (operation-start / today) are mixed inline with active
          buckets and gaps so the axis stays monotonic even when an event
          pre-dates the operation or sits past today. */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden"
      >
        <div className="flex h-full items-stretch px-3 py-4 min-w-fit">
          {hasMoreOlder && (
            <button
              type="button"
              onClick={onLoadOlder}
              disabled={isLoadingOlder}
              aria-label="Load older timeline history"
              className={cn(
                "flex shrink-0 flex-col items-center justify-center gap-1 px-4",
                "text-xs text-muted-foreground hover:text-foreground transition-colors",
                "border-r border-dashed border-border/60",
                isLoadingOlder && "opacity-70",
              )}
              style={{ width: "120px" }}
            >
              {isLoadingOlder ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <ChevronLeftIcon className="size-4" />
              )}
              <span>{isLoadingOlder ? "Loading…" : "Load older"}</span>
            </button>
          )}
          {isLoadingInitial && segments.length === 0 && <InitialSkeleton />}
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
            if (seg.kind === "operation-start") {
              return (
                <OperationCreatedMarker
                  key={`op-start-${seg.at}`}
                  createdAt={seg.at}
                  timezone={timezone}
                />
              )
            }
            if (seg.kind === "today") {
              return (
                <TodayMarker
                  key={`today-${seg.at}`}
                  operationCreatedAt={operationCreatedAt}
                  timezone={timezone}
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
                  bucketStart={seg.bucketStart}
                  count={seg.count}
                  topicCounts={seg.topicCounts}
                  widthPx={seg.widthPx}
                  granularity={granularity}
                  timezone={timezone}
                  isSelected={seg.bucketStart === selectedBucketStart}
                  onSelectBucket={onSelectBucket}
                  onSelectGroup={onSelectGroup}
                />
              </div>
            )
          })}
        </div>
      </div>

      {showEmpty && (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
          No events yet. Activity will appear here as you work.
        </div>
      )}
    </div>
  )
}

// InitialSkeleton is what the canvas shows during the very first window
// fetch (no buckets yet). A handful of placeholder dots beats a blank
// card while the user is waiting on the network.
function InitialSkeleton() {
  // Eight skeleton segments fill the visible width on most laptops without
  // implying a specific shape for the loaded data.
  const cells = Array.from({ length: 8 })
  return (
    <>
      {cells.map((_, i) => (
        <div
          key={`skel-${i}`}
          className="flex shrink-0 flex-col items-center justify-end gap-2 pb-4"
          style={{ width: "112px" }}
          aria-hidden
        >
          <div className="size-3 rounded-full bg-muted animate-pulse" />
          <div className="h-3 w-12 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </>
  )
}

// leftmostSegmentKey returns a stable, monotonic key for the leftmost
// rendered segment. Used by the scroll-anchor effect to detect when older
// content has been prepended — a strictly-earlier key on a subsequent
// render means React just inserted earlier history.
function leftmostSegmentKey(
  segments: ReturnType<typeof buildSegments>,
): string | null {
  const first = segments[0]
  if (!first) return null
  switch (first.kind) {
    case "active":
      return first.bucketStart
    case "gap":
      return first.fromBucketStart
    case "operation-start":
    case "today":
      return first.at
  }
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
