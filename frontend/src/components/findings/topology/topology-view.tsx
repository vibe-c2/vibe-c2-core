import { useMemo } from "react"
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { NetworkIcon, TriangleAlertIcon } from "lucide-react"
import { MAX_TOPOLOGY_HOSTS, useAllHosts } from "@/graphql/hooks/hosts"
import { useHostStore } from "@/stores/hosts"
import {
  deriveTopology,
  type Topology,
  type TopologyStats,
} from "@/lib/topology/derive"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FloatingEdge } from "@/components/findings/topology/floating-edge"
import { useTopologySimulation } from "@/components/findings/topology/use-simulation"
import {
  HostNode,
  PhantomGatewayNode,
  PhantomSubnetNode,
  SubnetNode,
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
// Strips subnet hub nodes and their interface edges, leaving only host cards
// and route-derived elements (pivots, unknown gateways, unexplored subnets).
// A pure view filter — the underlying derivation is untouched.
function withoutSubnets(t: Topology): Topology {
  return {
    ...t,
    nodes: t.nodes.filter((n) => n.kind !== "subnet"),
    edges: t.edges.filter((e) => e.kind !== "membership"),
  }
}

export function TopologyView({ operationId }: TopologyViewProps) {
  const { data, isLoading, isError } = useAllHosts(operationId)
  // Persisted in the host store so the toggle survives reloads.
  const showSubnets = useHostStore((s) => s.showSubnets)
  const toggleSubnets = useHostStore((s) => s.toggleSubnets)

  const topology = useMemo(
    () => deriveTopology(data?.hosts ?? []),
    [data?.hosts],
  )
  const visibleTopology = useMemo(
    () => (showSubnets ? topology : withoutSubnets(topology)),
    [topology, showSubnets],
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
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            minZoom={0.1}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            edgesFocusable={false}
          >
            <Background gap={16} className="!bg-muted/20" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!bg-card" />
            <Legend stats={topology.stats} />
            <div className="absolute right-3 top-3 z-10">
              <Button
                variant={showSubnets ? "secondary" : "outline"}
                size="sm"
                className="h-7 gap-1.5 bg-card/90 text-xs shadow-sm backdrop-blur"
                onClick={toggleSubnets}
                title={
                  showSubnets
                    ? "Hide subnet nodes and interface edges"
                    : "Show subnet nodes and interface edges"
                }
              >
                <NetworkIcon className="size-3.5" />
                Subnets
              </Button>
            </div>
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

// Compact key + counts, top-left over the canvas. Counts double as a summary
// of what the operator has (and hasn't) mapped.
function Legend({ stats }: { stats: TopologyStats }) {
  return (
    <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-md border bg-card/90 px-3 py-2 text-[11px] shadow-sm backdrop-blur">
      <span className="font-medium">
        {stats.hosts} hosts · {stats.subnets} subnets
      </span>
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
