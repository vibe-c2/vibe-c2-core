import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force"
import { MarkerType, type Edge, type Node } from "@xyflow/react"
import type { Topology } from "@/lib/topology/derive"

// Maps the framework-free topology model onto React Flow nodes/edges and lays
// it out. Subnet-as-node design: subnets are compact hub pills, hosts are
// cards, and EVERY interface is an explicit labeled edge from host to subnet.
// There is no containment — a multi-homed host connects to all of its subnets
// symmetrically, which is exactly the property that makes it a pivot, so no
// interface is privileged over another.
//
// Positioning is force-directed (d3-force), not hierarchical: the topology is
// a mesh of hubs and spokes, and a layered algorithm (dagre) funnels every
// edge through one corridor between rank columns, piling labels on top of
// each other. Forces instead pull linked nodes to a comfortable distance and
// push everything else apart, so hubs become stars and a dual-homed host
// settles between its two subnets. The simulation runs synchronously to a
// fixed tick count at layout time — the result is a static map (still
// draggable), not an animation. d3-force is deterministic for a given node
// order (phyllotaxis seeding, LCG jiggle), so the map doesn't reshuffle
// between reloads of the same data.

const HOST_W = 180
const HOST_H = 64
const SUBNET_H = 36
const PHANTOM_W = 160
const PHANTOM_H = 56

// Node dimensions must be known before render (collision radii, center →
// top-left conversion), so the pill width is estimated from its label —
// monospace CIDR + host count, padding, and the leading icon.
const SUBNET_CHAR_W = 7.5
const SUBNET_EXTRA_W = 64 // horizontal padding + icon + gaps
const SUBNET_MIN_W = 150

const SIMULATION_TICKS = 300
const LINK_SLACK = 60 // breathing room added to every link beyond node radii
const CHARGE_STRENGTH = -1200
const COLLIDE_PADDING = 16
const CENTERING_STRENGTH = 0.06 // weak pull keeps disconnected pieces nearby

// Shared look for the iface/route text riding on edges.
const MONO_LABEL = { fontSize: 10, fontFamily: "monospace" } as const

function subnetWidth(cidr: string, hostCount: number) {
  const label = `${cidr} · ${hostCount}`
  return Math.max(SUBNET_MIN_W, Math.ceil(label.length * SUBNET_CHAR_W) + SUBNET_EXTRA_W)
}

// Half-diagonal of the node's rectangle — the radius that fully contains it,
// used for collision and link-length math.
function radiusOf(size: { width: number; height: number }) {
  return Math.hypot(size.width, size.height) / 2
}

type SimNode = SimulationNodeDatum & { id: string; r: number }

type TopologyLayout = { nodes: Node[]; edges: Edge[] }

export function layoutTopology(topology: Topology): TopologyLayout {
  const { nodes: topoNodes, edges: topoEdges } = topology

  const sizeById = new Map<string, { width: number; height: number }>()
  for (const n of topoNodes) {
    sizeById.set(
      n.id,
      n.kind === "host"
        ? { width: HOST_W, height: HOST_H }
        : n.kind === "subnet"
          ? { width: subnetWidth(n.cidr, n.hostIds.length), height: SUBNET_H }
          : { width: PHANTOM_W, height: PHANTOM_H },
    )
  }

  // --- force simulation -------------------------------------------------------
  const simNodes: SimNode[] = topoNodes.map((n) => ({
    id: n.id,
    r: radiusOf(sizeById.get(n.id)!),
  }))
  const simNodeById = new Map(simNodes.map((n) => [n.id, n]))

  const links: SimulationLinkDatum<SimNode>[] = topoEdges
    .filter((e) => e.source !== e.target)
    .map((e) => ({ source: e.source, target: e.target }))

  forceSimulation(simNodes)
    .force(
      "link",
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
        .id((d) => d.id)
        .distance((l) => {
          const s = l.source as SimNode
          const t = l.target as SimNode
          return s.r + t.r + LINK_SLACK
        }),
    )
    .force("charge", forceManyBody().strength(CHARGE_STRENGTH))
    .force(
      "collide",
      forceCollide<SimNode>().radius((d) => d.r + COLLIDE_PADDING),
    )
    .force("x", forceX(0).strength(CENTERING_STRENGTH))
    .force("y", forceY(0).strength(CENTERING_STRENGTH))
    .stop()
    .tick(SIMULATION_TICKS)

  const nodeType: Record<string, string> = {
    host: "host",
    subnet: "subnet",
    "phantom-gateway": "phantomGateway",
    "phantom-subnet": "phantomSubnet",
  }

  const rfNodes: Node[] = topoNodes.map((n) => {
    const size = sizeById.get(n.id)!
    const sim = simNodeById.get(n.id)!
    const data: Node["data"] =
      n.kind === "host"
        ? { host: n.host }
        : n.kind === "subnet"
          ? { cidr: n.cidr, hostCount: n.hostIds.length }
          : n.kind === "phantom-gateway"
            ? { ip: n.ip }
            : { cidr: n.cidr }
    return {
      id: n.id,
      type: nodeType[n.kind],
      // Simulation positions are node centers; React Flow wants top-left.
      position: { x: (sim.x ?? 0) - size.width / 2, y: (sim.y ?? 0) - size.height / 2 },
      // The pill is sized by the layout (dimensions are needed up front), so
      // pass them through; other node types size themselves.
      style: n.kind === "subnet" ? { width: size.width, height: size.height } : undefined,
      data,
      selectable: n.kind === "subnet" ? false : undefined,
    }
  })

  // --- edges -----------------------------------------------------------------
  const rfEdges: Edge[] = []
  for (const e of topoEdges) {
    if (e.kind === "membership") {
      rfEdges.push({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.iface ? `${e.iface} · ${e.ip}` : e.ip,
        style: { stroke: "var(--color-border)", strokeWidth: 1.5 },
        labelStyle: { ...MONO_LABEL, fill: "var(--color-muted-foreground)" },
      })
    } else if (e.kind === "pivot") {
      rfEdges.push({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.destLabel ?? undefined,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: !e.isDefault,
        style: {
          stroke: "var(--color-primary)",
          strokeWidth: 2,
          strokeDasharray: e.isDefault ? "6 4" : undefined,
        },
        labelStyle: MONO_LABEL,
      })
    } else if (e.kind === "pivot-unknown") {
      rfEdges.push({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.destLabel ?? undefined,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke: "var(--color-amber-500, #f59e0b)",
          strokeWidth: 2,
          strokeDasharray: "6 4",
        },
        labelStyle: MONO_LABEL,
      })
    } else {
      // reaches
      rfEdges.push({
        id: e.id,
        source: e.source,
        target: e.target,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke: "var(--color-sky-500, #0ea5e9)",
          strokeWidth: 1.5,
          strokeDasharray: "4 4",
        },
      })
    }
  }

  // All edges render as "floating": connection points follow the nodes as the
  // user drags them, instead of sticking to fixed left/right handles.
  return { nodes: rfNodes, edges: rfEdges.map((e) => ({ ...e, type: "floating" })) }
}
