import { useRef } from "react"
import { Virtuoso } from "react-virtuoso"
import { EllipsisIcon, LoaderIcon, PencilIcon, TrashIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthStore } from "@/stores/auth"
import { useUserStore } from "@/stores/users"
import { Permissions } from "@/constants/permissions"
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
  const containerRef = useRef<HTMLDivElement>(null)

  const canUpdate = hasPermission(Permissions.USER_UPDATE)
  const canDelete = hasPermission(Permissions.USER_DELETE)
  const hasActions = canUpdate || canDelete
  const gridCols = hasActions ? GRID_COLS : GRID_COLS_NO_ACTIONS

  const showEmpty = !isLoading && users.length === 0
  const showList = !isLoading && users.length > 0

  return (
    <div className="rounded-lg border bg-card flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Fixed header */}
      <div className="border-b bg-muted/50 shrink-0">
        <div className={`grid ${gridCols} gap-4 px-4 py-2 text-sm font-medium`}>
          <div>Username</div>
          <div>Roles</div>
          <div>Status</div>
          <div>Created</div>
          {hasActions && <div />}
        </div>
      </div>

      {/* Body */}
      {isLoading && (
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {showEmpty && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          No users found.
        </div>
      )}

      {showList && (
        <div className="flex flex-col flex-1 min-h-0" ref={containerRef}>
          <Virtuoso
            data={users}
            endReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage()
            }}
            overscan={200}
            style={{ height: "100%" }}
            className="flex-1 min-h-0"
            itemContent={(_index, user) => (
              <div
                className={`grid ${gridCols} gap-4 px-4 py-2 border-b hover:bg-muted/50 transition-colors items-center text-sm`}
              >
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
                  {new Date(user.createdAt).toLocaleDateString()}
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
            components={{
              Footer: () => {
                if (isFetchingNextPage) {
                  return (
                    <div className="flex items-center justify-center py-4">
                      <LoaderIcon className="size-4 animate-spin" />
                    </div>
                  )
                }
                if (!hasNextPage && users.length > 0) {
                  return (
                    <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                      No more users to load
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
