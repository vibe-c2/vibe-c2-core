import { useState } from "react"
import {
  useInfiniteAdminSessions,
  useSessionChangedSubscription,
} from "@/graphql/hooks/sessions"
import { useConnectionNodes } from "@/hooks/use-connection-nodes"
import { AdminSessionsToolbar } from "./admin-sessions-toolbar"
import { AdminSessionsTable } from "./admin-sessions-table"
import { RevokeSessionDialog } from "./revoke-session-dialog"

export function AdminSessionsView() {
  const [search, setSearch] = useState("")
  const [activeOnly, setActiveOnly] = useState(false)

  const {
    data,
    isLoading,
    isError,
    error,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteAdminSessions({
    search: search || null,
    activeOnly,
  })

  // Subscribe to real-time session changes
  useSessionChangedSubscription(null)

  const sessions = useConnectionNodes(data, (p) => p.sessions)

  return (
    <div className="flex flex-1 flex-col gap-2 min-h-0">
      {isError && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load sessions"}
        </div>
      )}
      <AdminSessionsToolbar
        search={search}
        onSearchChange={setSearch}
        activeOnly={activeOnly}
        onActiveOnlyChange={setActiveOnly}
      />
      <AdminSessionsTable
        sessions={sessions}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
      />
      <RevokeSessionDialog />
    </div>
  )
}
