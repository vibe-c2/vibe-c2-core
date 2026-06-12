import { EllipsisIcon, PencilIcon, TrashIcon, UsersIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  VirtualizedDataTable,
  dataTableRowClass,
} from "@/components/ui/virtualized-data-table"
import { useAuthStore } from "@/stores/auth"
import { useUserStore } from "@/stores/users"
import { Permissions } from "@/constants/permissions"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import type { UserFieldsFragment } from "@/graphql/gql/graphql"

interface UsersTableProps {
  users: UserFieldsFragment[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
}

const GRID_COLS = "grid-cols-[2fr_1fr_1fr_1fr_48px]"
const GRID_COLS_NO_ACTIONS = "grid-cols-[2fr_1fr_1fr_1fr]"

export function UsersTable({
  users,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
}: UsersTableProps) {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const currentUserId = useAuthStore((s) => s.user?.userId)
  const { openEditDialog, openDeleteDialog } = useUserStore()

  const canUpdate = hasPermission(Permissions.USER_UPDATE)
  const canDelete = hasPermission(Permissions.USER_DELETE)
  const hasActions = canUpdate || canDelete
  const gridCols = hasActions ? GRID_COLS : GRID_COLS_NO_ACTIONS

  return (
    <VirtualizedDataTable
      items={users}
      isLoading={isLoading}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      gridCols={gridCols}
      entityNoun="users"
      header={
        <>
          <div>Username</div>
          <div>Roles</div>
          <div>Status</div>
          <div>Created</div>
          {hasActions && <div />}
        </>
      }
      emptyState={
        <>
          <UsersIcon className="size-8 opacity-50" />
          <p className="text-sm">No users found.</p>
        </>
      }
      renderRow={(user) => (
        <div className={dataTableRowClass(gridCols)}>
          <div className="font-medium truncate">{user.username}</div>
          <div className="flex gap-1">
            {user.roles.map((role) => (
              <Badge
                key={role}
                variant={role === "admin" ? "default" : "secondary"}
              >
                {role}
              </Badge>
            ))}
          </div>
          <div>
            <span className={`inline-flex items-center gap-1.5 text-sm ${user.active ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              <span className={`size-2 rounded-full ${user.active ? "bg-green-600 dark:bg-green-400" : "bg-red-600 dark:bg-red-400"}`} />
              {user.active ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            <FormattedDateTimeText date={user.createdAt} />
          </div>
          {hasActions && (
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon-sm" />}
                >
                  <EllipsisIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canUpdate && (
                    <DropdownMenuItem
                      onClick={() =>
                        openEditDialog({
                          id: user.id,
                          username: user.username,
                        })
                      }
                    >
                      <PencilIcon className="size-4" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && user.id !== currentUserId && (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() =>
                        openDeleteDialog({
                          id: user.id,
                          username: user.username,
                        })
                      }
                    >
                      <TrashIcon className="size-4" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      )}
    />
  )
}
