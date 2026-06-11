// Radial BFS seeding for the force layout.
//
// d3's default initializer (a phyllotaxis spiral in input order) can start a
// host and its subnets on opposite sides of the disc; the settle then has to
// drag them past everything in between, and whatever crossings survive the
// untangle phase cool into the final map. Seeding instead starts the
// simulation near the answer: BFS out from each component's biggest hub,
// nodes on concentric rings by BFS depth, and every node confined to an
// angular wedge carved out of its parent's wedge (sized by subtree weight).
// Spokes can never leave their hub's sector, so arms can't start crossed —
// the force settle then only relaxes distances instead of performing
// topology surgery. Local crowding inside a narrow wedge is fine: the
// collide phase pushes overlaps apart, which forces CAN do; uncrossing
// arms is what they can't.
//
// Pure and deterministic for a given input order: same data, same map.

export type SeedNode = { id: string; r: number }
export type SeedEdge = { source: string; target: string }
export type SeedPosition = { x: number; y: number }

const RING_GAP = 90 // minimum radial step between consecutive rings
const NODE_GAP = 24 // angular breathing room between ring neighbors
const COMPONENT_GAP = 200 // space between disconnected components

type PlacedComponent = {
  positions: Map<string, SeedPosition>
  // Conservative containment radius: every node sits on a ring no larger
  // than the last one, so (last ring center + its biggest node) bounds the
  // whole component. Asymmetric components (e.g. chains, which grow in one
  // direction) get looser spacing out of it — harmless, the centering force
  // compacts the map during the settle.
  extent: number
}

export function seedRadial(
  nodes: SeedNode[],
  edges: SeedEdge[],
): Map<string, SeedPosition> {
  const positions = new Map<string, SeedPosition>()
  if (nodes.length === 0) return positions

  // Undirected adjacency; insertion order follows input order so BFS
  // discovery — and therefore the whole seeding — is deterministic.
  const adjacency = new Map<string, string[]>()
  for (const n of nodes) adjacency.set(n.id, [])
  for (const e of edges) {
    if (e.source === e.target) continue
    adjacency.get(e.source)?.push(e.target)
    adjacency.get(e.target)?.push(e.source)
  }
  const radiusById = new Map(nodes.map((n) => [n.id, n.r]))

  const placed = findComponents(nodes, adjacency).map((members) =>
    placeComponent(members, adjacency, radiusById),
  )

  // Components sit side by side in one row, the row centered on the origin so
  // the weak centering force doesn't drag the whole map sideways during the
  // settle. Charge keeps them apart; collide polishes any near-contact.
  const totalWidth =
    placed.reduce((sum, c) => sum + 2 * c.extent, 0) +
    COMPONENT_GAP * Math.max(0, placed.length - 1)
  let cursor = -totalWidth / 2
  for (const component of placed) {
    const centerX = cursor + component.extent
    for (const [id, p] of component.positions) {
      positions.set(id, { x: p.x + centerX, y: p.y })
    }
    cursor += 2 * component.extent + COMPONENT_GAP
  }
  return positions
}

function findComponents(
  nodes: SeedNode[],
  adjacency: Map<string, string[]>,
): string[][] {
  const visited = new Set<string>()
  const components: string[][] = []
  for (const n of nodes) {
    if (visited.has(n.id)) continue
    const members: string[] = []
    const queue = [n.id]
    visited.add(n.id)
    while (queue.length > 0) {
      const id = queue.shift()!
      members.push(id)
      for (const next of adjacency.get(id) ?? []) {
        if (visited.has(next)) continue
        visited.add(next)
        queue.push(next)
      }
    }
    components.push(members)
  }
  return components
}

function placeComponent(
  members: string[],
  adjacency: Map<string, string[]>,
  radiusById: Map<string, number>,
): PlacedComponent {
  // Root at the component's biggest hub (input order breaks degree ties).
  let root = members[0]
  for (const id of members) {
    if ((adjacency.get(id)?.length ?? 0) > (adjacency.get(root)?.length ?? 0)) {
      root = id
    }
  }

  // BFS tree: depth becomes the ring index, children lists (in discovery
  // order) drive the wedge subdivision below.
  const seen = new Set([root])
  const childrenOf = new Map<string, string[]>()
  const depthOf = new Map<string, number>([[root, 0]])
  const layers: string[][] = [[root]]
  let frontier = [root]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (seen.has(neighbor)) continue
        seen.add(neighbor)
        depthOf.set(neighbor, layers.length)
        const kids = childrenOf.get(id) ?? []
        kids.push(neighbor)
        childrenOf.set(id, kids)
        next.push(neighbor)
      }
    }
    if (next.length > 0) layers.push(next)
    frontier = next
  }

  // Subtree sizes, deepest layers first so children are summed before their
  // parents. A node's wedge share is proportional to the weight hanging off
  // it — a hub with thirty descendants gets the sector to hold them.
  // (`layers` and `childrenOf` are filled by the same BFS, so every child id
  // is guaranteed an entry here — the `!` lookups below can't miss.)
  const subtreeSize = new Map<string, number>()
  for (const layer of [...layers].reverse()) {
    for (const id of layer) {
      const kids = childrenOf.get(id) ?? []
      subtreeSize.set(
        id,
        1 + kids.reduce((sum, kid) => sum + subtreeSize.get(kid)!, 0),
      )
    }
  }

  // Ring radius per depth: clear the previous ring radially AND provide
  // enough circumference for the ring's members shoulder to shoulder.
  // `prevRadius` tracks the previous ring's OUTER EDGE (center + its biggest
  // node), so the next center lands at outer edge + RING_GAP + own biggest
  // node — RING_GAP separates node boundaries, not ring centers.
  const ringRadius = [0]
  let prevRadius = radiusById.get(root) ?? 0
  for (const layer of layers.slice(1)) {
    const maxR = layer.reduce(
      (max, id) => Math.max(max, radiusById.get(id) ?? 0),
      0,
    )
    const circumference = layer.reduce(
      (sum, id) => sum + 2 * (radiusById.get(id) ?? 0) + NODE_GAP,
      0,
    )
    const radius = Math.max(
      prevRadius + maxR + RING_GAP,
      circumference / (2 * Math.PI),
    )
    ringRadius.push(radius)
    prevRadius = radius + maxR
  }

  // Wedge subdivision in BFS order: each node splits its own wedge among its
  // children by subtree weight and a child sits at its wedge's bisector.
  const positions = new Map<string, SeedPosition>([[root, { x: 0, y: 0 }]])
  const wedgeOf = new Map([[root, { start: 0, end: 2 * Math.PI }]])
  for (const id of layers.flat()) {
    const kids = childrenOf.get(id)
    if (!kids) continue
    const { start, end } = wedgeOf.get(id)!
    const total = kids.reduce((sum, kid) => sum + subtreeSize.get(kid)!, 0)
    let cursor = start
    for (const kid of kids) {
      const span = ((end - start) * subtreeSize.get(kid)!) / total
      wedgeOf.set(kid, { start: cursor, end: cursor + span })
      const angle = cursor + span / 2
      const radius = ringRadius[depthOf.get(kid)!]
      positions.set(kid, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      })
      cursor += span
    }
  }

  return { positions, extent: prevRadius }
}
