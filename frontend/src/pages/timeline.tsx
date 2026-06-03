import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Navigate, useSearchParams } from "react-router"
import { RouteIcon } from "lucide-react"
import { useScopedOperation } from "@/hooks/use-scoped-operation"
import { usePageMetadata } from "@/hooks/use-page-metadata"
import {
  useMyOperationRole,
  useOperation,
} from "@/graphql/hooks/operations"
import { useTimelineBucketsWindowed } from "@/graphql/hooks/timeline"
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
import { EventGroupDialog } from "@/components/timeline/event-group-dialog"
import type { TimelineGroupIdentity } from "@/components/timeline/event-icon-display"
import { CustomTimelineEventDialog } from "@/components/timeline/custom-timeline-event-dialog"
import { CredentialDetailsDialog } from "@/components/findings/credential-details-dialog"
import { EditCredentialDialog } from "@/components/findings/edit-credential-dialog"
import { DeleteCredentialDialog } from "@/components/findings/delete-credential-dialog"
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
const VALID_TYPES: ReadonlySet<string> = new Set([
  "credential",
  "hash",
  "wiki_document",
  "custom_event",
  "task",
])
// Bare YYYY-MM-DD — matches the resolver's parseTime fallback.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function TimelinePageInner({ operationId }: { operationId: string }) {
  const timezone = useMemo(() => resolveTimezone(), [])
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

  // actorLabels caches id → username for actors the user adds via the picker
  // (written by setActors). Member usernames come from the operation query and
  // are derived during render below rather than synced into this state.
  const [actorLabels, setActorLabels] = useState<Record<string, string>>({})

  // Member labels are derivable from the operation query, so compute them in
  // render instead of mirroring them into state through an effect.
  const memberLabels = useMemo(() => {
    const map: Record<string, string> = {}
    for (const m of operationData?.operation.members ?? []) {
      map[m.user.id] = m.user.username
    }
    return map
  }, [operationData])

  // Falling back to a truncated ID keeps the chip readable when the URL
  // carries an unknown actor (e.g. a former member who has since been removed
  // but whose events still exist).
  const actors: ActorChip[] = useMemo(
    () =>
      actorIds.map((id) => ({
        id,
        username:
          actorLabels[id] ?? memberLabels[id] ?? `User ${id.slice(0, 6)}`,
      })),
    [actorIds, actorLabels, memberLabels],
  )

  // --- URL writes -------------------------------------------------------
  //
  // mutateParams clones the current params, applies a callback, then writes
  // back with replace so we don't fill browser history with every keystroke.

  // searchParams is a fresh URLSearchParams object on each render — capture
  // it by ref so callbacks don't churn React Query keys via identity changes.
  // Synced in an effect (not during render): mutateParams runs from event
  // handlers, well after commit, so reading the latest committed value is safe.
  const searchParamsRef = useRef(searchParams)
  useEffect(() => {
    searchParamsRef.current = searchParams
  })

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

  // --- Windowed bucket data --------------------------------------------
  //
  // The page owns the bucket fetch and threads buckets + the load-older
  // controls into TimelineCanvas. Previously each side fetched its own
  // copy and relied on React Query dedup; centralising here lets the
  // canvas trigger loadOlder against the same windows the page reads.
  const {
    buckets: loadedBuckets,
    earliestLoaded,
    hasMoreOlder,
    isLoadingInitial: bucketsLoading,
    isLoadingOlder,
    loadOlder,
  } = useTimelineBucketsWindowed({
    operationId,
    granularity,
    timezone,
    types: types.length > 0 ? types : null,
    actorIds: actorIds.length > 0 ? actorIds : null,
    userFrom: from,
    userTo: to,
    pinnedDay: selectedDay,
  })

  // Latest active bucket drives the auto-select default. Buckets are sorted
  // ascending across all loaded windows, so the most recent active bucket
  // is the last entry.
  //
  // Normalise the raw bucket string through the same truncate+timezone
  // transform that buildSegments applies — without this, the auto-select
  // writes a UTC "Z" string ("2026-05-29T21:00:00Z") while the rendered
  // segments carry the offset form ("2026-05-30T00:00:00+03:00"). The
  // scroll-to-selected query selector then never matches and the canvas
  // stays at scrollLeft=0.
  const latestBucketStart = useMemo(() => {
    if (loadedBuckets.length === 0) return null
    const raw = loadedBuckets[loadedBuckets.length - 1].bucketStart
    return truncateToGranularity(dayjs(raw).tz(timezone), granularity).format()
  }, [loadedBuckets, timezone, granularity])

  // useLayoutEffect so the URL gains ?day=<latest> before the canvas paints.
  // Plain useEffect runs after first paint, which let the canvas render once
  // with no selection — defaulting to scrollLeft=0 (the left edge) — before
  // a second commit scrolled it to the right. Landing position on reload
  // was effectively a race: with cached bucket data (e.g. navigating to the
  // timeline from another page) React often batches both commits into the
  // same visible paint, so users land at the latest bucket; without cache
  // they briefly see the start. useLayoutEffect closes the gap.
  useLayoutEffect(() => {
    if (selectedDay) return
    if (!latestBucketStart) return
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

  // --- Event group dialog state ---------------------------------------
  //
  // The dot stack's chips open this modal — a focused list of every event of
  // one subject kind in the bucket. Distinct from the day panel (whole
  // bucket) and the details dialog (single event), so the user can drill into
  // "10 credentials" without scrolling past unrelated rows. Scoped by subject
  // kind (not topic) so a "hash" group surfaces both added and cracked hashes
  // under the one circle the dot stack renders.

  const [groupDialog, setGroupDialog] = useState<{
    bucketStart: string
    group: TimelineGroupIdentity
  } | null>(null)

  const handleGroupClick = useCallback(
    (bucketStart: string, group: TimelineGroupIdentity) => {
      setGroupDialog({ bucketStart, group })
    },
    [],
  )

  const handleGroupEventSelect = useCallback(
    (event: TimelineEventFieldsFragment) => {
      setGroupDialog(null)
      setSelectedEvent(event)
      setEventDialogOpen(true)
    },
    [],
  )

  // --- Custom timeline event dialog (create + edit) --------------------
  //
  // Single dialog drives both flows; `customEventBeingEdited` is the row
  // being edited, or null for create. The "Add event" button in the
  // toolbar opens it in create mode; EventDetailsDialog opens it in edit
  // mode after the user clicks "Edit" on a custom event.

  const { data: roleData } = useMyOperationRole(operationId)
  const myRole = roleData?.myOperationRole ?? null
  const canEditTimeline = myRole === "ADMIN" || myRole === "OPERATOR"

  const [customDialogOpen, setCustomDialogOpen] = useState(false)
  const [customEventBeingEdited, setCustomEventBeingEdited] =
    useState<TimelineEventFieldsFragment | null>(null)

  const openCreateCustomEvent = useCallback(() => {
    setCustomEventBeingEdited(null)
    setCustomDialogOpen(true)
  }, [])

  const openEditCustomEvent = useCallback(
    (event: TimelineEventFieldsFragment) => {
      setCustomEventBeingEdited(event)
      setCustomDialogOpen(true)
      setEventDialogOpen(false)
    },
    [],
  )

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
        onAddEvent={openCreateCustomEvent}
        canAddEvent={canEditTimeline}
      />

      <TimelineCanvas
        operationId={op.id}
        operationCreatedAt={op.createdAt}
        granularity={granularity}
        timezone={timezone}
        from={from}
        to={to}
        buckets={loadedBuckets}
        earliestLoaded={earliestLoaded}
        isLoadingInitial={bucketsLoading}
        isLoadingOlder={isLoadingOlder}
        hasMoreOlder={hasMoreOlder}
        onLoadOlder={loadOlder}
        selectedBucketStart={selectedDay}
        onSelectBucket={setSelectedDay}
        onSelectGroup={handleGroupClick}
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
        canEditCustomEvent={canEditTimeline}
        onEditCustomEvent={openEditCustomEvent}
      />

      <EventGroupDialog
        open={groupDialog !== null}
        onOpenChange={(next) => {
          if (!next) setGroupDialog(null)
        }}
        operationId={op.id}
        bucketStart={groupDialog?.bucketStart ?? null}
        granularity={granularity}
        timezone={timezone}
        group={groupDialog?.group ?? null}
        actorIds={actorIds.length > 0 ? actorIds : null}
        onEventSelect={handleGroupEventSelect}
      />

      <CustomTimelineEventDialog
        open={customDialogOpen}
        onOpenChange={setCustomDialogOpen}
        operationId={op.id}
        timezone={timezone}
        event={customEventBeingEdited}
      />

      <CredentialDetailsDialog />
      <EditCredentialDialog />
      <DeleteCredentialDialog />
    </div>
  )
}
