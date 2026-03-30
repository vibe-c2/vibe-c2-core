import { useMemo, useState } from "react"
import {
  useInfiniteAdminSessions,
  useSessionChangedSubscription,
} from "@/graphql/hooks/sessions"
import { AdminSessionsToolbar } from "./admin-sessions-toolbar"
import { AdminSessionsTable } from "./admin-sessions-table"
import { RevokeSessionDialog } from "./revoke-session-dialog"

export function AdminSessionsView() {
  const [search, setSearch] = useState("")
  const [activeOnly, setActiveOnly] = useState(false)

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteAdminSessions({
    search: search || null,
    activeOnly,
  })

  // Subscribe to real-time session changes
  useSessionChangedSubscription(null)

  const sessions = useMemo(
    () => data?.pages.flatMap((page) => page.sessions.edges.map((e) => e.node)) ?? [],
    [data],
  )

  return (
    <div className="flex flex-1 flex-col gap-2 min-h-0">
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
