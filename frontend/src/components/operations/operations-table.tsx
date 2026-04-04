import { Virtuoso } from "react-virtuoso"
import { SwordsIcon, EllipsisIcon, LoaderIcon, PencilIcon, TrashIcon, UsersIcon } from "lucide-react"
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
import { useOperationStore } from "@/stores/operations"
import { useScopedOperationStore } from "@/stores/scoped-operation"
import { Permissions } from "@/constants/permissions"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import type { OperationFieldsFragment } from "@/graphql/gql/graphql"

interface OperationsTableProps {
  operations: OperationFieldsFragment[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
}

const GRID_COLS = "grid-cols-[40px_2fr_3fr_80px_1fr_48px]"
const GRID_COLS_NO_ACTIONS = "grid-cols-[40px_2fr_3fr_80px_1fr]"

export function OperationsTable({
  operations,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
}: OperationsTableProps) {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const currentUserId = useAuthStore((s) => s.user?.userId)
  const { openEditDialog, openDeleteDialog, openMembersDialog } = useOperationStore()
  const scopedOperation = useScopedOperationStore((s) => s.scopedOperation)
  const scopeOperation = useScopedOperationStore((s) => s.scopeOperation)
  const unscopeOperation = useScopedOperationStore((s) => s.unscopeOperation)

  const canDelete = hasPermission(Permissions.OPERATION_DELETE)
  const canManageMembers = hasPermission(Permissions.OPERATION_MEMBER)
  // Edit is allowed for app admins or operation admins (checked per-row)
  const isAppAdmin = hasPermission(Permissions.OPERATION_DELETE)
  const hasActions = isAppAdmin || canManageMembers
  const gridCols = hasActions ? GRID_COLS : GRID_COLS_NO_ACTIONS

  const showEmpty = !isLoading && operations.length === 0
  const showList = !isLoading && operations.length > 0

  // Check if the current user is an admin of the given operation
  function isOperationAdmin(op: OperationFieldsFragment) {
    return op.members.some(
      (m) => m.user.id === currentUserId && m.role === "ADMIN"
    )
  }

  return (
    <div className="rounded-lg border bg-card flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Fixed header */}
      <div className="border-b bg-muted/50 shrink-0">
        <div className={`grid ${gridCols} gap-4 px-4 py-2 text-sm font-medium`}>
          <div />
          <div>Name</div>
          <div>Description</div>
          <div>Members</div>
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
          No operations found.
        </div>
      )}

      {showList && (
        <div className="flex flex-col flex-1 min-h-0">
          <Virtuoso
            data={operations}
            endReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage()
            }}
            overscan={200}
            style={{ height: "100%" }}
            className="flex-1 min-h-0"
            itemContent={(_index, op) => {
              const canEdit = isAppAdmin || isOperationAdmin(op)

              const isScoped = scopedOperation?.id === op.id

              return (
                <div
                  className={`grid ${gridCols} gap-4 px-4 py-2 border-b hover:bg-muted/50 transition-colors items-center text-sm ${isScoped ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                >
                  <div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        isScoped
                          ? unscopeOperation()
                          : scopeOperation({ id: op.id, name: op.name, description: op.description })
                      }
                      className={isScoped ? "text-primary" : "text-muted-foreground"}
                      title={isScoped ? "Clear active operation" : "Set as active operation"}
                    >
                      <SwordsIcon className="size-4" />
                    </Button>
                  </div>
                  <div className="font-medium truncate">{op.name}</div>
                  <div className="truncate text-muted-foreground">
                    {op.description || "\u2014"}
                  </div>
                  <div>
                    <Badge variant="secondary">{op.members.length}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <FormattedDateTimeText date={op.createdAt} />
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
                          {canEdit && (
                            <DropdownMenuItem
                              onClick={() =>
                                openEditDialog({ id: op.id, name: op.name })
                              }
                            >
                              <PencilIcon className="size-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {canManageMembers && (
                            <DropdownMenuItem
                              onClick={() =>
                                openMembersDialog({ id: op.id, name: op.name })
                              }
                            >
                              <UsersIcon className="size-4" />
                              Members
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() =>
                                openDeleteDialog({ id: op.id, name: op.name })
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
                if (!hasNextPage && operations.length > 0) {
                  return (
                    <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                      No more operations to load
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
