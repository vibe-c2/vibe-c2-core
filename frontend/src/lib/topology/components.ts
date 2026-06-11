// Connected-component grouping and initial-slot packing for the topology
// layout. Framework-free (like derive.ts) so it can be unit-tested in
// isolation; the layout layer consumes it to give each disconnected island a
// tidy, non-overlapping starting position on the canvas.
//
// Why this exists: the force simulation is global and has no notion of islands.
// A single origin-centering force binds every island to one point; a fixed
// per-island anchor springs each island back to a home it can't leave. We want
// neither — islands should float freely. So the slots here are used ONLY to
// SEED the layout (a clean, deterministic first paint). There is no centering
// force pulling nodes back: a connected component holds its own shape via its
// link springs, and a distance-bounded charge (see layout.ts) means islands
// only push on each other when dragged close. The result is free-floating
// islands that stay where you leave them.

export type Slot = { x: number; y: number }

type Edge = { source: string; target: string }
type Size = { width: number; height: number }

// Options that tie slot spacing to the simulation's force constants. The gap
// should be >= the charge's distanceMax so islands SEED outside each other's
// repulsion range and the first paint doesn't shuffle them around.
export type PackOptions = {
  interIslandGap: number
  collidePadding: number
}

// Union-Find over the undirected edge view. Self-loops are skipped (consistent
// with the layout's link filter); every node id passed in participates, so a
// node with no edges becomes its own singleton component.
function buildComponents(nodeIds: string[], edges: Edge[]): string[][] {
  const parent = new Map<string, string>()
  for (const id of nodeIds) parent.set(id, id)

  // Find with path halving: flattens the tree as it climbs, in one pass.
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) {
      const grandparent = parent.get(parent.get(root)!)!
      parent.set(root, grandparent)
      root = grandparent
    }
    return root
  }

  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  for (const e of edges) {
    if (e.source === e.target) continue
    // Defensive: an edge may reference an id outside nodeIds in malformed data;
    // seed it so union never dereferences undefined.
    if (!parent.has(e.source)) parent.set(e.source, e.source)
    if (!parent.has(e.target)) parent.set(e.target, e.target)
    union(e.source, e.target)
  }

  const groups = new Map<string, string[]>()
  for (const id of nodeIds) {
    const root = find(id)
    const g = groups.get(root) ?? []
    g.push(id)
    groups.set(root, g)
  }

  return [...groups.values()]
}

// Deterministic ordering so slot assignment is stable across reloads of the
// same data: largest island first, ties broken by smallest member id. Members
// within a component are also sorted for a stable representative id.
function orderComponents(components: string[][]): string[][] {
  const sorted = components.map((c) => [...c].sort())
  sorted.sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return sorted
}

export function connectedComponents(nodeIds: string[], edges: Edge[]): string[][] {
  return orderComponents(buildComponents(nodeIds, edges))
}

// Rough radius of a laid-out component. The force simulation determines the
// real shape; this estimate only sets the grid cell size, so a sqrt(n) packing
// heuristic (area grows with node count) is good enough.
function estimateRadius(
  members: string[],
  sizeById: Map<string, Size>,
  collidePadding: number,
): number {
  let diameterSum = 0
  for (const id of members) {
    const s = sizeById.get(id)
    if (!s) continue
    diameterSum += Math.hypot(s.width, s.height) + collidePadding * 2
  }
  const avgDiameter = members.length > 0 ? diameterSum / members.length : 0
  // sqrt(n) * avg node diameter approximates the span of a force-packed blob.
  return (Math.sqrt(members.length) * avgDiameter) / 2
}

// Assign each component a starting slot on a uniform grid centered on the
// origin and return a per-node-id map of slot centers. Uniform cells (sized to
// the largest island) keep this simple and robust for the handful of islands a
// topology has; the cell is wide enough that islands seed beyond each other's
// charge range. These are seed positions only — no force pulls nodes back to
// them.
export function packComponentSlots(
  components: string[][],
  sizeById: Map<string, Size>,
  opts: PackOptions,
): Map<string, Slot> {
  const slotByNodeId = new Map<string, Slot>()
  const count = components.length
  if (count === 0) return slotByNodeId

  const radii = components.map((c) => estimateRadius(c, sizeById, opts.collidePadding))
  const maxRadius = Math.max(0, ...radii)
  const cell = 2 * maxRadius + opts.interIslandGap

  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  // Center the whole grid on the origin so the first paint stays balanced
  // around (0,0).
  const offsetX = ((cols - 1) * cell) / 2
  const offsetY = ((rows - 1) * cell) / 2

  components.forEach((members, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const slot: Slot = { x: col * cell - offsetX, y: row * cell - offsetY }
    for (const id of members) slotByNodeId.set(id, slot)
  })

  return slotByNodeId
}
