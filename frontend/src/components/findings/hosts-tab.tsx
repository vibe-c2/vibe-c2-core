import { useMemo } from "react"
import { NetworkIcon, PlusIcon, TableIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SearchInput } from "@/components/ui/search-input"
import { cn } from "@/lib/utils"
import {
  useInfiniteHosts,
  useHostChangedSubscription,
} from "@/graphql/hooks/hosts"
import { useHostStore, type HostView } from "@/stores/hosts"
import { HostsTable } from "@/components/findings/hosts-table"
import { TopologyView } from "@/components/findings/topology/topology-view"
import { HostFormDialog } from "@/components/findings/host-form-dialog"
import { DeleteHostDialog } from "@/components/findings/delete-host-dialog"

interface HostsTabProps {
  operationId: string
}

// Hosts are scoped-only — a cross-operation view would collide because
// different target networks reuse the same private IP ranges — so unlike
// HashesTab there is no scoped/global split and the tab takes the operation
// id directly. The toolbar is inlined too: with search as the only filter
// (no tags/statuses on hosts) a separate toolbar component would be a shell.
//
// Two views share this tab: the CRUD table and a derived network topology.
// Both keep the form/delete dialogs mounted so clicking a host node in the
// topology opens the same edit dialog as a table row.
export function HostsTab({ operationId }: HostsTabProps) {
  useHostChangedSubscription(operationId)

  const filters = useHostStore((s) => s.filters)
  const setSearch = useHostStore((s) => s.setSearch)
  const openCreate = useHostStore((s) => s.openCreateDialog)
  const view = useHostStore((s) => s.view)
  const setView = useHostStore((s) => s.setView)

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteHosts({
      operationId,
      search: filters.search.trim() || null,
    })

  const hosts = useMemo(
    () =>
      data?.pages.flatMap((page) => page.hosts.edges.map((e) => e.node)) ?? [],
    [data],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <ViewToggle view={view} onChange={setView} />
        {/* Search filters the table; the topology always derives from the whole
            operation (a filtered subset would produce false phantom nodes). */}
        {view === "table" && (
          <SearchInput
            value={filters.search}
            onValueChange={setSearch}
            placeholder="Search hostname, OS, or address..."
            className="relative w-full max-w-md"
          />
        )}
        <div className="ms-auto">
          <Button onClick={openCreate}>
            <PlusIcon className="size-4" />
            Add host
          </Button>
        </div>
      </div>

      {view === "table" ? (
        <HostsTable
          hosts={hosts}
          isLoading={isLoading}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          hasActiveSearch={filters.search.trim().length > 0}
        />
      ) : (
        <TopologyView operationId={operationId} />
      )}

      <HostFormDialog operationId={operationId} />
      <DeleteHostDialog />
    </div>
  )
}

// Small segmented control. A pair of buttons is plenty for two views — the
// Tabs primitive is for routed panels, not a Zustand-backed view switch.
function ViewToggle({
  view,
  onChange,
}: {
  view: HostView
  onChange: (v: HostView) => void
}) {
  return (
    <div className="inline-flex items-center rounded-md border bg-muted/40 p-0.5">
      <ToggleButton active={view === "table"} onClick={() => onChange("table")}>
        <TableIcon className="size-4" />
        Table
      </ToggleButton>
      <ToggleButton
        active={view === "topology"}
        onClick={() => onChange("topology")}
      >
        <NetworkIcon className="size-4" />
        Topology
      </ToggleButton>
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
