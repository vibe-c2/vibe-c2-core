import { useEffect, useState } from "react"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useAuthStore } from "@/stores/auth"
import type { WikiDocumentFieldsFragment } from "@/graphql/gql/graphql"

interface WikiDocumentMetaProps {
  document: WikiDocumentFieldsFragment
}

interface Actor {
  id: string
  username: string
}

// Thresholds for cheap "just now" collapsing — avoids "0 seconds ago"
// churn for freshly saved docs where clock skew can produce negative deltas.
const JUST_NOW_THRESHOLD_MS = 30_000
// Refresh cadence — keeps the relative-time string fresh without polling the
// server. At one-minute ticks it's imperceptible for anything over an hour old.
const REFRESH_INTERVAL_MS = 60_000

export function WikiDocumentMeta({ document }: WikiDocumentMetaProps) {
  const currentUserId = useAuthStore((s) => s.user?.userId)

  // useState + interval re-render so "2 minutes ago" becomes "3 minutes ago"
  // without waiting for another GraphQL invalidation.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(
      () => setTick((t) => t + 1),
      REFRESH_INTERVAL_MS,
    )
    return () => window.clearInterval(id)
  }, [])

  // Last-updated attribution is null on legacy rows (pre-feature) and on docs
  // that haven't been edited since creation — only render it when present.
  const hasUpdate = !!(document.lastUpdatedAt && document.lastUpdatedBy)

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-6 pt-4 pb-1 text-xs text-muted-foreground">
      <MetaEntry
        verb="Created"
        actor={document.createdBy}
        timestamp={document.createdAt}
        currentUserId={currentUserId}
      />
      {hasUpdate && (
        <MetaEntry
          verb="Updated"
          actor={document.lastUpdatedBy!}
          timestamp={document.lastUpdatedAt!}
          currentUserId={currentUserId}
        />
      )}
    </div>
  )
}

interface MetaEntryProps {
  verb: string
  actor: Actor | null | undefined
  timestamp: string
  currentUserId: string | undefined
}

function MetaEntry({ verb, actor, timestamp, currentUserId }: MetaEntryProps) {
  const isSelf = actor?.id === currentUserId
  const actorLabel = isSelf ? "you" : (actor?.username ?? "unknown user")

  const parsed = new Date(timestamp)
  const relative = formatRelativeTime(parsed)

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-default" />}>
        {verb} by {actorLabel} {relative}
      </TooltipTrigger>
      <TooltipContent>
        <FormattedDateTimeText date={parsed} />
      </TooltipContent>
    </Tooltip>
  )
}

function formatRelativeTime(date: Date): string {
  const now = Date.now()
  const deltaMs = now - date.getTime()
  if (deltaMs < JUST_NOW_THRESHOLD_MS) return "just now"

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  const deltaSec = Math.round(-deltaMs / 1000)
  const abs = Math.abs(deltaSec)

  if (abs < 60) return rtf.format(deltaSec, "second")
  if (abs < 3600) return rtf.format(Math.round(deltaSec / 60), "minute")
  if (abs < 86_400) return rtf.format(Math.round(deltaSec / 3600), "hour")
  if (abs < 604_800) return rtf.format(Math.round(deltaSec / 86_400), "day")
  if (abs < 2_592_000) return rtf.format(Math.round(deltaSec / 604_800), "week")
  if (abs < 31_536_000) return rtf.format(Math.round(deltaSec / 2_592_000), "month")
  return rtf.format(Math.round(deltaSec / 31_536_000), "year")
}

