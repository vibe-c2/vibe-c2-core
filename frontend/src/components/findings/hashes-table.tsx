import { Virtuoso } from "react-virtuoso"
import { LoaderIcon, HashIcon, KeyIcon, SwordsIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { useHashStore } from "@/stores/hashes"
import {
  hashStatusBadgeClass,
  hashStatusLabel,
  truncateHashValue,
} from "@/components/findings/hash-status-utils"
import { HashRowContextMenu } from "@/components/findings/hash-row-context-menu"
import type { HashFieldsFragment } from "@/graphql/gql/graphql"

// Rows may carry an optional `operation` (resolved by the global-mode query
// only). Scoped-mode rows leave it off.
export type HashRow = HashFieldsFragment & {
  operation?: { id: string; name: string }
}

interface HashesTableProps {
  hashes: HashRow[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  showOperationColumn?: boolean
}

const GRID_COLS_SCOPED =
  "grid-cols-[110px_2fr_1.5fr_60px_1fr_140px]"
const GRID_COLS_GLOBAL =
  "grid-cols-[110px_2fr_1fr_1.5fr_60px_1fr_140px]"

export function HashesTable({
  hashes,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  showOperationColumn = false,
}: HashesTableProps) {
  const openDetails = useHashStore((s) => s.openDetailsPanel)

  const showEmpty = !isLoading && hashes.length === 0
  const showList = !isLoading && hashes.length > 0
  const gridCols = showOperationColumn ? GRID_COLS_GLOBAL : GRID_COLS_SCOPED

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="shrink-0 border-b bg-muted/50">
        <div
          className={`grid ${gridCols} gap-3 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide`}
        >
          <div>Status</div>
          <div>Value</div>
          {showOperationColumn && <div>Operation</div>}
          <div>Comment</div>
          <div className="text-center" title="Cracked credential">
            <KeyIcon className="mx-auto size-3.5" />
          </div>
          <div>Tags</div>
          <div>Created</div>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {showEmpty && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <HashIcon className="size-8 opacity-50" />
          <p className="text-sm">No hashes match these filters.</p>
        </div>
      )}

      {showList && (
        <div className="flex min-h-0 flex-1 flex-col">
          <Virtuoso
            data={hashes}
            endReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage()
            }}
            overscan={200}
            style={{ height: "100%" }}
            className="min-h-0 flex-1"
            itemContent={(_index, h) => (
              <HashRowContextMenu hash={h}>
                <button
                  type="button"
                  onClick={() =>
                    openDetails({
                      id: h.id,
                      label: truncateHashValue(h.value),
                    })
                  }
                  className={`grid ${gridCols} w-full cursor-pointer items-center gap-3 border-b px-4 py-2 text-left text-sm transition-colors hover:bg-muted/50`}
                >
                <div>
                  <Badge
                    variant="outline"
                    className={hashStatusBadgeClass(h.status)}
                  >
                    {hashStatusLabel(h.status)}
                  </Badge>
                </div>
                <div
                  className="truncate font-mono text-xs"
                  title={h.value}
                >
                  {h.value}
                </div>
                {showOperationColumn && (
                  <div
                    className="flex min-w-0 items-center gap-1.5 text-muted-foreground"
                    title={h.operation?.name}
                  >
                    <SwordsIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{h.operation?.name ?? "—"}</span>
                  </div>
                )}
                <div
                  className="truncate text-muted-foreground"
                  title={h.comment}
                >
                  {h.comment || "—"}
                </div>
                <div className="flex justify-center">
                  {h.credentialId ? (
                    <KeyIcon
                      className="size-4 text-emerald-600 dark:text-emerald-400"
                      aria-label="Linked to credential"
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 overflow-hidden">
                  {h.tags.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    h.tags.slice(0, 3).map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))
                  )}
                  {h.tags.length > 3 && (
                    <Badge variant="ghost">+{h.tags.length - 3}</Badge>
                  )}
                </div>
                <div className="text-muted-foreground">
                  <FormattedDateTimeText date={h.createdAt} />
                </div>
                </button>
              </HashRowContextMenu>
            )}
            components={{
              Footer: () => {
                if (isFetchingNextPage) {
                  return (
                    <div className="flex items-center justify-center py-4">
                      <LoaderIcon className="size-4 animate-spin" />
                    </div>
                  )
                }
                if (!hasNextPage && hashes.length > 0) {
                  return (
                    <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                      No more hashes to load
                    </div>
                  )
                }
                return null
              },
            }}
          />
        </div>
      )}
    </div>
  )
}
