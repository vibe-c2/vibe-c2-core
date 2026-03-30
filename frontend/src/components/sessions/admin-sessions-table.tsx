import { useRef } from "react"
import { Virtuoso } from "react-virtuoso"
import { LoaderIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { useSessionStore } from "@/stores/sessions"
import type { SessionFieldsFragment } from "@/graphql/gql/graphql"

interface AdminSessionsTableProps {
  sessions: SessionFieldsFragment[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
}

export function AdminSessionsTable({
  sessions,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
}: AdminSessionsTableProps) {
  const { openRevokeDialog } = useSessionStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const showEmpty = !isLoading && sessions.length === 0
  const showList = !isLoading && sessions.length > 0

  return (
    <div className="rounded-lg border bg-card flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="border-b bg-muted/50 shrink-0">
        <div className="grid grid-cols-[1fr_1.5fr_1fr_0.8fr_0.8fr_0.8fr_1fr_48px] gap-4 px-4 py-2 text-sm font-medium">
          <div>User</div>
          <div>Browser / OS</div>
          <div>IP Address</div>
          <div>Device</div>
          <div>Status</div>
          <div>Last Active</div>
          <div>Created</div>
          <div />
        </div>
      </div>

      {/* Body */}
      {isLoading && (
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {showEmpty && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          No sessions found.
        </div>
      )}

      {showList && (
        <div className="flex flex-col flex-1 min-h-0" ref={containerRef}>
          <Virtuoso
            data={sessions}
            endReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage()
            }}
            overscan={200}
            style={{ height: "100%" }}
            className="flex-1 min-h-0"
            itemContent={(_index, session) => {
              const isActive = session.status === "ACTIVE"
              const canRevoke = isActive && !session.isCurrent

              return (
                <div className="grid grid-cols-[1fr_1.5fr_1fr_0.8fr_0.8fr_0.8fr_1fr_48px] gap-4 px-4 py-2 border-b hover:bg-muted/50 transition-colors items-center text-sm">
                  <div className="font-medium truncate">{session.user?.username ?? "—"}</div>
                  <div className="truncate">
                    <div className="font-medium truncate">{session.browser || "Unknown"}</div>
                    <div className="text-xs text-muted-foreground truncate">{session.os}</div>
                  </div>
                  <div className="text-muted-foreground truncate">{session.ipAddress}</div>
                  <div className="text-muted-foreground">{session.device}</div>
                  <div>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <span className="size-1.5 rounded-full bg-green-600 dark:bg-green-400" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <FormattedDateTimeText date={session.lastActivityAt} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <FormattedDateTimeText date={session.createdAt} />
                  </div>
                  <div>
                    {canRevoke && (
                      <button
                        className="text-xs text-destructive hover:underline"
                        onClick={() => openRevokeDialog(session.id, true)}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              )
            }}
            components={{
              Footer: () => {
                if (isFetchingNextPage) {
                  return (
                    <div className="flex items-center justify-center py-4">
                      <LoaderIcon className="size-4 animate-spin" />
                    </div>
                  )
                }
                if (!hasNextPage && sessions.length > 0) {
                  return (
                    <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                      No more sessions to load
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
