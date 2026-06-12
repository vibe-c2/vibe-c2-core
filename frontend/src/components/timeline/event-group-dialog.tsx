import { createElement, useMemo } from "react"
import { flattenConnection } from "@/lib/connection"
import { Loader2Icon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type {
  TimelineEventFieldsFragment,
  TimelineGranularity,
} from "@/graphql/gql/graphql"
import { useTimelineEventsByDay } from "@/graphql/hooks/timeline"
import {
  type TaskStatus,
  subjectKindAccent,
  subjectKindIcon,
  taskStatus,
  taskStatusAccent,
  taskStatusIcon,
} from "./event-icons"
import {
  GroupGlyph,
  type TimelineGroupIdentity,
} from "./event-icon-display"
import { parseCustomEventIcon, renderSubjectKindSummary } from "./event-summary"
import { EventRow } from "./event-row"
import { formatRangeLabel } from "./bucket-label"
import { cn } from "@/lib/utils"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  operationId: string
  bucketStart: string | null
  granularity: TimelineGranularity
  timezone: string
  // The clicked chip's identity. subjectKind drives the server-side fetch;
  // for custom events the emoji/icon/color additionally narrow the list to
  // the one annotation glyph the user clicked.
  group: TimelineGroupIdentity | null
  // Mirror the bucket-level actor filter so the modal stays consistent
  // with whatever the page is filtered to.
  actorIds: string[] | null
  onEventSelect: (event: TimelineEventFieldsFragment) => void
}

// EventGroupDialog lists every event of one group inside a bucket, matching
// the dot stack's chip grouping. A "hash" group spans both hash.created and
// hash.cracked rows; the server-side subjectKind filter returns all of them,
// and each row's own summary line carries the specific verb. Custom events
// share one subjectKind but split by glyph on the axis, so the dialog filters
// the fetched custom rows down to the clicked (emoji, icon, color) identity —
// custom events are low-volume per bucket, so a client-side filter is cheaper
// than threading three more params through the by-day query.
export function EventGroupDialog({
  open,
  onOpenChange,
  operationId,
  bucketStart,
  granularity,
  timezone,
  group,
  actorIds,
  onEventSelect,
}: Props) {
  const subjectKind = group?.subjectKind ?? null
  const ready = open && !!bucketStart && !!group
  const {
    data,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useTimelineEventsByDay(
    operationId,
    bucketStart ?? "",
    timezone,
    granularity,
    subjectKind ? [subjectKind] : null,
    actorIds,
    ready,
  )

  const events = useMemo<TimelineEventFieldsFragment[]>(() => {
    const all = flattenConnection(data, (p) => p.timelineEventsByDay)
    // Custom events all share subjectKind "custom_event"; the chip the user
    // clicked is one specific glyph, so keep only the rows whose authored
    // identity matches it. Other kinds are already fully scoped by the fetch.
    if (group?.subjectKind !== "custom_event") return all
    return all.filter((ev) => {
      const ic = parseCustomEventIcon(ev.metadata)
      return (
        ic.emoji === group.emoji &&
        ic.icon === group.icon &&
        ic.color === group.color
      )
    })
  }, [data, group])

  const loadedLabel = hasNextPage
    ? `${events.length}+ shown`
    : `${events.length} event${events.length === 1 ? "" : "s"}`

  const isTaskGroup = subjectKind === "task"

  // Task closures roll up by outcome — a green "tasks completed" header
  // misled readers when every event was actually status=unknown. For task
  // groups we surface the SUCCESS / FAIL / UNKNOWN split; for everything
  // else the kind-level icon (e.g. credential key) is enough.
  const taskOutcome = useMemo(() => {
    if (!isTaskGroup) return null
    let success = 0
    let fail = 0
    let unknown = 0
    for (const ev of events) {
      switch (taskStatus(ev.metadata)) {
        case "SUCCESS":
          success += 1
          break
        case "FAIL":
          fail += 1
          break
        default:
          unknown += 1
      }
    }
    return { success, fail, unknown }
  }, [events, isTaskGroup])

  const dominantTaskStatus = taskOutcome ? dominantOutcome(taskOutcome) : null
  // Header glyph: custom groups echo the clicked chip's glyph; task groups
  // promote the dominant outcome's icon; everything else shows the kind icon.
  let headerGlyph: React.ReactNode = null
  if (group?.subjectKind === "custom_event") {
    headerGlyph = (
      <GroupGlyph
        subjectKind={group.subjectKind}
        emoji={group.emoji}
        icon={group.icon}
        color={group.color}
      />
    )
  } else if (dominantTaskStatus !== null) {
    headerGlyph = createElement(taskStatusIcon(dominantTaskStatus), {
      className: cn("size-4", taskStatusAccent(dominantTaskStatus)),
    })
  } else if (subjectKind) {
    headerGlyph = createElement(subjectKindIcon(subjectKind), {
      className: cn("size-4", subjectKindAccent(subjectKind)),
    })
  }

  const title = subjectKind
    ? renderSubjectKindSummary(subjectKind, events.length)
    : ""

  const rangeLabel = bucketStart
    ? formatRangeLabel(bucketStart, granularity, timezone)
    : ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {headerGlyph}
            {title}
          </DialogTitle>
          <DialogDescription>
            {rangeLabel}
            <span className="ml-2 text-foreground/60">· {loadedLabel}</span>
            {taskOutcome && (
              <span className="ml-2 text-foreground/60">
                · {formatTaskOutcomeBreakdown(taskOutcome)}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-md border">
          {isLoading && events.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" />
              Loading events…
            </div>
          )}

          {!isLoading && events.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No events in this group.
            </div>
          )}

          {events.length > 0 && (
            <ul className="divide-y">
              {events.map((ev) => (
                <li key={ev.id}>
                  <EventRow
                    event={ev}
                    timezone={timezone}
                    onSelect={() => onEventSelect(ev)}
                  />
                </li>
              ))}
            </ul>
          )}

          {hasNextPage && (
            <div className="flex justify-center border-t bg-muted/20 p-2">
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors disabled:opacity-60"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2Icon className="size-3 animate-spin" />
                    Loading more…
                  </>
                ) : (
                  "Load more"
                )}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface TaskOutcome {
  success: number
  fail: number
  unknown: number
}

// dominantOutcome reduces a task-bucket breakdown to a single TaskStatus so
// the dialog header can pick one icon/accent. FAIL wins ties against
// SUCCESS to err on the side of "something failed here, look closer"; an
// all-unknown bucket falls back to "" (muted dashed).
function dominantOutcome(outcome: TaskOutcome): TaskStatus {
  if (outcome.fail > 0 && outcome.fail >= outcome.success) return "FAIL"
  if (outcome.success > 0) return "SUCCESS"
  return ""
}

// formatTaskOutcomeBreakdown drops zero-count buckets so a clean run reads
// "5 success" instead of "5 success, 0 fail, 0 unknown".
function formatTaskOutcomeBreakdown(outcome: TaskOutcome): string {
  const parts: string[] = []
  if (outcome.success > 0) parts.push(`${outcome.success} success`)
  if (outcome.fail > 0) parts.push(`${outcome.fail} fail`)
  if (outcome.unknown > 0) parts.push(`${outcome.unknown} unknown`)
  return parts.join(", ")
}
