import type { TimelineGranularity } from "@/graphql/gql/graphql"
import { dayjs } from "./dayjs-setup"

// Width budget per segment kind. Active segments get more room than gap
// segments so the timeline reads as "this is where activity happened" rather
// than a uniform tape of dots and dashes.
export const ACTIVE_WIDTH_PX: Record<TimelineGranularity, number> = {
  DAY: 112,
  WEEK: 160,
  MONTH: 200,
}

export const GAP_WIDTH_PX = 80

export type BucketInput = {
  // ISO 8601 with offset, as returned by timelineBuckets.bucketStart.
  bucketStart: string
  count: number
}

// Each segment is either an active bucket (count > 0) or a compressed gap.
// The frontend renders one DOM element per segment with the given widthPx.
export type Segment =
  | {
      kind: "active"
      bucketStart: string
      count: number
      widthPx: number
    }
  | {
      kind: "gap"
      fromBucketStart: string
      toBucketStart: string
      spanBuckets: number
      widthPx: number
    }

// buildSegments turns a list of *active* buckets into the ordered segment
// timeline that the axis renders. Empty stretches between active buckets are
// collapsed into single gap segments labelled with the bucket count.
//
// `start` and `end` are inclusive bounds (typically operation.createdAt and
// "now") used to render leading/trailing gaps so the axis always covers the
// full operation lifetime, even when there's no activity at the edges.
export function buildSegments(
  buckets: BucketInput[],
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
  granularity: TimelineGranularity,
  timezone: string,
): Segment[] {
  const activeWidth = ACTIVE_WIDTH_PX[granularity]
  const sorted = [...buckets].sort((a, b) =>
    a.bucketStart < b.bucketStart ? -1 : 1,
  )

  // Truncate the bounds to bucket boundaries in the viewer's timezone so
  // gap counting is consistent with how the backend buckets events.
  const lo = truncateToGranularity(start.tz(timezone), granularity)
  const hi = truncateToGranularity(end.tz(timezone), granularity)

  const segments: Segment[] = []
  let cursor = lo

  for (const b of sorted) {
    // NB: dayjs.tz(string, tz) is the well-known footgun — it strips the
    // input's offset/Z and reinterprets the wall clock in the target zone,
    // shifting day-bucketed strings by the offset. The server returns
    // bucketStart as a proper UTC ISO string (e.g. "...22:00:00Z" for a
    // Berlin midnight), so we parse-then-convert to preserve the instant.
    const bStart = dayjs(b.bucketStart).tz(timezone)
    const truncated = truncateToGranularity(bStart, granularity)
    const span = bucketSpan(cursor, truncated, granularity)
    if (span > 0) {
      segments.push({
        kind: "gap",
        fromBucketStart: cursor.format(),
        toBucketStart: truncated.format(),
        spanBuckets: span,
        widthPx: GAP_WIDTH_PX,
      })
    }
    segments.push({
      kind: "active",
      bucketStart: truncated.format(),
      count: b.count,
      widthPx: activeWidth,
    })
    cursor = advanceGranularity(truncated, granularity)
  }

  // Trailing gap from the last active segment to the right edge ("today").
  const trailing = bucketSpan(cursor, hi, granularity)
  if (trailing > 0) {
    segments.push({
      kind: "gap",
      fromBucketStart: cursor.format(),
      toBucketStart: hi.format(),
      spanBuckets: trailing,
      widthPx: GAP_WIDTH_PX,
    })
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

// bucketSpan returns the count of whole buckets between (inclusive) from and
// (exclusive) to. Negative or non-positive spans collapse to 0.
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
