import { createElement } from "react"
import type { TimelineEventFieldsFragment } from "@/graphql/gql/graphql"
import { dayjs } from "./dayjs-setup"
import { eventIcon, eventAccent } from "./event-icons"
import { renderEventSummary } from "./event-summary"

interface EventRowProps {
  event: TimelineEventFieldsFragment
  timezone: string
  onSelect: () => void
}

// EventRow is the shared one-line event presentation used by both the day
// panel and the group-scoped event modal. Pulls icon + accent from
// eventIcon/eventAccent so task closures show outcome-coloured glyphs (and
// every other kind keeps its kind-level identity).
export function EventRow({ event, timezone, onSelect }: EventRowProps) {
  // eventIcon returns a stable, module-scope Lucide component. createElement
  // (rather than `const Icon = …; <Icon/>`) keeps the React Compiler from
  // mistaking the lookup for a component created during render.
  const icon = eventIcon(event)
  const accent = eventAccent(event)
  const t = dayjs(event.occurredAt).tz(timezone)
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
    >
      {createElement(icon, { className: `mt-0.5 size-4 shrink-0 ${accent}` })}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{renderEventSummary(event)}</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {t.format("HH:mm")} · {t.fromNow()}
        </div>
      </div>
    </button>
  )
}
