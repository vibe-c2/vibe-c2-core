import { Virtuoso } from "react-virtuoso"
import {
  LoaderIcon,
  MessageSquareIcon,
  CheckCircle2Icon,
  XCircleIcon,
  KeyIcon,
  LinkIcon,
  SwordsIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { useCredentialStore } from "@/stores/credentials"
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
  showOperationColumn = false,
}: CredentialsTableProps) {
  const openDetails = useCredentialStore((s) => s.openDetailsPanel)

  const showEmpty = !isLoading && credentials.length === 0
  const showList = !isLoading && credentials.length > 0
  const gridCols = showOperationColumn ? GRID_COLS_GLOBAL : GRID_COLS_SCOPED

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="shrink-0 border-b bg-muted/50">
        <div
          className={`grid ${gridCols} gap-3 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide`}
        >
          <div />
          <div>Name</div>
          {showOperationColumn && <div>Operation</div>}
          <div>Type</div>
          <div>Username</div>
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
          <KeyIcon className="size-8 opacity-50" />
          <p className="text-sm">No credentials match these filters.</p>
        </div>
      )}

      {showList && (
        <div className="flex min-h-0 flex-1 flex-col">
          <Virtuoso
            data={credentials}
            endReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage()
            }}
            overscan={200}
            style={{ height: "100%" }}
            className="min-h-0 flex-1"
            itemContent={(_index, cred) => (
              <CredentialRowContextMenu credential={cred}>
                <button
                  type="button"
                  onClick={() => openDetails({ id: cred.id, name: cred.name })}
                  className={`grid ${gridCols} w-full cursor-pointer items-center gap-3 border-b px-4 py-2 text-left text-sm transition-colors hover:bg-muted/50`}
                >
                  <div title={cred.isValid ? "Valid" : "Invalid"}>
                    {cred.isValid ? (
                      <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircleIcon className="size-4 text-muted-foreground/60" />
                    )}
                  </div>
                  <div
                    className="min-w-0 truncate font-medium"
                    title={cred.name}
                  >
                    {cred.name}
                  </div>
                  {showOperationColumn && (
                    <div
                      className="flex min-w-0 items-center gap-1.5 text-muted-foreground"
                      title={cred.operation?.name}
                    >
                      <SwordsIcon className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {cred.operation?.name ?? "—"}
                      </span>
                    </div>
                  )}
                  <div>
                    <Badge variant="outline">
                      {credentialTypeLabel(cred.type)}
                    </Badge>
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
            components={{
              Footer: () => {
                if (isFetchingNextPage) {
                  return (
                    <div className="flex items-center justify-center py-4">
                      <LoaderIcon className="size-4 animate-spin" />
                    </div>
                  )
                }
                if (!hasNextPage && credentials.length > 0) {
                  return (
                    <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                      No more credentials to load
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
