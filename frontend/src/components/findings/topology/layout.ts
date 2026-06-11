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
import type { Topology } from "@/lib/topology/derive"
import {
  connectedComponents,
  packComponentAnchors,
  type Anchor,
} from "@/lib/topology/components"

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

const SIMULATION_TICKS = 300
const LINK_SLACK = 60 // breathing room added to every link beyond node radii
const CHARGE_STRENGTH = -1200
// Cap the charge's reach to roughly one island's span. Without this, repulsion
// is all-pairs: dragging one island shifts the force field every other island
// sits in, so they jiggle. Bounding it keeps repulsion local to a cluster.
const CHARGE_DISTANCE_MAX = 500
const COLLIDE_PADDING = 16
// Each connected component is pulled toward its own grid slot (not a shared
// origin), so islands are positionally independent. Weak enough that links and
// charge still shape the island; strong enough to hold it in its slot.
const CENTERING_STRENGTH = 0.06
// Spacing between island slots. Must be >= CHARGE_DISTANCE_MAX so neighboring
// islands fall outside each other's repulsion range — this is what actually
// decouples a dragged island from the rest.
const INTER_ISLAND_GAP = CHARGE_DISTANCE_MAX

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

// width/height ride on the sim node so the live loop can convert the
// simulation's center coordinates to React Flow's top-left (and back) without
// a separate size lookup.
export type SimNode = SimulationNodeDatum & {
  id: string
  r: number
  width: number
  height: number
}

// Deterministic phyllotaxis offset used to seed nodes around their slot — no
// Math.random, so the layout stays reproducible across reloads.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const SEED_SPREAD = 12

// Seed each node near its component slot before the synchronous settle. d3's
// default phyllotaxis seeds every node around the origin, which would force
// distant islands to travel across the canvas within the fixed tick budget;
// seeding at the slot avoids that while spreading members so charge has room
// to separate them.
function seedNearAnchors(simNodes: SimNode[], anchorOf: (id: string) => Anchor) {
  simNodes.forEach((n, i) => {
    const a = anchorOf(n.id)
    const radius = SEED_SPREAD * Math.sqrt(i)
    const angle = i * GOLDEN_ANGLE
    n.x = a.x + radius * Math.cos(angle)
    n.y = a.y + radius * Math.sin(angle)
  })
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
  const simNodes: SimNode[] = topoNodes.map((n) => {
    const size = sizeById.get(n.id)!
    return { id: n.id, r: radiusOf(size), ...size }
  })
  const simNodeById = new Map(simNodes.map((n) => [n.id, n]))

  const links: SimulationLinkDatum<SimNode>[] = topoEdges
    .filter((e) => e.source !== e.target)
    .map((e) => ({ source: e.source, target: e.target }))

  // Group nodes into connected components (islands) and give each a fixed slot
  // on a grid. Every node is then centered on its own slot instead of a shared
  // origin, so islands are positionally independent.
  const components = connectedComponents(
    simNodes.map((n) => n.id),
    links.map((l) => ({ source: l.source as string, target: l.target as string })),
  )
  const anchorByNodeId = packComponentAnchors(components, sizeById, {
    interIslandGap: INTER_ISLAND_GAP,
    collidePadding: COLLIDE_PADDING,
  })
  const anchorOf = (id: string) => anchorByNodeId.get(id) ?? { x: 0, y: 0 }

  seedNearAnchors(simNodes, anchorOf)

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
    .force(
      "charge",
      forceManyBody<SimNode>()
        .strength(CHARGE_STRENGTH)
        .distanceMax(CHARGE_DISTANCE_MAX),
    )
    .force(
      "collide",
      forceCollide<SimNode>().radius((d) => d.r + COLLIDE_PADDING),
    )
    .force("x", forceX<SimNode>((d) => anchorOf(d.id).x).strength(CENTERING_STRENGTH))
    .force("y", forceY<SimNode>((d) => anchorOf(d.id).y).strength(CENTERING_STRENGTH))
    .stop()

  simulation.tick(SIMULATION_TICKS)

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
  return {
    nodes: rfNodes,
    edges: rfEdges.map((e) => ({ ...e, type: "floating" })),
    simulation,
    simNodeById,
  }
}
