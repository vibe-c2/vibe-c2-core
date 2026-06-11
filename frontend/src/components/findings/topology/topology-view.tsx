import { useCallback, useMemo } from "react"
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { NetworkIcon, RouteIcon, TriangleAlertIcon } from "lucide-react"
import { MAX_TOPOLOGY_HOSTS, useAllHosts } from "@/graphql/hooks/hosts"
import { useHostStore, type TopologyRelation } from "@/stores/hosts"
import {
  deriveTopology,
  type Topology,
  type TopologyStats,
} from "@/lib/topology/derive"
import { collapseLeafSubnets } from "@/lib/topology/aggregate"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FloatingEdge } from "@/components/findings/topology/floating-edge"
import { useTopologySimulation } from "@/components/findings/topology/use-simulation"
import { useTopologyEmphasis } from "@/components/findings/topology/use-emphasis"
import { TopologySearch } from "@/components/findings/topology/topology-search"
import {
  HostNode,
  LeafSubnetsNode,
  PhantomGatewayNode,
  PhantomSubnetNode,
  SubnetNode,
  type HostNodeData,
} from "@/components/findings/topology/topology-nodes"

// Defined here (not in topology-nodes.tsx) so that file can stay a pure
// component module — exporting this const alongside components trips the
// fast-refresh lint rule. Stable identity outside the component so React Flow
// doesn't see a new object each render.
const nodeTypes = {
  host: HostNode,
  subnet: SubnetNode,
  phantomGateway: PhantomGatewayNode,
  phantomSubnet: PhantomSubnetNode,
  leafSubnets: LeafSubnetsNode,
}

const edgeTypes = {
  floating: FloatingEdge,
}

interface TopologyViewProps {
  operationId: string
}

// The Hosts tab's second view: a network map derived entirely from the
// operation's host data (no manual editing). Fetches ALL hosts (not the
// paginated list), derives the graph, lays it out, and renders it read-only.
//
// The graph is built from exactly ONE relation type at a time. Routes and
// subnet membership are different semantics (L3 "routes through" vs L2 "sits
// on segment"); overlaying both turned real operations into a hairball. Both
// lenses are pure view filters — the underlying derivation is untouched.

const lenses: Record<TopologyRelation, (t: Topology) => Topology> = {
  // Host cards + route-derived elements (pivots, unknown gateways, unexplored
  // subnets). Subnet hubs and their interface edges are stripped.
  routes: (t) => ({
    ...t,
    nodes: t.nodes.filter((n) => n.kind !== "subnet"),
    edges: t.edges.filter((e) => e.kind !== "membership"),
  }),
  // Host cards + subnet hubs + interface edges. Route-derived elements are
  // stripped — phantom gateways/subnets only exist because of routes, so
  // keeping them would smuggle the second relation back in. Single-host
  // subnets then fold into one list node per host (the VPN-concentrator
  // case: ten tun networks orbiting one card said nothing).
  subnets: (t) =>
    collapseLeafSubnets({
      ...t,
      nodes: t.nodes.filter((n) => n.kind === "host" || n.kind === "subnet"),
      edges: t.edges.filter((e) => e.kind === "membership"),
    }),
}

export function TopologyView({ operationId }: TopologyViewProps) {
  const { data, isLoading, isError } = useAllHosts(operationId)
  // Persisted in the host store so the choice survives reloads.
  const relation = useHostStore((s) => s.topologyRelation)
  const setRelation = useHostStore((s) => s.setTopologyRelation)
  const openEditDialog = useHostStore((s) => s.openEditDialog)

  const topology = useMemo(
    () => deriveTopology(data?.hosts ?? []),
    [data?.hosts],
  )
  const visibleTopology = useMemo(
    () => lenses[relation](topology),
    [topology, relation],
  )

  // Live force-directed layout: pre-settled for first paint, re-heated while
  // a node is dragged so neighbors follow. Positions are session-only: any
  // data change rebuilds the simulation and resets them.
  const {
    nodes,
    edges,
    onNodesChange,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  } = useTopologySimulation(visibleTopology)

  // Click-to-focus + search emphasis: dims/rings layered over the simulation
  // output. See use-emphasis.ts for the interaction rules.
  const { displayNodes, displayEdges, toggleFocus, clearEmphasis, search } =
    useTopologyEmphasis(visibleTopology, nodes, edges)

  // Click = focus (toggle on re-click); double-click a host = edit dialog,
  // the same entry point as a table row, so topology and table share one
  // editing path.
  const onNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => toggleFocus(node.id),
    [toggleFocus],
  )

  const onNodeDoubleClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      if (node.type === "host") openEditDialog((node.data as HostNodeData).host)
    },
    [openEditDialog],
  )

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg border bg-card p-4">
        <Skeleton className="h-full w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <Centered>
        <TriangleAlertIcon className="size-8 text-destructive opacity-70" />
        <p className="text-sm">Couldn’t load the topology. Try again.</p>
      </Centered>
    )
  }

  if (topology.stats.hosts === 0) {
    return (
      <Centered>
        <NetworkIcon className="size-8 opacity-50" />
        <p className="text-sm">
          No hosts yet — add hosts in the table to build the network map.
        </p>
      </Centered>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
      {data?.truncated && (
        <div className="flex items-center gap-2 border-b bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlertIcon className="size-3.5 shrink-0" />
          Showing the first {MAX_TOPOLOGY_HOSTS} hosts — the map may be
          incomplete.
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onPaneClick={clearEmphasis}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            minZoom={0.1}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            edgesFocusable={false}
            // Double-click is "edit host", not "zoom in".
            zoomOnDoubleClick={false}
            // Clicking now selects nodes routinely (click = focus), and React
            // Flow's default Backspace would visually delete the selection
            // from this read-only derived view.
            deleteKeyCode={null}
          >
            <Background gap={16} className="!bg-muted/20" />
            <Controls showInteractive={false} />
            {/* Colors come from the --xy-minimap-* mappings in index.css. */}
            <MiniMap pannable zoomable />
            <Legend stats={topology.stats} relation={relation} />
            <RelationPicker relation={relation} onChange={setRelation} />
            <TopologySearch {...search} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-lg border bg-card text-muted-foreground">
      {children}
    </div>
  )
}

// One entry per relation the picker offers; the lens table above must have a
// matching key (TypeScript enforces both via TopologyRelation).
const relationOptions: {
  value: TopologyRelation
  label: string
  Icon: typeof RouteIcon
  title: string
}[] = [
  {
    value: "routes",
    label: "Routes",
    Icon: RouteIcon,
    title: "Build the map from routes — who pivots through whom",
  },
  {
    value: "subnets",
    label: "Subnets",
    Icon: NetworkIcon,
    title: "Build the map from subnet membership — who shares a segment",
  },
]

// Top-right selector for the relation the graph is built from. Mutually
// exclusive by design — see the lens comments above.
function RelationPicker({
  relation,
  onChange,
}: {
  relation: TopologyRelation
  onChange: (relation: TopologyRelation) => void
}) {
  return (
    <div className="absolute right-3 top-3 z-10 flex overflow-hidden rounded-md border bg-card/90 shadow-sm backdrop-blur">
      {relationOptions.map(({ value, label, Icon, title }) => (
        <Button
          key={value}
          variant={relation === value ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1.5 rounded-none text-xs"
          onClick={() => onChange(value)}
          aria-pressed={relation === value}
          title={title}
        >
          <Icon className="size-3.5" />
          {label}
        </Button>
      ))}
    </div>
  )
}

// Compact key + counts, top-left over the canvas. Counts double as a summary
// of what the operator has (and hasn't) mapped. Only rows that exist in the
// current lens are shown — pivot/phantom counts are meaningless on the
// subnets lens and vice versa.
function Legend({
  stats,
  relation,
}: {
  stats: TopologyStats
  relation: TopologyRelation
}) {
  return (
    <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-md border bg-card/90 px-3 py-2 text-[11px] shadow-sm backdrop-blur">
      {relation === "subnets" ? (
        <span className="font-medium">
          {stats.hosts} hosts · {stats.subnets} subnets
        </span>
      ) : (
        <>
          <span className="font-medium">{stats.hosts} hosts</span>
          <LegendRow color="bg-primary" label={`${stats.pivots} pivots`} />
          {stats.phantomGateways > 0 && (
            <LegendRow
              color="bg-amber-500"
              label={`${stats.phantomGateways} unknown gateway${stats.phantomGateways === 1 ? "" : "s"}`}
            />
          )}
          {stats.phantomSubnets > 0 && (
            <LegendRow
              color="bg-sky-500"
              label={`${stats.phantomSubnets} unexplored subnet${stats.phantomSubnets === 1 ? "" : "s"}`}
            />
          )}
        </>
      )}
    </div>
  )
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className={`size-2 rounded-full ${color}`} />
      {label}
    </span>
  )
}
