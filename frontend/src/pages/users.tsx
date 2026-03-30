import { useMemo } from "react"
import { useInfiniteUsers, useUserChangedSubscription } from "@/graphql/hooks/users"
import { useUserStore } from "@/stores/users"
import { useAuthStore } from "@/stores/auth"
import { Permissions } from "@/constants/permissions"
import { UsersToolbar } from "@/components/users/users-toolbar"
import { UsersTable } from "@/components/users/users-table"
import { CreateUserDialog } from "@/components/users/create-user-dialog"
import { EditUserDialog } from "@/components/users/edit-user-dialog"
import { DeleteUserDialog } from "@/components/users/delete-user-dialog"
import { AdminSessionsView } from "@/components/sessions/admin-sessions-view"

export function UsersPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const canViewSessions = hasPermission(Permissions.SESSION_READ)
  const activeTab = useUserStore((s) => s.activeTab)
  const setActiveTab = useUserStore((s) => s.setActiveTab)

  // Subscribe to real-time user changes via SSE.
  // When another admin creates/updates/deletes a user, the query cache is
  // invalidated and the table below refetches automatically.
  useUserChangedSubscription()

  const search = useUserStore((s) => s.search)
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteUsers({ search: search || null })

  const users = useMemo(
    () => data?.pages.flatMap((page) => page.users.edges.map((e) => e.node)) ?? [],
    [data],
  )

  return (
    <div className="flex flex-1 flex-col gap-2 p-2">
      {/* Tab switcher (only show if admin has session:read permission) */}
      {canViewSessions && (
        <div className="flex gap-1 border-b pb-1">
          <button
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "users"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            onClick={() => setActiveTab("users")}
          >
            Users
          </button>
          <button
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "sessions"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            onClick={() => setActiveTab("sessions")}
          >
            Sessions
          </button>
        </div>
      )}

      {activeTab === "users" && (
        <>
          <UsersToolbar />
          <UsersTable
            users={users}
            isLoading={isLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            fetchNextPage={fetchNextPage}
          />
          <CreateUserDialog />
          <EditUserDialog />
          <DeleteUserDialog />
        </>
      )}

      {activeTab === "sessions" && canViewSessions && (
        <AdminSessionsView />
      )}
    </div>
  )
}
