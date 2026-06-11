import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force"
import { MarkerType, type Edge, type Node } from "@xyflow/react"
import type { TopoEdge, TopoNode, Topology } from "@/lib/topology/derive"

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
// settles between its two subnets. The simulation is pre-settled synchronously
// to a fixed tick count, so the first paint is already a finished map — but
// the simulation instance is returned alive (paused, alpha cooled) so the view
// can re-heat it on drag for Obsidian-style live physics (see use-simulation).
// d3-force is deterministic for a given node order (phyllotaxis seeding, LCG
// jiggle), so the map doesn't reshuffle between reloads of the same data.

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

// Leaf-subnets list node. Rows beyond the cap render as "+k more" (the full
// list lives in the tooltip), so the node — and its collision radius — stays
// bounded no matter how many tunnels a concentrator carries.
export const LEAF_SUBNET_MAX_ROWS = 6
const LEAF_CHAR_W = 6.8 // 11px monospace row text
const LEAF_EXTRA_W = 34 // px-3 padding + border + truncation slack
const LEAF_MIN_W = 170
const LEAF_ROW_H = 18.5 // 11px row + gap-0.5
const LEAF_FRAME_H = 40 // py-2 + border + header row

const SIMULATION_TICKS = 300
const LINK_SLACK = 60 // breathing room added to every link beyond node radii
const CHARGE_STRENGTH = -1200
const COLLIDE_PADDING = 16
const CENTERING_STRENGTH = 0.06 // weak pull keeps disconnected pieces nearby

// Shared look for the iface/route text riding on edges. SVG text doesn't
// inherit the page color — without an explicit themed fill it renders black,
// which vanishes against the dark theme's label pill.
const MONO_LABEL = {
  fontSize: 10,
  fontFamily: "monospace",
  fill: "var(--color-foreground)",
} as const

function subnetWidth(cidr: string, hostCount: number) {
  const label = `${cidr} · ${hostCount}`
  return Math.max(SUBNET_MIN_W, Math.ceil(label.length * SUBNET_CHAR_W) + SUBNET_EXTRA_W)
}

function leafSubnetsSize(entries: { cidr: string; iface: string }[]) {
  const longestRow = entries.reduce(
    (max, e) => Math.max(max, `${e.iface} · ${e.cidr}`.length),
    0,
  )
  const visibleRows =
    Math.min(entries.length, LEAF_SUBNET_MAX_ROWS) +
    (entries.length > LEAF_SUBNET_MAX_ROWS ? 1 : 0) // the "+k more" row
  return {
    width: Math.max(LEAF_MIN_W, Math.ceil(longestRow * LEAF_CHAR_W) + LEAF_EXTRA_W),
    height: LEAF_FRAME_H + Math.ceil(visibleRows * LEAF_ROW_H),
  }
}

function sizeOf(n: TopoNode): { width: number; height: number } {
  switch (n.kind) {
    case "host":
      return { width: HOST_W, height: HOST_H }
    case "subnet":
      return { width: subnetWidth(n.cidr, n.hostIds.length), height: SUBNET_H }
    case "leaf-subnets":
      return leafSubnetsSize(n.entries)
    case "phantom-gateway":
    case "phantom-subnet":
      return { width: PHANTOM_W, height: PHANTOM_H }
  }
}

// Half-diagonal of the node's rectangle — the radius that fully contains it,
// used for collision and link-length math.
function radiusOf(size: { width: number; height: number }) {
  return Math.hypot(size.width, size.height) / 2
}

function nodeData(n: TopoNode): Node["data"] {
  switch (n.kind) {
    case "host":
      return { host: n.host }
    case "subnet":
      return { cidr: n.cidr, hostCount: n.hostIds.length }
    case "phantom-gateway":
      return { ip: n.ip }
    case "phantom-subnet":
      return { cidr: n.cidr }
    case "leaf-subnets":
      return { entries: n.entries }
  }
}

function edgeOf(e: TopoEdge): Edge {
  const base = { id: e.id, source: e.source, target: e.target }
  switch (e.kind) {
    case "membership":
      return {
        ...base,
        label: e.iface ? `${e.iface} · ${e.ip}` : e.ip,
        style: { stroke: "var(--color-border)", strokeWidth: 1.5 },
        labelStyle: { ...MONO_LABEL, fill: "var(--color-muted-foreground)" },
      }
    case "membership-group":
      // Unlabeled on purpose: the iface/ip detail lives inside the
      // leaf-subnets node this edge points at.
      return {
        ...base,
        style: { stroke: "var(--color-border)", strokeWidth: 1.5 },
      }
    case "pivot":
      return {
        ...base,
        label: e.destLabel ?? undefined,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: !e.isDefault,
        style: {
          stroke: "var(--color-primary)",
          strokeWidth: 2,
          strokeDasharray: e.isDefault ? "6 4" : undefined,
        },
        labelStyle: MONO_LABEL,
      }
    case "pivot-unknown":
      return {
        ...base,
        label: e.destLabel ?? undefined,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke: "var(--color-amber-500, #f59e0b)",
          strokeWidth: 2,
          strokeDasharray: "6 4",
        },
        labelStyle: MONO_LABEL,
      }
    case "reaches":
      return {
        ...base,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke: "var(--color-sky-500, #0ea5e9)",
          strokeWidth: 1.5,
          strokeDasharray: "4 4",
        },
      }
  }
}

// width/height ride on the sim node so the live loop can convert the
// simulation's center coordinates to React Flow's top-left (and back) without
// a separate size lookup.
export type SimNode = SimulationNodeDatum & {
  id: string
  r: number
  width: number
  height: number
}

type TopologySimulation = Simulation<SimNode, SimulationLinkDatum<SimNode>>

type TopologyLayout = {
  nodes: Node[]
  edges: Edge[]
  simulation: TopologySimulation
  simNodeById: Map<string, SimNode>
}

export function layoutTopology(topology: Topology): TopologyLayout {
  const { nodes: topoNodes, edges: topoEdges } = topology

  const sizeById = new Map<string, { width: number; height: number }>()
  for (const n of topoNodes) {
    sizeById.set(n.id, sizeOf(n))
  }

  // --- force simulation -------------------------------------------------------
  const simNodes: SimNode[] = topoNodes.map((n) => {
    const size = sizeById.get(n.id)!
    return { id: n.id, r: radiusOf(size), ...size }
  })
  const simNodeById = new Map(simNodes.map((n) => [n.id, n]))

  const links: SimulationLinkDatum<SimNode>[] = topoEdges
    .filter((e) => e.source !== e.target)
    .map((e) => ({ source: e.source, target: e.target }))

  // Stopped immediately so d3's internal timer never runs on its own; the
  // synchronous ticks settle the layout for the first paint. The instance is
  // returned (not discarded) so drag interactions can re-heat it later.
  const simulation: TopologySimulation = forceSimulation(simNodes)
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

  simulation.tick(SIMULATION_TICKS)

  const nodeType: Record<TopoNode["kind"], string> = {
    host: "host",
    subnet: "subnet",
    "phantom-gateway": "phantomGateway",
    "phantom-subnet": "phantomSubnet",
    "leaf-subnets": "leafSubnets",
  }

  const rfNodes: Node[] = topoNodes.map((n) => {
    const size = sizeById.get(n.id)!
    const sim = simNodeById.get(n.id)!
    return {
      id: n.id,
      type: nodeType[n.kind],
      // Simulation positions are node centers; React Flow wants top-left.
      position: { x: (sim.x ?? 0) - size.width / 2, y: (sim.y ?? 0) - size.height / 2 },
      // The subnet pill is fully sized by the layout (rounded-full needs real
      // dimensions); the leaf list gets its width pinned (rows truncate
      // against it) but keeps natural height so rows can never be clipped by
      // an estimate. Other node types size themselves.
      style:
        n.kind === "subnet"
          ? { width: size.width, height: size.height }
          : n.kind === "leaf-subnets"
            ? { width: size.width }
            : undefined,
      data: nodeData(n),
      selectable: n.kind === "subnet" ? false : undefined,
    }
  })

  // --- edges -----------------------------------------------------------------
  const rfEdges: Edge[] = topoEdges.map(edgeOf)

  // All edges render as "floating": connection points follow the nodes as the
  // user drags them, instead of sticking to fixed left/right handles.
  return {
    nodes: rfNodes,
    edges: rfEdges.map((e) => ({ ...e, type: "floating" })),
    simulation,
    simNodeById,
  }
}
