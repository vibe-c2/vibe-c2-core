import { useState, useMemo, type ReactNode } from "react"
import { Link } from "react-router"
import { HistoryIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { WikiAncestorBreadcrumb } from "@/components/wiki/wiki-ancestor-breadcrumb"
import { useWikiDocumentHistory } from "@/graphql/hooks/wiki"
import { historyGroup, relativeTime } from "@/lib/relative-time"
import { isPlainLeftClick } from "@/lib/utils"
import type { WikiDocumentHistoryQuery } from "@/graphql/gql/graphql"

interface WikiHistoryDropdownProps {
  operationId: string
}

type HistoryEdge = WikiDocumentHistoryQuery["wikiDocumentHistory"]["edges"][number]
type HistoryVisit = HistoryEdge["node"]

// Anchored dropdown with the user's recently-visited wiki documents.
// Lazy-fetches on first open so closed-dropdown sessions pay zero round-trips.
// Renders a flat list grouped into Today / Yesterday / 2–7 days ago / dated
// buckets via a sticky header that changes when the bucket key transitions.
export function WikiHistoryDropdown({ operationId }: WikiHistoryDropdownProps) {
  const [open, setOpen] = useState(false)

  const { data, isLoading } = useWikiDocumentHistory(operationId, { enabled: open })

  const visits: HistoryVisit[] = useMemo(
    () => data?.wikiDocumentHistory.edges.map((e) => e.node) ?? [],
    [data],
  )
  const totalCount = data?.wikiDocumentHistory.totalCount ?? 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="History"
                />
              }
            >
              <HistoryIcon className="size-3.5" />
            </PopoverTrigger>
          }
        />
        <TooltipContent>History</TooltipContent>
      </Tooltip>

      <PopoverContent
        align="start"
        className="w-[26rem] gap-0 p-0"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <HistoryIcon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">History</span>
          {totalCount > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {totalCount}
            </span>
          )}
        </div>

        <div className="max-h-[480px] overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-1 p-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-9 rounded-md" />
              ))}
            </div>
          ) : visits.length === 0 ? (
            <EmptyState />
          ) : (
            <GroupedList visits={visits} onClose={() => setOpen(false)} />
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <HistoryIcon className="size-4 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">No history yet</p>
      <p className="text-xs text-muted-foreground">
        Open a page and it will appear here.
      </p>
    </div>
  )
}

interface GroupedListProps {
  visits: HistoryVisit[]
  onClose: () => void
}

// Walks the visit list once, emitting a sticky bucket header whenever the
// historyGroup key transitions. `now` is captured once per render so all rows
// in this pass agree on the same "today" boundary.
function GroupedList({ visits, onClose }: GroupedListProps) {
  const now = new Date()

  const rows: ReactNode[] = []
  let lastBucketKey: string | null = null

  for (const visit of visits) {
    const bucket = historyGroup(visit.visitedAt, now)
    if (bucket.key !== lastBucketKey) {
      rows.push(<GroupHeader key={`h:${bucket.key}`} label={bucket.label} />)
      lastBucketKey = bucket.key
    }
    rows.push(
      <HistoryRow
        key={visit.id}
        visit={visit}
        now={now}
        onClose={onClose}
      />,
    )
  }

  return <div className="py-1">{rows}</div>
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 bg-popover/95 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
      {label}
    </div>
  )
}

interface HistoryRowProps {
  visit: HistoryVisit
  now: Date
  onClose: () => void
}

function HistoryRow({ visit, now, onClose }: HistoryRowProps) {
  return (
    <Link
      to={`/wiki/${visit.document.id}`}
      onClick={(e) => {
        if (isPlainLeftClick(e)) onClose()
      }}
      className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
      title={visit.document.title}
    >
      <DocumentIcon
        emoji={visit.document.emoji}
        icon={visit.document.icon}
        color={visit.document.color}
        size={16}
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <span className="block truncate">{visit.document.title}</span>
        <WikiAncestorBreadcrumb
          ancestors={visit.document.ancestors}
          className="truncate"
        />
      </div>
      <span className="mt-0.5 shrink-0 text-[11px] text-muted-foreground tabular-nums">
        {relativeTime(visit.visitedAt, now)}
      </span>
    </Link>
  )
}
