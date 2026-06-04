import dayjs from "dayjs"

export interface DoneDateGroup {
  // Stable identity for the bucket — header rows are de-duplicated and
  // virtual-keyed off this, so it must change exactly when the visible
  // boundary changes (per relative bucket, then per calendar date).
  key: string
  label: string
}

// Tasks with no completion timestamp shouldn't reach the DONE column (it's
// stamped on entry), but legacy rows pre-backfill might lack one. Give them
// their own trailing bucket rather than mis-filing them under a date.
const NO_DATE_GROUP: DoneDateGroup = {
  key: "no-date",
  label: "No completion date",
}

// doneDateGroup buckets a DONE task by how long ago it was completed,
// relative to `now`. The DONE column is server-sorted by done_at descending
// (newest first), so walking tasks in order yields these buckets already in
// order: Today, Yesterday, 2–7 days ago, then one bucket per older calendar
// date. `now` is injectable so the bucketing is deterministic in tests.
export function doneDateGroup(
  doneAt: string | null | undefined,
  now: dayjs.Dayjs = dayjs(),
): DoneDateGroup {
  if (!doneAt) return NO_DATE_GROUP

  const completed = dayjs(doneAt)
  if (!completed.isValid()) return NO_DATE_GROUP

  // Compare calendar days, not 24h windows: a task finished at 23:00
  // yesterday is "Yesterday", not "today" because it's <24h old.
  const daysAgo = now.startOf("day").diff(completed.startOf("day"), "day")

  // Today is its own bucket (so tomorrow's tasks don't slip under
  // "Yesterday"), but it carries no visible header — an empty label tells
  // the list to group without drawing a separator. <= 0 also catches a
  // done_at slightly in the future from clock skew.
  if (daysAgo <= 0) return { key: "today", label: "" }
  if (daysAgo === 1) return { key: "yesterday", label: "Yesterday" }
  if (daysAgo <= 7) return { key: "2-7-days", label: "2–7 days ago" }

  // Older than a week: each calendar date is its own separator.
  return {
    key: completed.format("YYYY-MM-DD"),
    label: completed.format("MMM D, YYYY"),
  }
}
