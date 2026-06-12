import { HashIcon, KeyIcon, SwordsIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  VirtualizedDataTable,
  dataTableRowClass,
} from "@/components/ui/virtualized-data-table"
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

const GRID_COLS_SCOPED = "grid-cols-[110px_2fr_1.5fr_60px_1fr_140px]"
const GRID_COLS_GLOBAL = "grid-cols-[110px_2fr_1fr_1.5fr_60px_1fr_140px]"

export function HashesTable({
  hashes,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  showOperationColumn = false,
}: HashesTableProps) {
  const openDetails = useHashStore((s) => s.openDetailsPanel)

  const gridCols = showOperationColumn ? GRID_COLS_GLOBAL : GRID_COLS_SCOPED

  return (
    <VirtualizedDataTable
      items={hashes}
      isLoading={isLoading}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      gridCols={gridCols}
      entityNoun="hashes"
      header={
        <>
          <div>Status</div>
          <div>Value</div>
          {showOperationColumn && <div>Operation</div>}
          <div>Comment</div>
          <div className="text-center" title="Cracked credential">
            <KeyIcon className="mx-auto size-3.5" />
          </div>
          <div>Tags</div>
          <div>Created</div>
        </>
      }
      emptyState={
        <>
          <HashIcon className="size-8 opacity-50" />
          <p className="text-sm">No hashes match these filters.</p>
        </>
      }
      renderRow={(h) => (
        <HashRowContextMenu hash={h}>
          <button
            type="button"
            onClick={() =>
              openDetails({
                id: h.id,
                label: truncateHashValue(h.value),
              })
            }
            className={dataTableRowClass(gridCols, "cursor-pointer")}
          >
            <div>
              <Badge
                variant="outline"
                className={hashStatusBadgeClass(h.status)}
              >
                {hashStatusLabel(h.status)}
              </Badge>
            </div>
            <div className="truncate font-mono text-xs" title={h.value}>
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
            <div className="truncate text-muted-foreground" title={h.comment}>
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
    />
  )
}
