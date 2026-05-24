import { dayjs } from "./dayjs-setup"

interface Props {
  // Operation creation timestamp drives the "Day N" subtitle so the marker
  // doubles as a quick read of how long the operation has been running.
  // Null/undefined hides the subtitle gracefully (e.g. for the synthetic
  // Public operation where no created-at exists).
  operationCreatedAt?: string | null
  timezone: string
}

// TodayMarker pins the right edge of the timeline so the viewer always sees
// "now" on the canvas, regardless of how recently the latest event fired.
// Shows today's date and the operation's day count so the gap label between
// the last active bucket and this marker reads as self-evident time
// elapsed. Flex column so the axis line lands at the bottom of the canvas
// alongside the active-day segments.
export function TodayMarker({ operationCreatedAt, timezone }: Props) {
  const today = dayjs().tz(timezone)
  const dayN = operationCreatedAt
    ? Math.max(
        1,
        today
          .startOf("day")
          .diff(dayjs(operationCreatedAt).tz(timezone).startOf("day"), "day") +
          1,
      )
    : null

  return (
    <div
      className="relative shrink-0 flex flex-col"
      style={{ width: "96px" }}
    >
      <div className="flex-1 min-h-0" />
      <div className="relative h-4 border-t border-border">
        <div className="absolute left-1/2 top-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/70 ring-2 ring-background" />
      </div>
      <div className="pt-1.5 text-center text-xs font-medium text-foreground tabular-nums">
        {today.format("MMM D")}
      </div>
      <div className="pt-1 text-center text-[10px] uppercase tracking-wide text-foreground/60">
        {dayN ? `Today · Day ${dayN}` : "Today"}
      </div>
    </div>
  )
}
