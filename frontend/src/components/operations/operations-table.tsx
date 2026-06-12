import {
  SwordsIcon,
  EllipsisIcon,
  PencilIcon,
  TrashIcon,
  UsersIcon,
} from "lucide-react"
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
import { SortableHeader } from "@/components/ui/sortable-header"
import { useAuthStore } from "@/stores/auth"
import { useOperationStore, type OperationSort } from "@/stores/operations"
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
  // Active column sort + change handler. The parent owns the state (it also
  // feeds the list query); the table only renders the sortable headers.
  sort: OperationSort
  onSortChange: (sort: OperationSort) => void
}

const GRID_COLS = "grid-cols-[40px_2fr_3fr_80px_1fr_48px]"
const GRID_COLS_NO_ACTIONS = "grid-cols-[40px_2fr_3fr_80px_1fr]"

export function OperationsTable({
  operations,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  sort,
  onSortChange,
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

  // Check if the current user is an admin of the given operation
  function isOperationAdmin(op: OperationFieldsFragment) {
    return op.members.some(
      (m) => m.user.id === currentUserId && m.role === "ADMIN"
    )
  }

  return (
    <VirtualizedDataTable
      items={operations}
      isLoading={isLoading}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      gridCols={gridCols}
      entityNoun="operations"
      header={
        <>
          <div />
          <SortableHeader
            label="Name"
            field="NAME"
            sort={sort}
            onSortChange={onSortChange}
          />
          <div>Description</div>
          <div>Members</div>
          <SortableHeader
            label="Created"
            field="CREATED_AT"
            sort={sort}
            onSortChange={onSortChange}
            initialDirection="DESC"
          />
          {hasActions && <div />}
        </>
      }
      emptyState={
        <>
          <SwordsIcon className="size-8 opacity-50" />
          <p className="text-sm">No operations found.</p>
        </>
      }
      renderRow={(op) => {
        const canEdit = isAppAdmin || isOperationAdmin(op)

        const isScoped = scopedOperation?.id === op.id

        return (
          <div
            className={dataTableRowClass(
              gridCols,
              isScoped ? "bg-primary/5 border-l-2 border-l-primary" : undefined,
            )}
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
              {op.description || "—"}
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
    />
  )
}
