import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Navigate, useSearchParams } from "react-router"
import { RouteIcon } from "lucide-react"
import { useScopedOperation } from "@/hooks/use-scoped-operation"
import { usePageMetadata } from "@/hooks/use-page-metadata"
import { useOperation } from "@/graphql/hooks/operations"
import { useTimelineBuckets } from "@/graphql/hooks/timeline"
import type {
  TimelineEventFieldsFragment,
  TimelineGranularity,
} from "@/graphql/gql/graphql"
import { TimelineToolbar } from "@/components/timeline/timeline-toolbar"
import { TimelineCanvas } from "@/components/timeline/timeline-canvas"
import { TimelineDayPanel } from "@/components/timeline/timeline-day-panel"
import { dayjs } from "@/components/timeline/dayjs-setup"
import { truncateToGranularity } from "@/components/timeline/piecewise-axis"
import { EventDetailsDialog } from "@/components/timeline/event-details-dialog"
import type { ActorChip } from "@/components/timeline/timeline-filters"

// Resolve the viewer's IANA timezone once per mount. Browsers without
// resolvedOptions fall back to UTC so the timeline never breaks on exotic
// runtimes.
function resolveTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

export function TimelinePage() {
  const scopedOperation = useScopedOperation()

  usePageMetadata({
    title: "Timeline",
    icon: { kind: "lucide", component: RouteIcon },
  })

  if (!scopedOperation) {
    return <Navigate to="/operations" replace />
  }

  return <TimelinePageInner operationId={scopedOperation.id} />
}

const VALID_GRANULARITIES: ReadonlySet<TimelineGranularity> = new Set([
  "DAY",
  "WEEK",
  "MONTH",
])
const VALID_TYPES: ReadonlySet<string> = new Set(["credential", "wiki_document"])
// Bare YYYY-MM-DD — matches the resolver's parseTime fallback.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function TimelinePageInner({ operationId }: { operationId: string }) {
  const timezone = useMemo(resolveTimezone, [])
  const [searchParams, setSearchParams] = useSearchParams()

  // --- Read filter state from URL --------------------------------------
  //
  // URL is the single source of truth for granularity, types, from, to, and
  // the set of selected actor IDs. The actor *labels* (usernames) live in a
  // local map so chips render nicely without a per-actor follow-up query;
  // unknown IDs fall back to a short hash so a shared link still renders.

  const granularity: TimelineGranularity = useMemo(() => {
    const raw = searchParams.get("gran")?.toUpperCase()
    return raw && VALID_GRANULARITIES.has(raw as TimelineGranularity)
      ? (raw as TimelineGranularity)
      : "DAY"
  }, [searchParams])

  const types = useMemo(() => {
    const raw = searchParams.get("types")
    if (!raw) return [] as string[]
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => VALID_TYPES.has(t))
  }, [searchParams])

  const actorIds = useMemo(() => {
    const raw = searchParams.get("actors")
    if (!raw) return [] as string[]
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  }, [searchParams])

  const from = useMemo(() => {
    const raw = searchParams.get("from")
    return raw && DATE_PATTERN.test(raw) ? raw : null
  }, [searchParams])

  const to = useMemo(() => {
    const raw = searchParams.get("to")
    return raw && DATE_PATTERN.test(raw) ? raw : null
  }, [searchParams])

  // selectedDay carries the bucketStart string (ISO with offset) for the
  // bucket currently expanded in the detail panel. Lives in the URL so a
  // shared link reproduces what the user was looking at — including the
  // open day below the axis.
  const selectedDay = searchParams.get("day")

  // --- Operation context (for axis bounds and actor name resolution) ---

  const { data: operationData, isLoading: opLoading } = useOperation(operationId)

  // actorLabels is a local cache of id → username. Hydrated from the
  // operation's members list and extended whenever the user adds a chip via
  // the picker. Falling back to a truncated ID keeps the chip readable when
  // the URL carries an unknown actor (e.g. a former member who has since
  // been removed but whose events still exist).
  const [actorLabels, setActorLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!operationData?.operation.members) return
    setActorLabels((prev) => {
      let changed = false
      const next = { ...prev }
      for (const m of operationData.operation.members) {
        if (!next[m.user.id]) {
          next[m.user.id] = m.user.username
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [operationData])

  const actors: ActorChip[] = useMemo(
    () =>
      actorIds.map((id) => ({
        id,
        username: actorLabels[id] ?? `User ${id.slice(0, 6)}`,
      })),
    [actorIds, actorLabels],
  )

  // --- URL writes -------------------------------------------------------
  //
  // mutateParams clones the current params, applies a callback, then writes
  // back with replace so we don't fill browser history with every keystroke.

  // searchParams is a fresh URLSearchParams object on each render — capture
  // it by ref so callbacks don't churn React Query keys via identity changes.
  const searchParamsRef = useRef(searchParams)
  searchParamsRef.current = searchParams

  const mutateParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParamsRef.current)
      mutate(next)
      setSearchParams(next, { replace: true })
    },
    [setSearchParams],
  )

  // Remember the most recent selection per granularity. Without this,
  // Day "May 21" → Week (snaps to May 18) → Day would strand the user at
  // May 18 instead of restoring May 21. In-memory only; a shared link
  // still carries just the currently-visible bucket via ?day=…
  const bucketHistoryRef = useRef<Record<TimelineGranularity, string | null>>({
    DAY: null,
    WEEK: null,
    MONTH: null,
  })

  // Stamp the current selection into the per-granularity cache whenever it
  // changes — covers user clicks, auto-select-latest, and translated picks.
  useEffect(() => {
    bucketHistoryRef.current[granularity] = selectedDay
  }, [granularity, selectedDay])

  const setGranularity = useCallback(
    (next: TimelineGranularity) =>
      mutateParams((p) => {
        if (next === "DAY") p.delete("gran")
        else p.set("gran", next)
        // Prefer the prior pick at the target granularity so round-tripping
        // restores the user's earlier selection (e.g. Day→Week→Day returns
        // to the original day). Falling back to a translated boundary keeps
        // the panel mounted on the first visit to a granularity. The
        // frontend's truncation mirrors Mongo `$dateTrunc` with timezone,
        // so the translated value matches a real server bucket boundary.
        const remembered = bucketHistoryRef.current[next]
        if (remembered) {
          p.set("day", remembered)
          return
        }
        const currentDay = p.get("day")
        if (currentDay) {
          const translated = truncateToGranularity(
            dayjs(currentDay).tz(timezone),
            next,
          ).toISOString()
          p.set("day", translated)
        }
      }),
    [mutateParams, timezone],
  )

  const setTypes = useCallback(
    (next: string[]) =>
      mutateParams((p) => {
        if (next.length === 0) p.delete("types")
        else p.set("types", next.join(","))
      }),
    [mutateParams],
  )

  const setActors = useCallback(
    (next: ActorChip[]) => {
      // Stash newly-added usernames before writing IDs to the URL — when the
      // URL re-renders, the actor chip will still have a readable label.
      setActorLabels((prev) => {
        let changed = false
        const map = { ...prev }
        for (const a of next) {
          if (a.username && !map[a.id]) {
            map[a.id] = a.username
            changed = true
          }
        }
        return changed ? map : prev
      })
      mutateParams((p) => {
        if (next.length === 0) p.delete("actors")
        else p.set("actors", next.map((a) => a.id).join(","))
      })
    },
    [mutateParams],
  )

  const setRange = useCallback(
    (next: { from: string | null; to: string | null }) =>
      mutateParams((p) => {
        if (next.from) p.set("from", next.from)
        else p.delete("from")
        if (next.to) p.set("to", next.to)
        else p.delete("to")
      }),
    [mutateParams],
  )

  const setSelectedDay = useCallback(
    (next: string | null) =>
      mutateParams((p) => {
        if (next) p.set("day", next)
        else p.delete("day")
      }),
    [mutateParams],
  )

  const hasActiveFilters =
    types.length > 0 || actorIds.length > 0 || !!from || !!to

  const reset = useCallback(() => {
    mutateParams((p) => {
      p.delete("types")
      p.delete("actors")
      p.delete("from")
      p.delete("to")
      p.delete("day")
    })
  }, [mutateParams])

  // --- Bucket data for auto-selecting the most recent active day -------
  //
  // We call useTimelineBuckets here in addition to inside TimelineCanvas;
  // React Query dedupes against the canvas hook (same key) so there's no
  // second network call. The page uses it solely to derive a sensible
  // default selection when the URL doesn't pin one.
  const { data: bucketsData, isLoading: bucketsLoading } = useTimelineBuckets({
    operationId,
    granularity,
    timezone,
    types: types.length > 0 ? types : null,
    actorIds: actorIds.length > 0 ? actorIds : null,
    from,
    to,
  })

  // Buckets come from the resolver in ascending order; the most recent
  // active bucket is the last entry. Memoized so it can drive both the
  // auto-select effect and the Clear button's visibility (clearing while
  // already on the latest bucket would be a no-op since the effect would
  // immediately re-select it).
  const latestBucketStart = useMemo(() => {
    const buckets = bucketsData?.timelineBuckets
    if (!buckets || buckets.length === 0) return null
    return buckets[buckets.length - 1].bucketStart
  }, [bucketsData])

  useEffect(() => {
    if (selectedDay) return
    if (!latestBucketStart) return
    // Auto-selecting means a fresh load of the timeline shows real content
    // in the panel instead of an empty "click a day" hint.
    setSelectedDay(latestBucketStart)
    // setSelectedDay is stable via useCallback.
  }, [latestBucketStart, selectedDay, setSelectedDay])

  // --- Event details dialog state (lifted from the canvas) -------------
  //
  // Both the canvas (event icons inside a dot stack) and the day panel
  // (event rows) need to open this dialog, so it lives at the page level.

  const [selectedEvent, setSelectedEvent] =
    useState<TimelineEventFieldsFragment | null>(null)
  const [eventDialogOpen, setEventDialogOpen] = useState(false)

  const handleEventClick = useCallback((event: TimelineEventFieldsFragment) => {
    setSelectedEvent(event)
    setEventDialogOpen(true)
  }, [])

  if (opLoading || !operationData) {
    return (
      <div className="flex flex-1 flex-col gap-2 p-2">
        <div className="rounded-md border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
          Loading timeline…
        </div>
      </div>
    )
  }

  const op = operationData.operation

  return (
    <div className="flex flex-1 flex-col gap-2 p-2 min-h-0">
      <TimelineToolbar
        operationName={op.name}
        isLoading={bucketsLoading}
        granularity={granularity}
        onGranularityChange={setGranularity}
        types={types}
        onTypesChange={setTypes}
        actors={actors}
        onActorsChange={setActors}
        from={from}
        to={to}
        onRangeChange={setRange}
        hasActiveFilters={hasActiveFilters}
        onReset={reset}
      />

      <TimelineCanvas
        operationId={op.id}
        operationCreatedAt={op.createdAt}
        granularity={granularity}
        timezone={timezone}
        types={types.length > 0 ? types : null}
        actorIds={actorIds.length > 0 ? actorIds : null}
        from={from}
        to={to}
        selectedBucketStart={selectedDay}
        onSelectBucket={setSelectedDay}
        onEventClick={handleEventClick}
      />

      <TimelineDayPanel
        operationId={op.id}
        bucketStart={selectedDay}
        granularity={granularity}
        timezone={timezone}
        types={types.length > 0 ? types : null}
        actorIds={actorIds.length > 0 ? actorIds : null}
        onEventSelect={handleEventClick}
        onClearSelection={() => setSelectedDay(null)}
        canClear={
          selectedDay !== null &&
          latestBucketStart !== null &&
          selectedDay !== latestBucketStart
        }
      />

      <EventDetailsDialog
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
        event={selectedEvent}
      />
    </div>
  )
}
