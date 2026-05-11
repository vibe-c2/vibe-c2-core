import { Virtuoso } from "react-virtuoso"
import {
  EllipsisIcon,
  LoaderIcon,
  PencilIcon,
  TrashIcon,
  MessageSquareIcon,
  CheckCircle2Icon,
  XCircleIcon,
  KeyIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { useCredentialStore } from "@/stores/credentials"
import { credentialTypeLabel } from "@/components/findings/credential-type-utils"
import type { CredentialFieldsFragment } from "@/graphql/gql/graphql"

interface CredentialsTableProps {
  credentials: CredentialFieldsFragment[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
}

const GRID_COLS =
  "grid-cols-[32px_2fr_1fr_1.5fr_2fr_60px_140px_48px]"

export function CredentialsTable({
  credentials,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
}: CredentialsTableProps) {
  const openEdit = useCredentialStore((s) => s.openEditDialog)
  const openDelete = useCredentialStore((s) => s.openDeleteDialog)
  const openDetails = useCredentialStore((s) => s.openDetailsPanel)

  const showEmpty = !isLoading && credentials.length === 0
  const showList = !isLoading && credentials.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="shrink-0 border-b bg-muted/50">
        <div
          className={`grid ${GRID_COLS} gap-3 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide`}
        >
          <div />
          <div>Name</div>
          <div>Type</div>
          <div>Username</div>
          <div>Tags</div>
          <div className="text-center" title="Comments">
            <MessageSquareIcon className="mx-auto size-3.5" />
          </div>
          <div>Created</div>
          <div />
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
              <button
                type="button"
                onClick={() => openDetails({ id: cred.id, name: cred.name })}
                className={`grid ${GRID_COLS} w-full cursor-pointer items-center gap-3 border-b px-4 py-2 text-left text-sm transition-colors hover:bg-muted/50`}
              >
                <div title={cred.isValid ? "Valid" : "Invalid"}>
                  {cred.isValid ? (
                    <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <XCircleIcon className="size-4 text-muted-foreground/60" />
                  )}
                </div>
                <div className="truncate font-medium">{cred.name}</div>
                <div>
                  <Badge variant="outline">
                    {credentialTypeLabel(cred.type)}
                  </Badge>
                </div>
                <div className="truncate text-muted-foreground">
                  {cred.username || "—"}
                </div>
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
                <div className="text-muted-foreground">
                  <FormattedDateTimeText date={cred.createdAt} />
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" />}
                    >
                      <EllipsisIcon className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          openEdit({ id: cred.id, name: cred.name })
                        }
                      >
                        <PencilIcon className="size-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() =>
                          openDelete({ id: cred.id, name: cred.name })
                        }
                      >
                        <TrashIcon className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </button>
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
