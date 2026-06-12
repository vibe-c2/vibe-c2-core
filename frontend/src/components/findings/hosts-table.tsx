import type { ReactNode } from "react"
import { toast } from "sonner"
import {
  CopyIcon,
  NetworkIcon,
  PencilIcon,
  RouteIcon,
  ServerIcon,
  TrashIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { HostIcon } from "@/components/findings/host-icon"
import {
  VirtualizedDataTable,
  dataTableRowClass,
} from "@/components/ui/virtualized-data-table"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useHostStore } from "@/stores/hosts"
import type { HostFieldsFragment } from "@/graphql/gql/graphql"

interface HostsTableProps {
  hosts: HostFieldsFragment[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  // Distinguishes "your search matched nothing" from "this operation has no
  // hosts yet" — the latter should nudge towards the Add button instead.
  hasActiveSearch: boolean
}

// The Hosts tab is scoped-only, so there is no Operation column variant.
const GRID_COLS = "grid-cols-[2fr_1.5fr_2.5fr_70px_70px_140px]"

// Cap inline IP badges so a many-homed host can't blow up the row height;
// the full list lives in the cell's title tooltip.
const MAX_INLINE_IPS = 3

export function HostsTable({
  hosts,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  hasActiveSearch,
}: HostsTableProps) {
  const openEdit = useHostStore((s) => s.openEditDialog)

  return (
    <VirtualizedDataTable
      items={hosts}
      isLoading={isLoading}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      gridCols={GRID_COLS}
      entityNoun="hosts"
      header={
        <>
          <div>Hostname</div>
          <div>OS</div>
          <div>IP addresses</div>
          <div className="text-center" title="Interfaces">
            <NetworkIcon className="mx-auto size-3.5" />
          </div>
          <div className="text-center" title="Routes">
            <RouteIcon className="mx-auto size-3.5" />
          </div>
          <div>Created</div>
        </>
      }
      emptyState={
        <>
          <ServerIcon className="size-8 opacity-50" />
          <p className="text-sm">
            {hasActiveSearch
              ? "No hosts match this search."
              : "No hosts yet. Add the first discovered machine."}
          </p>
        </>
      }
      renderRow={(h) => {
        const ips = hostAddresses(h)
        return (
          <HostRowContextMenu host={h}>
            <button
              type="button"
              onClick={() => openEdit(h)}
              className={dataTableRowClass(GRID_COLS, "cursor-pointer")}
            >
              <div
                className="flex min-w-0 items-center gap-1.5"
                title={h.hostname}
              >
                <HostIcon
                  emoji={h.emoji}
                  icon={h.icon}
                  color={h.color}
                  os={h.os}
                  size={14}
                  className="text-muted-foreground"
                />
                <span className="truncate font-mono text-xs">
                  {h.hostname}
                </span>
              </div>
              <div className="truncate text-muted-foreground" title={h.os}>
                {h.os || "—"}
              </div>
              <div
                className="flex flex-wrap gap-1 overflow-hidden"
                title={ips.join("\n")}
              >
                {ips.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  ips.slice(0, MAX_INLINE_IPS).map((ip) => (
                    <Badge key={ip} variant="secondary" className="font-mono">
                      {ip}
                    </Badge>
                  ))
                )}
                {ips.length > MAX_INLINE_IPS && (
                  <Badge variant="ghost">+{ips.length - MAX_INLINE_IPS}</Badge>
                )}
              </div>
              <div className="text-center text-muted-foreground">
                {h.interfaces.length || "—"}
              </div>
              <div className="text-center text-muted-foreground">
                {h.routes.length || "—"}
              </div>
              <div className="text-muted-foreground">
                <FormattedDateTimeText date={h.createdAt} />
              </div>
            </button>
          </HostRowContextMenu>
        )
      }}
    />
  )
}

// All addresses across every interface, deduplicated (a CIDR can legitimately
// repeat across interfaces — e.g. re-imported data — and duplicate badge keys
// would crash the row).
function hostAddresses(h: HostFieldsFragment): string[] {
  return [...new Set(h.interfaces.flatMap((i) => i.addresses))]
}

// Right-click menu for a hosts row. Local to the table — only four flat
// items, nothing else consumes it (unlike HashRowContextMenu, which the wiki
// hash chip reuses).
function HostRowContextMenu({
  host,
  children,
}: {
  host: HostFieldsFragment
  children: ReactNode
}) {
  const openEdit = useHostStore((s) => s.openEditDialog)
  const openDelete = useHostStore((s) => s.openDeleteDialog)

  async function copy(text: string, label: string) {
    if (!text) {
      toast.info(`No ${label} to copy`)
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`Copied ${label}`)
    } catch {
      toast.error(`Failed to copy ${label}`)
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => copy(host.hostname, "hostname")}>
          <CopyIcon className="size-4" />
          Copy hostname
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => copy(hostAddresses(host).join("\n"), "IP addresses")}
        >
          <CopyIcon className="size-4" />
          Copy IP addresses
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => openEdit(host)}>
          <PencilIcon className="size-4" />
          Edit
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" onClick={() => openDelete(host)}>
          <TrashIcon className="size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
