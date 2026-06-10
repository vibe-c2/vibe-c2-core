import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { HelpCircleIcon, RouteIcon, ServerIcon } from "lucide-react"
import { useHostStore } from "@/stores/hosts"
import type { HostFieldsFragment } from "@/graphql/gql/graphql"

// Custom React Flow nodes for the derived topology. Layout is left-to-right
// (see layout.ts), so edges enter on the left and leave on the right. The
// graph is derived and read-only, so handles exist only as edge anchors —
// they are invisible and non-connectable.

export type HostNodeData = { host: HostFieldsFragment }
export type SubnetNodeData = { cidr: string; hostCount: number }
export type PhantomGatewayNodeData = { ip: string }
export type PhantomSubnetNodeData = { cidr: string }

function Anchors() {
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!h-1 !w-1 !min-w-0 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="!h-1 !w-1 !min-w-0 !border-0 !bg-transparent"
      />
    </>
  )
}

// A single host. Clicking opens the existing edit dialog — the same entry
// point as a table row, so topology and table share one editing path.
export function HostNode({ data }: NodeProps<Node<HostNodeData>>) {
  const openEdit = useHostStore((s) => s.openEditDialog)
  const { host } = data
  const ips = [...new Set(host.interfaces.flatMap((i) => i.addresses))]

  return (
    <button
      type="button"
      onClick={() => openEdit(host)}
      className="flex w-[180px] flex-col gap-1 rounded-md border bg-card px-3 py-2 text-left shadow-sm transition-colors hover:border-primary/60 hover:bg-muted/50"
    >
      <Anchors />
      <div className="flex items-center gap-1.5">
        <ServerIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-xs font-medium" title={host.hostname}>
          {host.hostname}
        </span>
      </div>
      {host.os && (
        <span className="truncate text-[11px] text-muted-foreground" title={host.os}>
          {host.os}
        </span>
      )}
      <span className="truncate font-mono text-[11px] text-muted-foreground" title={ips.join("\n")}>
        {ips[0] ?? "—"}
        {ips.length > 1 && ` +${ips.length - 1}`}
      </span>
    </button>
  )
}

// Container for a subnet. Hosts are nested inside it as child nodes (positioned
// by layout.ts), so this renders only the chrome + header label.
export function SubnetNode({ data }: NodeProps<Node<SubnetNodeData>>) {
  return (
    <div className="h-full w-full rounded-lg border-2 border-dashed border-border/70 bg-muted/20">
      <Anchors />
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium">
        <span className="font-mono">{data.cidr}</span>
        <span className="text-muted-foreground">
          · {data.hostCount} host{data.hostCount === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  )
}

// A router referenced by a route's gateway that no known host owns — a lead to
// enumerate. Dashed + muted to read as "not yet confirmed".
export function PhantomGatewayNode({ data }: NodeProps<Node<PhantomGatewayNodeData>>) {
  return (
    <div
      className="flex w-[160px] flex-col gap-0.5 rounded-md border-2 border-dashed border-amber-500/50 bg-amber-500/5 px-3 py-2"
      title="Gateway referenced by a route but owned by no known host — enumerate it"
    >
      <Anchors />
      <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
        <HelpCircleIcon className="size-3.5 shrink-0" />
        <span className="text-[11px] font-medium">Unknown gateway</span>
      </div>
      <span className="font-mono text-xs">{data.ip}</span>
    </div>
  )
}

// A subnet reachable through a known pivot but with no known hosts — where to
// look next.
export function PhantomSubnetNode({ data }: NodeProps<Node<PhantomSubnetNodeData>>) {
  return (
    <div
      className="flex w-[160px] flex-col gap-0.5 rounded-md border-2 border-dashed border-sky-500/50 bg-sky-500/5 px-3 py-2"
      title="Reachable through a known pivot, but no hosts enumerated here yet"
    >
      <Anchors />
      <div className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
        <RouteIcon className="size-3.5 shrink-0" />
        <span className="text-[11px] font-medium">Unexplored subnet</span>
      </div>
      <span className="font-mono text-xs">{data.cidr}</span>
    </div>
  )
}
