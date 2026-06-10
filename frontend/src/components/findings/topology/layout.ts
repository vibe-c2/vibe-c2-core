import dagre from "dagre"
import { MarkerType, type Edge, type Node } from "@xyflow/react"
import type { Topology } from "@/lib/topology/derive"

// Maps the framework-free topology model onto React Flow nodes/edges and lays
// it out. Two-level layout: dagre places the top-level boxes (subnet
// containers, standalone hosts, phantoms) using the inter-box relationships;
// hosts are then nested inside their subnet container in a simple grid. A host
// belongs to its FIRST subnet visually (containment); any additional subnet
// memberships are drawn as explicit edges.

const HOST_W = 180
const HOST_H = 64
const PHANTOM_W = 160
const PHANTOM_H = 56
const PAD = 12
const HEADER = 30
const GAP = 12
const GRID_COLS = 2

function subnetSize(childCount: number) {
  const cols = Math.min(GRID_COLS, Math.max(1, childCount))
  const rows = Math.max(1, Math.ceil(childCount / cols))
  return {
    width: PAD * 2 + cols * HOST_W + (cols - 1) * GAP,
    height: HEADER + PAD + rows * HOST_H + (rows - 1) * GAP + PAD,
    cols,
  }
}

type TopologyLayout = { nodes: Node[]; edges: Edge[] }

export function layoutTopology(topology: Topology): TopologyLayout {
  const { nodes: topoNodes, edges: topoEdges } = topology

  // Index host nodes and decide each host's "home" subnet (its first).
  const hostHome = new Map<string, string | null>()
  const hostData = new Map<string, Node["data"]>()
  for (const n of topoNodes) {
    if (n.kind === "host") {
      hostHome.set(n.id, n.subnetIds[0] ?? null)
      hostData.set(n.id, { host: n.host })
    }
  }

  // How many hosts are nested in each subnet container (home only) — drives
  // the container's grid size.
  const childCount = new Map<string, number>()
  for (const home of hostHome.values()) {
    if (home) childCount.set(home, (childCount.get(home) ?? 0) + 1)
  }

  // The top-level box that a host sits in: its home subnet, or itself if it has
  // no subnet (standalone host).
  const boxOf = (hostId: string) => hostHome.get(hostId) ?? hostId

  // --- dagre over top-level boxes -------------------------------------------
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 90, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))

  const sizeById = new Map<string, { width: number; height: number; cols: number }>()
  for (const n of topoNodes) {
    if (n.kind === "subnet") {
      const size = subnetSize(childCount.get(n.id) ?? 0)
      sizeById.set(n.id, size)
      g.setNode(n.id, { width: size.width, height: size.height })
    } else if (n.kind === "host" && !hostHome.get(n.id)) {
      g.setNode(n.id, { width: HOST_W, height: HOST_H })
    } else if (n.kind === "phantom-gateway" || n.kind === "phantom-subnet") {
      g.setNode(n.id, { width: PHANTOM_W, height: PHANTOM_H })
    }
  }

  // Collapse derived edges to box-level for layout (dedup). boxOf maps a host
  // to its container and leaves subnet/phantom ids unchanged.
  const seen = new Set<string>()
  for (const e of topoEdges) {
    const a = boxOf(e.source)
    const b = boxOf(e.target)
    if (a === b) continue
    if (!g.hasNode(a) || !g.hasNode(b)) continue
    const key = `${a}__${b}`
    if (seen.has(key)) continue
    seen.add(key)
    g.setEdge(a, b)
  }

  dagre.layout(g)

  const rfNodes: Node[] = []

  // Subnet containers first (so children render above them).
  for (const n of topoNodes) {
    if (n.kind !== "subnet") continue
    const pos = g.node(n.id)
    const size = sizeById.get(n.id)!
    rfNodes.push({
      id: n.id,
      type: "subnet",
      position: { x: pos.x - size.width / 2, y: pos.y - size.height / 2 },
      data: { cidr: n.cidr, hostCount: n.hostIds.length },
      style: { width: size.width, height: size.height },
      draggable: false,
      selectable: false,
    })
  }

  // Host nodes: nested children get a grid slot relative to their container;
  // standalone hosts get an absolute dagre position.
  const placedInSubnet = new Map<string, number>()
  for (const n of topoNodes) {
    if (n.kind !== "host") continue
    const home = hostHome.get(n.id)
    if (home) {
      const cols = sizeById.get(home)?.cols ?? GRID_COLS
      const idx = placedInSubnet.get(home) ?? 0
      placedInSubnet.set(home, idx + 1)
      const col = idx % cols
      const row = Math.floor(idx / cols)
      rfNodes.push({
        id: n.id,
        type: "host",
        parentId: home,
        extent: "parent",
        position: {
          x: PAD + col * (HOST_W + GAP),
          y: HEADER + PAD + row * (HOST_H + GAP),
        },
        data: hostData.get(n.id)!,
      })
    } else {
      const pos = g.node(n.id)
      rfNodes.push({
        id: n.id,
        type: "host",
        position: { x: pos.x - HOST_W / 2, y: pos.y - HOST_H / 2 },
        data: hostData.get(n.id)!,
      })
    }
  }

  // Phantom nodes.
  for (const n of topoNodes) {
    if (n.kind === "phantom-gateway") {
      const pos = g.node(n.id)
      rfNodes.push({
        id: n.id,
        type: "phantomGateway",
        position: { x: pos.x - PHANTOM_W / 2, y: pos.y - PHANTOM_H / 2 },
        data: { ip: n.ip },
      })
    } else if (n.kind === "phantom-subnet") {
      const pos = g.node(n.id)
      rfNodes.push({
        id: n.id,
        type: "phantomSubnet",
        position: { x: pos.x - PHANTOM_W / 2, y: pos.y - PHANTOM_H / 2 },
        data: { cidr: n.cidr },
      })
    }
  }

  // --- edges -----------------------------------------------------------------
  const rfEdges: Edge[] = []
  for (const e of topoEdges) {
    if (e.kind === "membership") {
      // Containment shows a host's home subnet; only draw membership to its
      // OTHER subnets (multi-homed hosts).
      if (hostHome.get(e.source) === e.target) continue
      rfEdges.push({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.iface || undefined,
        style: { stroke: "var(--color-border)", strokeWidth: 1.5 },
        labelStyle: { fontSize: 10, fill: "var(--color-muted-foreground)" },
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
        labelStyle: { fontSize: 10, fontFamily: "monospace" },
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
        labelStyle: { fontSize: 10, fontFamily: "monospace" },
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

  return { nodes: rfNodes, edges: rfEdges }
}
