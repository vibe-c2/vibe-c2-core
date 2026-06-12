import { MonitorIcon } from "lucide-react"
import {
  VirtualizedDataTable,
  dataTableRowClass,
} from "@/components/ui/virtualized-data-table"
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

const GRID_COLS = "grid-cols-[1fr_1.5fr_1fr_0.8fr_0.8fr_0.8fr_1fr_48px]"

export function AdminSessionsTable({
  sessions,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
}: AdminSessionsTableProps) {
  const { openRevokeDialog } = useSessionStore()

  return (
    <VirtualizedDataTable
      items={sessions}
      isLoading={isLoading}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      gridCols={GRID_COLS}
      entityNoun="sessions"
      header={
        <>
          <div>User</div>
          <div>Browser / OS</div>
          <div>IP Address</div>
          <div>Device</div>
          <div>Status</div>
          <div>Last Active</div>
          <div>Created</div>
          <div />
        </>
      }
      emptyState={
        <>
          <MonitorIcon className="size-8 opacity-50" />
          <p className="text-sm">No sessions found.</p>
        </>
      }
      renderRow={(session) => {
        const isActive = session.status === "ACTIVE"
        const canRevoke = isActive && !session.isCurrent

        return (
          <div className={dataTableRowClass(GRID_COLS)}>
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
              {session.lastActivityAt ? (
                <FormattedDateTimeText date={session.lastActivityAt} />
              ) : (
                "—"
              )}
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
    />
  )
}
