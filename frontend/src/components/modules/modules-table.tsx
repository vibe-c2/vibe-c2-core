import { BlocksIcon, EllipsisIcon, TrashIcon } from "lucide-react"
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
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { useAuthStore } from "@/stores/auth"
import { useModuleStore } from "@/stores/modules"
import { Permissions } from "@/constants/permissions"
import type { ModuleFieldsFragment } from "@/graphql/gql/graphql"

interface ModulesTableProps {
  modules: ModuleFieldsFragment[]
  isLoading: boolean
}

const GRID_COLS = "grid-cols-[1.5fr_1fr_90px_130px_1fr_1fr_1fr_48px]"
const GRID_COLS_NO_ACTIONS = "grid-cols-[1.5fr_1fr_90px_130px_1fr_1fr_1fr]"

// Status indicator follows the same dot-and-text idiom as the Users table's
// active/inactive cell. Registered is healthy/green, deregistered is a neutral
// "gone on purpose" amber, dead is a failure red.
const STATUS_STYLES: Record<string, { dot: string; text: string }> = {
  registered: {
    dot: "bg-green-600 dark:bg-green-400",
    text: "text-green-600 dark:text-green-400",
  },
  deregistered: {
    dot: "bg-amber-600 dark:bg-amber-400",
    text: "text-amber-600 dark:text-amber-400",
  },
  dead: {
    dot: "bg-red-600 dark:bg-red-400",
    text: "text-red-600 dark:text-red-400",
  },
}

function StatusIndicator({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.dead
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${s.text}`}>
      <span className={`size-2 rounded-full ${s.dot}`} />
      {status}
    </span>
  )
}

export function ModulesTable({ modules, isLoading }: ModulesTableProps) {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const openRemoveDialog = useModuleStore((s) => s.openRemoveDialog)

  const canRemove = hasPermission(Permissions.MODULE_DELETE)
  const gridCols = canRemove ? GRID_COLS : GRID_COLS_NO_ACTIONS

  return (
    <VirtualizedDataTable
      items={modules}
      isLoading={isLoading}
      // The module list is small and unpaginated — there is no next page.
      isFetchingNextPage={false}
      hasNextPage={false}
      fetchNextPage={() => {}}
      gridCols={gridCols}
      entityNoun="modules"
      header={
        <>
          <div>Instance</div>
          <div>Type</div>
          <div>Version</div>
          <div>Status</div>
          <div>Health</div>
          <div>Last heartbeat</div>
          <div>Registered</div>
          {canRemove && <div />}
        </>
      }
      emptyState={
        <>
          <BlocksIcon className="size-8 opacity-50" />
          <p className="text-sm">No modules found.</p>
        </>
      }
      renderRow={(m) => {
        // Removal only makes sense for a live registration — the server rejects
        // deregistering an already-dead/deregistered instance.
        const isRegistered = m.status === "registered"
        return (
          <div className={dataTableRowClass(gridCols)}>
            <div className="font-medium truncate">{m.instance}</div>
            <div>
              <Badge variant="secondary">{m.type}</Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              {m.version || "—"}
            </div>
            <div>
              <StatusIndicator status={m.status} />
            </div>
            <div className="text-sm text-muted-foreground truncate">
              {m.lastStatus || "—"}
            </div>
            <div className="text-sm text-muted-foreground">
              {m.lastHeartbeatAt ? (
                <FormattedDateTimeText date={m.lastHeartbeatAt} />
              ) : (
                "—"
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              <FormattedDateTimeText date={m.registeredAt} />
            </div>
            {canRemove && (
              <div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-sm" />}
                  >
                    <EllipsisIcon className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={!isRegistered}
                      onClick={() =>
                        openRemoveDialog({ instance: m.instance, type: m.type })
                      }
                    >
                      <TrashIcon className="size-4" />
                      Remove
                    </DropdownMenuItem>
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
