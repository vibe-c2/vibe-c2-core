import {
  MessageSquareIcon,
  CheckCircle2Icon,
  XCircleIcon,
  KeyIcon,
  LinkIcon,
  SwordsIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  VirtualizedDataTable,
  dataTableRowClass,
} from "@/components/ui/virtualized-data-table"
import { SortableHeader } from "@/components/ui/sortable-header"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { useCredentialStore, type CredentialSort } from "@/stores/credentials"
import { credentialTypeLabel } from "@/components/findings/credential-type-utils"
import { CredentialRowContextMenu } from "@/components/findings/credential-row-context-menu"
import type { CredentialFieldsFragment } from "@/graphql/gql/graphql"

// Rows may carry an optional `operation` (resolved by the global-mode query
// only). Scoped-mode queries return rows without this field.
export type CredentialRow = CredentialFieldsFragment & {
  operation?: { id: string; name: string }
}

interface CredentialsTableProps {
  credentials: CredentialRow[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  // Active column sort + change handler. The parent owns the state (it also
  // feeds the list query); the table only renders the sortable headers.
  sort: CredentialSort
  onSortChange: (sort: CredentialSort) => void
  // When true, the table renders an extra "Operation" column. Used by the
  // global Findings view; scoped views leave it off.
  showOperationColumn?: boolean
}

const GRID_COLS_SCOPED =
  "grid-cols-[32px_1.6fr_1fr_1.2fr_1.2fr_60px_1.4fr_60px_60px_140px]"
const GRID_COLS_GLOBAL =
  "grid-cols-[32px_1.6fr_1.2fr_1fr_1.2fr_1.2fr_60px_1.4fr_60px_60px_140px]"

export function CredentialsTable({
  credentials,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  sort,
  onSortChange,
  showOperationColumn = false,
}: CredentialsTableProps) {
  const openDetails = useCredentialStore((s) => s.openDetailsPanel)

  const gridCols = showOperationColumn ? GRID_COLS_GLOBAL : GRID_COLS_SCOPED

  return (
    <VirtualizedDataTable
      items={credentials}
      isLoading={isLoading}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      gridCols={gridCols}
      entityNoun="credentials"
      header={
        <>
          <div />
          <SortableHeader
            label="Name"
            field="NAME"
            sort={sort}
            onSortChange={onSortChange}
          />
          {showOperationColumn && <div>Operation</div>}
          <div>Type</div>
          <SortableHeader
            label="Username"
            field="USERNAME"
            sort={sort}
            onSortChange={onSortChange}
          />
          <div>Password</div>
          <div className="text-center" title="Keys">
            <KeyIcon className="mx-auto size-3.5" />
          </div>
          <div>Tags</div>
          <div className="text-center" title="Comments">
            <MessageSquareIcon className="mx-auto size-3.5" />
          </div>
          <div className="text-center" title="Backlinks (wiki references)">
            <LinkIcon className="mx-auto size-3.5" />
          </div>
          <SortableHeader
            label="Created"
            field="CREATED_AT"
            sort={sort}
            onSortChange={onSortChange}
            initialDirection="DESC"
          />
        </>
      }
      emptyState={
        <>
          <KeyIcon className="size-8 opacity-50" />
          <p className="text-sm">No credentials match these filters.</p>
        </>
      }
      renderRow={(cred) => (
        <CredentialRowContextMenu credential={cred}>
          <button
            type="button"
            onClick={() => openDetails({ id: cred.id, name: cred.name })}
            className={dataTableRowClass(gridCols, "cursor-pointer")}
          >
            <div title={cred.isValid ? "Valid" : "Invalid"}>
              {cred.isValid ? (
                <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <XCircleIcon className="size-4 text-muted-foreground/60" />
              )}
            </div>
            <div className="min-w-0 truncate font-medium" title={cred.name}>
              {cred.name}
            </div>
            {showOperationColumn && (
              <div
                className="flex min-w-0 items-center gap-1.5 text-muted-foreground"
                title={cred.operation?.name}
              >
                <SwordsIcon className="size-3.5 shrink-0" />
                <span className="truncate">{cred.operation?.name ?? "—"}</span>
              </div>
            )}
            <div>
              <Badge variant="outline">{credentialTypeLabel(cred.type)}</Badge>
            </div>
            <div className="truncate text-muted-foreground">
              {cred.username || "—"}
            </div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {cred.password || "—"}
            </div>
            <KeysCountCell count={cred.keys.length} />
            <div className="flex flex-wrap gap-1 overflow-hidden">
              {cred.tags.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                cred.tags.slice(0, 4).map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))
              )}
              {cred.tags.length > 4 && (
                <Badge variant="ghost">+{cred.tags.length - 4}</Badge>
              )}
            </div>
            <div className="text-center text-muted-foreground">
              {cred.comments.length || "—"}
            </div>
            <BacklinkCountCell count={cred.backlinkCount} />
            <div className="text-muted-foreground">
              <FormattedDateTimeText date={cred.createdAt} />
            </div>
          </button>
        </CredentialRowContextMenu>
      )}
    />
  )
}

function KeysCountCell({ count }: { count: number }) {
  if (count === 0) {
    return <div className="text-center text-muted-foreground">—</div>
  }
  return (
    <div className="flex justify-center">
      <Badge variant="default" className="px-1.5 tabular-nums">
        {count}
      </Badge>
    </div>
  )
}

// Mirrors KeysCountCell but uses a subdued variant so the visual weight
// matches Comments (which renders a muted number, not a badge). The full
// list opens in the credential details dialog — the table cell is a hint,
// not an interactive target.
function BacklinkCountCell({ count }: { count: number }) {
  if (count === 0) {
    return <div className="text-center text-muted-foreground">—</div>
  }
  return (
    <div
      className="text-center tabular-nums text-muted-foreground"
      title={`${count} wiki reference${count === 1 ? "" : "s"}`}
    >
      {count}
    </div>
  )
}
