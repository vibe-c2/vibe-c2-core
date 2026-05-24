import { useQuery, useQueryClient } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import { useSubscription } from "@/hooks/use-subscription"
import {
  TimelineBucketsDocument,
  TimelineEventsByDayDocument,
  TimelineEventAddedDocument,
} from "@/graphql/gql/graphql"
import type { TimelineGranularity } from "@/graphql/gql/graphql"

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

// useTimelineBuckets fetches the bucket count axis for the operation.
// Disabled until the caller has an operationId — keeps the hook safe to mount
// on the page shell before scoping is known.
export function useTimelineBuckets(params: TimelineFilters) {
  return useQuery({
    queryKey: timelineKeys.buckets(params),
    queryFn: () =>
      graphqlClient(TimelineBucketsDocument, {
        operationId: params.operationId,
        granularity: params.granularity,
        timezone: params.timezone,
        from: params.from ?? null,
        to: params.to ?? null,
        types: params.types && params.types.length > 0 ? params.types : null,
        actorIds:
          params.actorIds && params.actorIds.length > 0 ? params.actorIds : null,
      }),
    enabled: !!params.operationId && !!params.timezone,
  })
}

// useTimelineEventsByDay fetches the events that fall inside a single bucket.
// The page lazily renders these per active segment so dense operations don't
// fan out hundreds of queries on first paint.
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
