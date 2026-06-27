import { BlocksIcon, EllipsisIcon, Trash2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { useAuthStore } from "@/stores/auth"
import { useModuleStore } from "@/stores/modules"
import { Permissions } from "@/constants/permissions"
import type { ModuleFieldsFragment } from "@/graphql/gql/graphql"

interface ModulesTableProps {
  modules: ModuleFieldsFragment[]
  isLoading: boolean
}

// Status pill colors. Registered is healthy/green, deregistered is a neutral
// "gone on purpose" amber, dead is a failure red.
function statusClasses(status: string): { dot: string; text: string } {
  switch (status) {
    case "registered":
      return {
        dot: "bg-green-600 dark:bg-green-400",
        text: "text-green-600 dark:text-green-400",
      }
    case "deregistered":
      return {
        dot: "bg-amber-600 dark:bg-amber-400",
        text: "text-amber-600 dark:text-amber-400",
      }
    case "dead":
    default:
      return {
        dot: "bg-red-600 dark:bg-red-400",
        text: "text-red-600 dark:text-red-400",
      }
  }
}

function StatusPill({ status }: { status: string }) {
  const c = statusClasses(status)
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${c.text}`}>
      <span className={`size-2 rounded-full ${c.dot}`} />
      {status}
    </span>
  )
}

export function ModulesTable({ modules, isLoading }: ModulesTableProps) {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const openRemoveDialog = useModuleStore((s) => s.openRemoveDialog)
  const canRemove = hasPermission(Permissions.MODULE_DELETE)

  if (!isLoading && modules.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
        <BlocksIcon className="size-8 opacity-50" />
        <p className="text-sm">No modules found.</p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Instance</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Health</TableHead>
          <TableHead>Last heartbeat</TableHead>
          <TableHead>Registered</TableHead>
          {canRemove && <TableHead className="w-12" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {modules.map((m) => {
          // Removal only makes sense for a live registration — the server
          // rejects deregistering an already-dead/deregistered instance.
          const isRegistered = m.status === "registered"
          return (
            <TableRow key={m.instance}>
              <TableCell className="font-medium">{m.instance}</TableCell>
              <TableCell>
                <Badge variant="secondary">{m.type}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {m.version || "—"}
              </TableCell>
              <TableCell>
                <StatusPill status={m.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {m.lastStatus || "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {m.lastHeartbeatAt ? (
                  <FormattedDateTimeText date={m.lastHeartbeatAt} />
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                <FormattedDateTimeText date={m.registeredAt} />
              </TableCell>
              {canRemove && (
                <TableCell>
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
                          openRemoveDialog({
                            instance: m.instance,
                            type: m.type,
                          })
                        }
                      >
                        <Trash2Icon className="size-4" />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
