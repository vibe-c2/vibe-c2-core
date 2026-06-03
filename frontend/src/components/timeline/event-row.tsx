import type { TimelineEventFieldsFragment } from "@/graphql/gql/graphql"
import { dayjs } from "./dayjs-setup"
import { EventGlyph } from "./event-icon-display"
import { renderEventSummary } from "./event-summary"

interface EventRowProps {
  event: TimelineEventFieldsFragment
  timezone: string
  onSelect: () => void
}

// EventRow is the shared one-line event presentation used by both the day
// panel and the group-scoped event modal. The glyph comes from EventGlyph, so
// custom events show their authored icon, task closures show their
// outcome-coloured glyph, and every other kind keeps its kind-level identity.
export function EventRow({ event, timezone, onSelect }: EventRowProps) {
  const t = dayjs(event.occurredAt).tz(timezone)
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
    >
      <EventGlyph event={event} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{renderEventSummary(event)}</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {t.format("HH:mm")} · {t.fromNow()}
        </div>
      </div>
    </button>
  )
}
