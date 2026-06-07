import type { TimelineGranularity } from "@/graphql/gql/graphql"
import { dayjs } from "./dayjs-setup"
import { computeActiveSegmentWidth, mergeByGroupIdentity } from "./chip-layout"

// Width budget per segment kind. Active segments get more room than gap
// segments so the timeline reads as "this is where activity happened" rather
// than a uniform tape of dots and dashes.
export const ACTIVE_WIDTH_PX: Record<TimelineGranularity, number> = {
  DAY: 112,
  WEEK: 160,
  MONTH: 200,
}

export const GAP_WIDTH_PX = 80

// Markers (operation-start + today) take their own slot on the axis. The
// canvas renders them via dedicated components — see OperationCreatedMarker
// and TodayMarker — which both render at this width.
export const MARKER_WIDTH_PX = 96

export type BucketTopicCount = {
  topic: string
  subjectKind: string
  count: number
  // Custom-event chip identity. Empty string for system kinds — only
  // user-authored custom events carry a glyph, so the axis groups them into
  // a chip per (emoji, icon, color) tuple while system kinds collapse to
  // their subjectKind. See active-day-segment's mergeByGroupIdentity.
  emoji: string
  icon: string
  color: string
}

export type BucketInput = {
  // ISO 8601 with offset, as returned by timelineBuckets.bucketStart.
  bucketStart: string
  count: number
  topicCounts: BucketTopicCount[]
}

// Each segment is either an active bucket, a compressed gap, or one of the
// two annotation markers. The canvas renders one DOM element per segment.
//
// Markers (operation-start / today) get inserted at their truncated bucket
// boundary alongside whatever active bucket already lives there — they take
// their own visual slot rather than merging with the bucket. This keeps the
// axis monotonic even when a custom event predates operation creation or
// when the user backdated an event to a future date.
export type Segment =
  | {
      kind: "active"
      bucketStart: string
      count: number
      topicCounts: BucketTopicCount[]
      widthPx: number
    }
  | {
      kind: "gap"
      fromBucketStart: string
      toBucketStart: string
      spanBuckets: number
      widthPx: number
    }
  | {
      kind: "operation-start"
      at: string // ISO of the original (un-truncated) operation creation
      widthPx: number
    }
  | {
      kind: "today"
      at: string // ISO of the rendered "now" instant
      widthPx: number
    }

export interface BuildSegmentsOptions {
  buckets: BucketInput[]
  granularity: TimelineGranularity
  timezone: string
  // Operation creation moment. When supplied, an operation-start marker is
  // emitted at the corresponding bucket boundary AND the axis range is
  // extended to whichever is earlier — the operation start or the earliest
  // bucket. Pass null when the user has narrowed the view via a from filter
  // so the marker is suppressed.
  operationCreatedAt: string | null
  // "Now" anchor for the today marker. Same suppression rule via the `to`
  // filter on the caller side.
  now: string | null
  // Optional hard clip — when set, the axis is bounded to [from, to] and the
  // markers above are ignored. The two windows are mutually exclusive in
  // practice (TimelinePage either passes opCreated/now or from/to).
  from?: string | null
  to?: string | null
}

// buildSegments turns a list of *active* buckets into the ordered segment
// timeline that the axis renders. Empty stretches collapse to single gap
// segments labelled with the bucket count.
//
// The axis is always monotonically increasing left-to-right. When an event
// bucket predates operationCreatedAt — or post-dates `now` — the axis
// extends to cover it instead of silently mis-ordering segments (the prior
// implementation's bug: bucketSpan returned 0 for backward spans, dropping
// the would-be leading/trailing gap and stacking the out-of-range bucket
// next to the marker as if it belonged there).
export function buildSegments(opts: BuildSegmentsOptions): Segment[] {
  const { buckets, granularity, timezone, operationCreatedAt, now, from, to } =
    opts

  const activeWidth = ACTIVE_WIDTH_PX[granularity]
  const sortedBuckets = [...buckets].sort((a, b) =>
    a.bucketStart < b.bucketStart ? -1 : 1,
  )

  // --- Build the merged event stream --------------------------------------
  //
  // Each entry has a truncated bucket-boundary key plus an order tag that
  // breaks ties: when an active bucket falls on the operation-start day, we
  // want [op-start marker] [active] in that exact order. For today, the
  // active bucket should come BEFORE the today marker (events fired earlier
  // in the day, then "we are here").
  type Entry = {
    at: dayjs.Dayjs
    order: number
    build: (cursorAtEntry: dayjs.Dayjs) => Segment
  }

  const entries: Entry[] = []

  for (const b of sortedBuckets) {
    // dayjs.tz(string, tz) strips the input offset — use parse-then-convert
    // so the instant survives unchanged.
    const truncated = truncateToGranularity(
      dayjs(b.bucketStart).tz(timezone),
      granularity,
    )
    entries.push({
      at: truncated,
      order: 1, // between op-start (0) and today (2)
      build: () => ({
        kind: "active",
        bucketStart: truncated.format(),
        count: b.count,
        topicCounts: b.topicCounts,
        // Width grows with the chip cloud: a bucket with many distinct group
        // identities fans into extra columns and takes more horizontal room.
        // mergeByGroupIdentity is re-run in ActiveDaySegment for rendering;
        // recomputing the count here keeps widthPx authoritative for the
        // gap/marker/scroll-anchor math without threading the merged groups
        // through the Segment type.
        widthPx: computeActiveSegmentWidth(
          mergeByGroupIdentity(b.topicCounts).length,
          activeWidth,
        ),
      }),
    })
  }

  // Hard from/to clip overrides marker insertion — when the user has
  // narrowed the view, the natural bookends don't apply.
  const showOpMarker = !from && operationCreatedAt
  const showTodayMarker = !to && now

  if (showOpMarker) {
    const at = truncateToGranularity(
      dayjs(operationCreatedAt).tz(timezone),
      granularity,
    )
    entries.push({
      at,
      order: 0, // before same-day actives
      build: () => ({
        kind: "operation-start",
        at: operationCreatedAt,
        widthPx: MARKER_WIDTH_PX,
      }),
    })
  }

  if (showTodayMarker) {
    const at = truncateToGranularity(dayjs(now).tz(timezone), granularity)
    entries.push({
      at,
      order: 2, // after same-day actives
      build: () => ({
        kind: "today",
        at: now,
        widthPx: MARKER_WIDTH_PX,
      }),
    })
  }

  entries.sort((a, b) => {
    if (a.at.isSame(b.at)) return a.order - b.order
    return a.at.isBefore(b.at) ? -1 : 1
  })

  // --- Optional hard bounds from the from/to filter ----------------------
  //
  // from/to widen the axis when set: a from earlier than the first entry
  // should emit a leading gap; a to later than the last entry should emit
  // a trailing one. The filter values are bare YYYY-MM-DD which dayjs
  // interprets as local-time midnight — `.tz(timezone)` re-interprets that
  // wall-clock in the viewer's zone before truncation so the gap span
  // matches what the backend's bucketing would produce.
  const fromAt = from
    ? truncateToGranularity(dayjs(from).tz(timezone), granularity)
    : null
  const toAt = to
    ? truncateToGranularity(dayjs(to).tz(timezone), granularity)
    : null

  if (entries.length === 0) {
    if (fromAt && toAt) {
      const span = bucketSpan(fromAt, toAt, granularity)
      if (span > 0) {
        return [
          {
            kind: "gap",
            fromBucketStart: fromAt.format(),
            toBucketStart: toAt.format(),
            spanBuckets: span,
            widthPx: GAP_WIDTH_PX,
          },
        ]
      }
    }
    return []
  }

  // --- Walk the entries, emitting gaps between non-adjacent slots --------
  //
  // We treat each emitted segment as advancing the cursor by one bucket.
  // Same-bucket entries (e.g. op-start marker + active bucket on the same
  // day) do not advance the cursor more than once, otherwise we'd emit a
  // spurious 1-bucket gap between them.

  const segments: Segment[] = []
  let cursor: dayjs.Dayjs | null = null
  let lastSlot: dayjs.Dayjs | null = null

  // Leading gap when the from bound precedes the earliest entry — gives
  // the user a visual "axis starts here" even though the bound isn't a
  // marker. Suppressed when from sits at or past the first entry.
  if (fromAt && fromAt.isBefore(entries[0].at)) {
    const span = bucketSpan(fromAt, entries[0].at, granularity)
    if (span > 0) {
      segments.push({
        kind: "gap",
        fromBucketStart: fromAt.format(),
        toBucketStart: entries[0].at.format(),
        spanBuckets: span,
        widthPx: GAP_WIDTH_PX,
      })
    }
  }

  for (const entry of entries) {
    if (cursor === null) {
      cursor = entry.at
      lastSlot = entry.at
      segments.push(entry.build(cursor))
      cursor = advanceGranularity(cursor, granularity)
      continue
    }

    if (entry.at.isSame(lastSlot)) {
      // Same bucket as the previous entry — render side-by-side, do not
      // advance the cursor twice. (Cursor already sits one bucket past
      // lastSlot from the prior iteration.)
      segments.push(entry.build(entry.at))
      continue
    }

    const span = bucketSpan(cursor, entry.at, granularity)
    if (span > 0) {
      segments.push({
        kind: "gap",
        fromBucketStart: cursor.format(),
        toBucketStart: entry.at.format(),
        spanBuckets: span,
        widthPx: GAP_WIDTH_PX,
      })
    }
    segments.push(entry.build(entry.at))
    lastSlot = entry.at
    cursor = advanceGranularity(entry.at, granularity)
  }

  // Trailing gap when the to bound sits past the last entry.
  if (toAt && cursor && toAt.isAfter(cursor)) {
    const span = bucketSpan(cursor, toAt, granularity)
    if (span > 0) {
      segments.push({
        kind: "gap",
        fromBucketStart: cursor.format(),
        toBucketStart: toAt.format(),
        spanBuckets: span,
        widthPx: GAP_WIDTH_PX,
      })
    }
  }

  return segments
}

// truncateToGranularity rounds an instant down to its granularity boundary
// in its current timezone. Week boundaries are Monday-start to match the
// Mongo $dateTrunc unit=week convention.
export function truncateToGranularity(
  t: dayjs.Dayjs,
  granularity: TimelineGranularity,
): dayjs.Dayjs {
  switch (granularity) {
    case "WEEK": {
      const dayOfWeek = t.day() // 0 = Sunday
      const offset = (dayOfWeek + 6) % 7
      return t.startOf("day").subtract(offset, "day")
    }
    case "MONTH":
      return t.startOf("month")
    default:
      return t.startOf("day")
  }
}

// advanceGranularity returns the exclusive end of the bucket starting at t.
export function advanceGranularity(
  t: dayjs.Dayjs,
  granularity: TimelineGranularity,
): dayjs.Dayjs {
  switch (granularity) {
    case "WEEK":
      return t.add(7, "day")
    case "MONTH":
      return t.add(1, "month")
    default:
      return t.add(1, "day")
  }
}

// bucketSpan returns the count of whole buckets between (inclusive) from
// and (exclusive) to. Non-positive spans collapse to 0.
function bucketSpan(
  from: dayjs.Dayjs,
  to: dayjs.Dayjs,
  granularity: TimelineGranularity,
): number {
  if (!to.isAfter(from)) return 0
  switch (granularity) {
    case "WEEK":
      return Math.round(to.diff(from, "day") / 7)
    case "MONTH":
      return to.diff(from, "month")
    default:
      return to.diff(from, "day")
  }
}

// formatGapLabel produces the "↔ 23 days" / "3 weeks" / etc. label rendered
// on a gap segment. Uses the granularity unit so a week-level view says
// "weeks" rather than mis-labelling a 4-week gap as "28 days".
export function formatGapLabel(
  spanBuckets: number,
  granularity: TimelineGranularity,
): string {
  const unit =
    granularity === "WEEK"
      ? spanBuckets === 1
        ? "week"
        : "weeks"
      : granularity === "MONTH"
        ? spanBuckets === 1
          ? "month"
          : "months"
        : spanBuckets === 1
          ? "day"
          : "days"
  return `↔ ${spanBuckets} ${unit}`
}
