import type { TimelineGranularity } from "@/graphql/gql/graphql"
import { dayjs } from "./dayjs-setup"

// formatRangeLabel renders a bucket start as a human label that matches the
// granularity: a day reads as "Saturday, May 30, 2026", a week as "May 25 –
// 31, 2026", a month as "May 2026". Shared by the day panel and the
// group-scoped event dialog so both headers read identically.
export function formatRangeLabel(
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
