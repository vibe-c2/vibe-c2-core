// Crossing-reduction post-pass for the force layout.
//
// A force simulation is local gradient descent: every node steps down the local
// energy slope, and once alpha cools it sits in the nearest local minimum. The
// move a human makes to untangle a graph — pick a node up, carry it ACROSS the
// crowded middle, drop it in open space — goes uphill in energy before it comes
// down (an energy barrier), so a cooled simulation never makes it even when the
// destination is plainly better. Collision makes it worse: uncrossing two arms
// needs a node to pass THROUGH another, exactly the move forceCollide forbids.
//
// This pass performs that global move the springs can't. After the settle, each
// node is offered a set of candidate positions (its neighbours' centroid, the
// point-reflection across it — "the other side" — and a ring around it). A move
// is taken only if it strictly lowers a cost dominated by the number of edge
// CROSSINGS the node's own edges take part in, with node overlap as a
// tiebreaker. Moving one node only changes crossings on edges incident to it, so
// scoring those edges captures the exact global delta: the pass is monotone —
// total crossings never increase. Pure and deterministic (no randomness), so the
// map is identical across reloads of the same data.

export interface XYNode {
  id: string
  x?: number
  y?: number
  // Half-diagonal radius, used for the overlap tiebreaker.
  r: number
}

export interface Pair {
  a: string
  b: string
}

// Above this many nodes/edges the O(node · candidates · edges) pass stops
// paying for itself (and the dense case is the one where crossings are
// unavoidable anyway). The collapses upstream keep the users lens well under
// this; the guard is a backstop, not the common path.
const MAX_NODES = 400
const MAX_EDGES = 400

const MAX_ROUNDS = 10
// Candidate ring radii as a multiple of the node's own link scale.
const RING_SCALE = [0.6, 1, 1.4]
const RING_DIRS = 8
// A node's link scale floor, so a tightly-settled hub still gets candidates far
// enough out to clear the bundle.
const MIN_LINK_SCALE = 160
// Two nodes count as overlapping when their centres are closer than this
// fraction of their combined radii — softer than hard contact so the tiebreaker
// nudges apart near-touching nodes too.
const OVERLAP_FACTOR = 0.9

type XY = { x: number; y: number }

// Orientation sign of the turn p→q→r: >0 ccw, <0 cw, 0 collinear.
function cross3(p: XY, q: XY, r: XY): number {
  return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
}

// Do open segments p1p2 and p3p4 properly cross? Shared endpoints are handled by
// the caller (edges sharing a node are skipped), so this is the strict
// straddle test; collinear/touching is treated as non-crossing.
function segmentsCross(p1: XY, p2: XY, p3: XY, p4: XY): boolean {
  const d1 = cross3(p3, p4, p1)
  const d2 = cross3(p3, p4, p2)
  const d3 = cross3(p1, p2, p3)
  const d4 = cross3(p1, p2, p4)
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  )
}

// Total number of crossing edge pairs (edges sharing an endpoint excluded).
// Exported for tests — the pass's guarantee is that this never rises.
export function countCrossings(
  nodes: ReadonlyArray<XYNode>,
  edges: ReadonlyArray<Pair>,
): number {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let total = 0
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (edgesAdjacent(edges[i], edges[j])) continue
      if (segmentEdgesCross(edges[i], edges[j], byId)) total++
    }
  }
  return total
}

function edgesAdjacent(e: Pair, f: Pair): boolean {
  return e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b
}

// Positions live on the nodes, so endpoints are read straight off them — no
// per-test position map to allocate in the hot candidate-scoring loop.
function pointOf(byId: Map<string, XYNode>, id: string): XY | undefined {
  const n = byId.get(id)
  return n ? { x: n.x ?? 0, y: n.y ?? 0 } : undefined
}

function segmentEdgesCross(
  e: Pair,
  f: Pair,
  byId: Map<string, XYNode>,
): boolean {
  const a = pointOf(byId, e.a)
  const b = pointOf(byId, e.b)
  const c = pointOf(byId, f.a)
  const d = pointOf(byId, f.b)
  if (!a || !b || !c || !d) return false
  return segmentsCross(a, b, c, d)
}

// Mutates node x/y in place (consistent with the d3 simulation nodes this runs
// on), lowering edge crossings without ever raising the total. No-op when the
// graph is too large to score affordably or has nothing to uncross.
export function reduceCrossings(
  nodes: XYNode[],
  edges: ReadonlyArray<Pair>,
): void {
  if (nodes.length > MAX_NODES || edges.length > MAX_EDGES) return
  if (nodes.length < 3 || edges.length < 2) return

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const incident = new Map<string, Pair[]>()
  const neighbours = new Map<string, string[]>()
  for (const e of edges) {
    if (e.a === e.b) continue
    push(incident, e.a, e)
    push(incident, e.b, e)
    push(neighbours, e.a, e.b)
    push(neighbours, e.b, e.a)
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let moved = false
    for (const node of nodes) {
      const inc = incident.get(node.id)
      if (!inc || inc.length === 0) continue // isolated — nothing to uncross

      const origin: XY = { x: node.x ?? 0, y: node.y ?? 0 }
      const baseCrossings = nodeCrossings(inc, edges, byId)
      // A node taking part in no crossing is already placed well — never move it
      // just to shave overlap, or a happy near-planar lens (subnets) would drift.
      if (baseCrossings === 0) continue

      const candidates = candidatePositions(node, neighbours, byId)
      if (candidates.length === 0) continue

      // Among candidates that strictly cut this node's crossings, take the one
      // with the fewest (overlap breaks ties so the uncross doesn't stack nodes).
      let bestCrossings = baseCrossings
      let bestOverlap = overlapCount(node, byId)
      let bestPos: XY | null = null
      for (const cand of candidates) {
        node.x = cand.x
        node.y = cand.y
        const crossings = nodeCrossings(inc, edges, byId)
        if (crossings > bestCrossings) continue
        const overlap = overlapCount(node, byId)
        if (
          crossings < bestCrossings ||
          (crossings === bestCrossings && overlap < bestOverlap)
        ) {
          bestCrossings = crossings
          bestOverlap = overlap
          bestPos = cand
        }
      }

      node.x = origin.x
      node.y = origin.y
      if (bestPos && bestCrossings < baseCrossings) {
        node.x = bestPos.x
        node.y = bestPos.y
        moved = true
      }
    }
    if (!moved) break
  }
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const arr = map.get(key)
  if (arr) arr.push(value)
  else map.set(key, [value])
}

// Crossings on this node's edges — the only crossings its position can change,
// so this is the exact global delta of moving it.
function nodeCrossings(
  inc: ReadonlyArray<Pair>,
  edges: ReadonlyArray<Pair>,
  byId: Map<string, XYNode>,
): number {
  let crossings = 0
  for (const e of inc) {
    for (const f of edges) {
      if (e === f || edgesAdjacent(e, f)) continue
      if (segmentEdgesCross(e, f, byId)) crossings++
    }
  }
  return crossings
}

function overlapCount(node: XYNode, byId: Map<string, XYNode>): number {
  let count = 0
  const x = node.x ?? 0
  const y = node.y ?? 0
  for (const other of byId.values()) {
    if (other === node) continue
    const dx = (other.x ?? 0) - x
    const dy = (other.y ?? 0) - y
    const min = (node.r + other.r) * OVERLAP_FACTOR
    if (dx * dx + dy * dy < min * min) count++
  }
  return count
}

// The candidate positions offered to a node: its neighbour centroid (a natural
// low-stress spot), the point-reflection of its current position across that
// centroid (the "swing to the other side" uncross move), and a ring around the
// centroid so it can clear a bundle into open space.
function candidatePositions(
  node: XYNode,
  neighbours: Map<string, string[]>,
  byId: Map<string, XYNode>,
): XY[] {
  const nbrs = neighbours.get(node.id) ?? []
  if (nbrs.length === 0) return []

  let cx = 0
  let cy = 0
  let scale = 0
  for (const id of nbrs) {
    const n = byId.get(id)
    if (!n) continue
    cx += n.x ?? 0
    cy += n.y ?? 0
  }
  cx /= nbrs.length
  cy /= nbrs.length
  for (const id of nbrs) {
    const n = byId.get(id)
    if (!n) continue
    scale = Math.max(scale, Math.hypot((n.x ?? 0) - cx, (n.y ?? 0) - cy))
  }
  scale = Math.max(scale, MIN_LINK_SCALE)

  const x = node.x ?? 0
  const y = node.y ?? 0
  const candidates: XY[] = [
    { x: cx, y: cy }, // neighbour centroid
    { x: 2 * cx - x, y: 2 * cy - y }, // reflect across centroid
  ]
  for (const mult of RING_SCALE) {
    const radius = scale * mult
    for (let k = 0; k < RING_DIRS; k++) {
      const angle = (2 * Math.PI * k) / RING_DIRS
      candidates.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      })
    }
  }
  return candidates
}
