// Human-friendly time helpers. No date library — the project has none and
// this is all we need.

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function relativeTime(input: string | Date, now: Date = new Date()): string {
  const date = typeof input === "string" ? new Date(input) : input
  const diff = now.getTime() - date.getTime()

  if (diff < 30 * 1000) return "just now"
  if (diff < HOUR) {
    const m = Math.max(1, Math.floor(diff / MINUTE))
    return `${m}m ago`
  }
  if (isSameDay(date, now)) {
    const h = Math.max(1, Math.floor(diff / HOUR))
    return `${h}h ago`
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(date, yesterday)) {
    return `yesterday at ${formatClock(date)}`
  }

  if (diff < 7 * DAY) {
    return `${date.toLocaleDateString(undefined, { weekday: "short" })} at ${formatClock(date)}`
  }

  // Older than a week: drop time.
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  })
}

export function formatAbsolute(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

// Day-group bucketing. Returns a stable key + display label.
// The key is used for React keys and grouping; the label is rendered as a
// sticky section header.
export function dayGroup(input: string | Date, now: Date = new Date()): { key: string; label: string } {
  const date = typeof input === "string" ? new Date(input) : input

  if (isSameDay(date, now)) return { key: "today", label: "Today" }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(date, yesterday)) return { key: "yesterday", label: "Yesterday" }

  const sameYear = date.getFullYear() === now.getFullYear()
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
  const label = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  })
  return { key, label }
}

// Visit-history bucketing. Coarser than dayGroup: collapses days 2–7 into a
// single "2–7 days ago" bucket, then falls through to per-day labels for
// older entries. Used by the wiki history dropdown.
export function historyGroup(
  input: string | Date,
  now: Date = new Date(),
): { key: string; label: string } {
  const date = typeof input === "string" ? new Date(input) : input

  if (isSameDay(date, now)) return { key: "today", label: "Today" }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(date, yesterday)) return { key: "yesterday", label: "Yesterday" }

  // 2–7 days ago: collapse the calendar-day range [now-7, now-2] into a
  // single bucket. Compute the diff against day-aligned timestamps so DST
  // transitions don't shift the boundary.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / DAY)
  if (diffDays >= 2 && diffDays <= 7) {
    return { key: "2-7d", label: "2–7 days ago" }
  }

  const sameYear = date.getFullYear() === now.getFullYear()
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
  const label = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  })
  return { key, label }
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}
