import { useCallback, useEffect, useMemo, useState } from "react"
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import { useSubscription } from "@/hooks/use-subscription"
import { dayjs } from "@/components/timeline/dayjs-setup"
import {
  advanceGranularity,
  truncateToGranularity,
} from "@/components/timeline/piecewise-axis"
import {
  CreateCustomTimelineEventDocument,
  DeleteCustomTimelineEventDocument,
  TimelineBucketsDocument,
  TimelineEventsByDayDocument,
  TimelineEventAddedDocument,
  UpdateCustomTimelineEventDocument,
} from "@/graphql/gql/graphql"
import type {
  CreateCustomTimelineEventInput,
  TimelineBucketsQuery,
  TimelineGranularity,
  UpdateCustomTimelineEventInput,
} from "@/graphql/gql/graphql"

export type TimelineFilters = {
  operationId: string
  granularity: TimelineGranularity
  timezone: string
  types?: string[] | null
  actorIds?: string[] | null
  from?: string | null
  to?: string | null
}

// React Query key factory. Buckets and per-day lists both live under the
// `all` prefix so a live event can invalidate the whole timeline namespace
// in one call without touching unrelated pages.
export const timelineKeys = {
  all: ["timeline"] as const,
  buckets: (params: TimelineFilters) =>
    [...timelineKeys.all, "buckets", params] as const,
  day: (
    operationId: string,
    date: string,
    timezone: string,
    granularity: TimelineGranularity,
    types?: string[] | null,
    actorIds?: string[] | null,
  ) =>
    [
      ...timelineKeys.all,
      "day",
      operationId,
      date,
      timezone,
      granularity,
      types ?? null,
      actorIds ?? null,
    ] as const,
}

// useTimelineEventsByDay fetches the events that fall inside a single bucket.
// Only the day panel calls this — the canvas renders its dot stack from the
// topicCounts on timelineBuckets, so a dense axis no longer fans out a
// per-bucket events query.
export function useTimelineEventsByDay(
  operationId: string,
  date: string,
  timezone: string,
  granularity: TimelineGranularity,
  types?: string[] | null,
  actorIds?: string[] | null,
  enabled = true,
) {
  return useQuery({
    queryKey: timelineKeys.day(
      operationId,
      date,
      timezone,
      granularity,
      types,
      actorIds,
    ),
    queryFn: () =>
      graphqlClient(TimelineEventsByDayDocument, {
        operationId,
        date,
        timezone,
        granularity,
        types: types && types.length > 0 ? types : null,
        actorIds: actorIds && actorIds.length > 0 ? actorIds : null,
        first: 100,
      }),
    enabled: enabled && !!operationId && !!date && !!timezone,
  })
}

// --- Custom timeline event mutations -------------------------------------
//
// All three mutations invalidate the entire timeline namespace on success.
// The resolver publishes TopicOperationEventLogged so the live subscription
// also fires; the explicit invalidation here covers the originating client
// before the subscription round-trip arrives.

function useInvalidateTimeline() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: timelineKeys.all })
}

export function useCreateCustomTimelineEvent() {
  const invalidate = useInvalidateTimeline()
  return useMutation({
    mutationFn: (vars: {
      operationId: string
      input: CreateCustomTimelineEventInput
    }) => graphqlClient(CreateCustomTimelineEventDocument, vars),
    onSuccess: invalidate,
  })
}

export function useUpdateCustomTimelineEvent() {
  const invalidate = useInvalidateTimeline()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateCustomTimelineEventInput }) =>
      graphqlClient(UpdateCustomTimelineEventDocument, vars),
    onSuccess: invalidate,
  })
}

export function useDeleteCustomTimelineEvent() {
  const invalidate = useInvalidateTimeline()
  return useMutation({
    mutationFn: (id: string) =>
      graphqlClient(DeleteCustomTimelineEventDocument, { id }),
    onSuccess: invalidate,
  })
}

// useTimelineLiveUpdates wires the subscription. On every new event we
// invalidate the entire timeline namespace so React Query refetches both
// the bucket count axis and any per-day lists; the resulting refetch is
// cheap (axis is a single aggregation, day list is a small page) and keeps
// live UX consistent with the persisted state without manual cache surgery.
export function useTimelineLiveUpdates(
  operationId: string,
  enabled = true,
) {
  const queryClient = useQueryClient()
  useSubscription(
    TimelineEventAddedDocument,
    { operationId },
    {
      enabled: enabled && !!operationId,
      onData: () => {
        queryClient.invalidateQueries({ queryKey: timelineKeys.all })
      },
    },
  )
}

// --- Windowed bucket loading --------------------------------------------
//
// Instead of fetching every bucket from operation creation through today on
// page load (slow on large operations), the page loads a sliding window
// anchored at "now" and pulls older windows in on-demand as the user scrolls
// left. First-paint cost is bounded by WINDOW_BUCKETS regardless of total
// operation age.
//
// User-applied from/to filters opt out of windowing — the user explicitly
// asked for a specific range, so the hook returns a single non-windowed
// query covering exactly that range.

// Number of granularity-aligned buckets per window. Sized so each window is
// roughly three months of activity at any granularity (six at MONTH so the
// landing axis isn't almost-empty for low-frequency operations).
const WINDOW_BUCKETS: Record<TimelineGranularity, number> = {
  DAY: 90,
  WEEK: 13,
  MONTH: 6,
}

const GRANULARITY_UNIT: Record<TimelineGranularity, "day" | "week" | "month"> =
  {
    DAY: "day",
    WEEK: "week",
    MONTH: "month",
  }

// Safety cap on total loaded windows. With WINDOW_BUCKETS[DAY] = 90, this is
// roughly twelve years of day-granularity history — well beyond any real
// operation. Guards the empty-window auto-load path from runaway requests
// when operationCreatedAt is missing or wrong.
const MAX_WINDOWS = 50

export type TimelineBucketFragment =
  TimelineBucketsQuery["timelineBuckets"][number]

interface WindowRange {
  from: string
  to: string
}

interface BucketsWindowedParams {
  operationId: string
  granularity: TimelineGranularity
  timezone: string
  types?: string[] | null
  actorIds?: string[] | null
  // When set, the hook returns a single non-windowed query covering this
  // range. The user explicitly narrowed the view via the date picker, so
  // windowing would just slow that down with no benefit.
  userFrom?: string | null
  userTo?: string | null
  // ISO bucketStart of the currently-pinned day from the URL. Only used at
  // mount / filter-reset time so a deep link to an old bucket loads enough
  // history to render it without forcing the user to scroll left first.
  pinnedDay?: string | null
}

// computeInitialWindow returns the most-recent window aligned to bucket
// boundaries. The right edge advances past "now" so today's events are
// always included. A pinnedDay older than the default left edge widens the
// window so the deep-linked bucket lands inside it on mount.
function computeInitialWindow(
  granularity: TimelineGranularity,
  timezone: string,
  pinnedDay: string | null,
): WindowRange {
  const now = dayjs().tz(timezone)
  const numBuckets = WINDOW_BUCKETS[granularity]
  const unit = GRANULARITY_UNIT[granularity]

  const toBoundary = advanceGranularity(
    truncateToGranularity(now, granularity),
    granularity,
  )
  let fromBoundary = truncateToGranularity(
    now.subtract(numBuckets - 1, unit),
    granularity,
  )
  let extendedTo = toBoundary

  if (pinnedDay) {
    const pinned = truncateToGranularity(
      dayjs(pinnedDay).tz(timezone),
      granularity,
    )
    if (pinned.isBefore(fromBoundary)) {
      fromBoundary = pinned
    }
    if (!pinned.isBefore(toBoundary)) {
      // Pinned bucket sits today or in the future — extend the right edge so
      // the pinned segment renders without forcing the user to scroll right.
      extendedTo = advanceGranularity(pinned, granularity)
    }
  }

  return {
    from: fromBoundary.toISOString(),
    to: extendedTo.toISOString(),
  }
}

// computeOlderWindow returns the next-older window butted up against the
// caller's earliest currently-loaded window. Sharing the boundary (`from`
// of the existing window becomes `to` of the new one) means no bucket can
// land in two windows at once, so concatenated counts are exact.
function computeOlderWindow(
  granularity: TimelineGranularity,
  timezone: string,
  current: WindowRange,
): WindowRange {
  const newTo = current.from
  const newToDayjs = dayjs(newTo).tz(timezone)
  const unit = GRANULARITY_UNIT[granularity]
  const numBuckets = WINDOW_BUCKETS[granularity]
  const newFromBoundary = truncateToGranularity(
    newToDayjs.subtract(numBuckets, unit),
    granularity,
  )
  return {
    from: newFromBoundary.toISOString(),
    to: newTo,
  }
}

export interface TimelineBucketsWindowedResult {
  buckets: TimelineBucketFragment[]
  // ISO of the earliest loaded window's left edge — exposed so the canvas
  // can render an operation-start marker only once we've actually loaded
  // back that far.
  earliestLoaded: string | null
  hasMoreOlder: boolean
  isLoadingInitial: boolean
  isLoadingOlder: boolean
  loadOlder: () => void
  error: Error | null
}

// useTimelineBucketsWindowed fans the bucket axis across one or more time
// windows. Each window is its own React Query entry (via useQueries) so the
// cache, refetch, and invalidation paths all work without bespoke wiring.
export function useTimelineBucketsWindowed(
  params: BucketsWindowedParams,
): TimelineBucketsWindowedResult {
  const {
    operationId,
    granularity,
    timezone,
    types,
    actorIds,
    userFrom,
    userTo,
    pinnedDay,
  } = params

  const hasUserFilter = !!(userFrom || userTo)

  // Initial window set, recomputed when the user-controlled inputs change.
  // pinnedDay is intentionally part of this memo so a deep link reflects on
  // mount, but the reset effect below doesn't depend on it — clicking a
  // different bucket should not blow away already-loaded older windows.
  const initialWindows = useMemo<WindowRange[]>(() => {
    if (hasUserFilter) {
      return [{ from: userFrom ?? "", to: userTo ?? "" }]
    }
    return [computeInitialWindow(granularity, timezone, pinnedDay ?? null)]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUserFilter, userFrom, userTo, granularity, timezone, pinnedDay])

  const [windows, setWindows] = useState<WindowRange[]>(initialWindows)

  // Reset windows when filters/granularity change. Excludes pinnedDay (see
  // initialWindows comment above) — capture pinnedDay at reset time via the
  // closure on initialWindows.
  const resetKey = useMemo(
    () =>
      JSON.stringify({
        hasUserFilter,
        userFrom,
        userTo,
        granularity,
        timezone,
        types: types ?? null,
        actorIds: actorIds ?? null,
      }),
    [hasUserFilter, userFrom, userTo, granularity, timezone, types, actorIds],
  )

  useEffect(() => {
    setWindows(initialWindows)
    // resetKey changes are the trigger; initialWindows is the latest value
    // captured by the closure at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  const results = useQueries({
    queries: windows.map((w) => ({
      queryKey: timelineKeys.buckets({
        operationId,
        granularity,
        timezone,
        types: types ?? null,
        actorIds: actorIds ?? null,
        from: w.from || null,
        to: w.to || null,
      }),
      queryFn: () =>
        graphqlClient(TimelineBucketsDocument, {
          operationId,
          granularity,
          timezone,
          from: w.from || null,
          to: w.to || null,
          types: types && types.length > 0 ? types : null,
          actorIds:
            actorIds && actorIds.length > 0 ? actorIds : null,
        }),
      enabled: !!operationId && !!timezone,
      // Keep windows warm for half a minute so a quick day-bucket switch
      // doesn't refetch the whole axis. Live subscription invalidates
      // timelineKeys.all on real events anyway.
      staleTime: 30_000,
    })),
  })

  // Concatenate all loaded windows and sort ascending. Sort is cheap (axis
  // length is bounded by what the user has loaded — typically a few hundred
  // buckets at most) and lets the caller treat the result like the legacy
  // single-query response.
  const buckets = useMemo<TimelineBucketFragment[]>(() => {
    const all: TimelineBucketFragment[] = []
    for (const r of results) {
      const data = r.data?.timelineBuckets
      if (data) all.push(...data)
    }
    all.sort((a, b) => (a.bucketStart < b.bucketStart ? -1 : 1))
    return all
  }, [results])

  const earliestLoaded = windows[0]?.from || null

  // Stays true until MAX_WINDOWS so the "Load older" affordance keeps
  // working as far back as the user wants to scroll. Notably NOT gated on
  // operationCreatedAt — two cases break that assumption: (1) seeded test
  // data backdates events to before the operation row, (2) custom timeline
  // events can be authored with any occurredAt, so a real operation can
  // have annotations that predate its creation.
  const hasMoreOlder =
    !hasUserFilter && !!earliestLoaded && windows.length < MAX_WINDOWS

  // "Initial" = there's exactly one window and it's still pending. After it
  // resolves, or once we've prepended older windows, this flips false even
  // if results[0] (now an older window) is mid-fetch.
  const isLoadingInitial = results.length === 1 && results[0].isLoading
  // loadOlder prepends, so results[0] tracks the oldest pending window when
  // there's more than one in flight.
  const isLoadingOlder = results.length > 1 && results[0].isLoading

  const loadOlder = useCallback(() => {
    setWindows((prev) => {
      if (prev.length === 0) return prev
      if (prev.length >= MAX_WINDOWS) return prev
      const earliest = prev[0]
      const older = computeOlderWindow(granularity, timezone, earliest)
      return [older, ...prev]
    })
  }, [granularity, timezone])

  // Empty initial window? Auto-pull the next older one so the user lands on
  // visible content instead of an empty axis. Re-runs naturally until either
  // a bucket appears, hasMoreOlder flips false, or MAX_WINDOWS hits.
  const anyLoading = results.some((r) => r.isLoading)
  const allLoaded = !anyLoading && results.length > 0
  useEffect(() => {
    if (hasUserFilter) return
    if (!allLoaded) return
    if (buckets.length > 0) return
    if (!hasMoreOlder) return
    loadOlder()
  }, [hasUserFilter, allLoaded, buckets.length, hasMoreOlder, loadOlder])

  const error = useMemo(() => {
    for (const r of results) {
      if (r.error) return r.error as Error
    }
    return null
  }, [results])

  return {
    buckets,
    earliestLoaded,
    hasMoreOlder,
    isLoadingInitial,
    isLoadingOlder,
    loadOlder,
    error,
  }
}
