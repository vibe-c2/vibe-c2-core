import type { Edge, Node } from "@xyflow/react"
import type { Topology } from "@/lib/topology/derive"
import { isPillNodeType } from "@/components/findings/topology/layout"

// Visual emphasis over the rendered graph: click-to-focus dims everything
// outside a node's neighborhood; search dims everything but the matches.
//
// Deliberately a presentation-only pass over the already-laid-out React Flow
// nodes/edges — it must never rebuild the Topology, because that would
// rebuild the d3 simulation and reshuffle node positions mid-interaction.
// Nodes dim via wrapper style/className (no node-component changes needed);
// edges dim via a data flag the FloatingEdge applies to path AND label.

export const DIM_OPACITY = 0.15

// Resting opacity for "quiet" edges (the login edges on the users lens). Faint
// enough that the nodes own the view, strong enough that the wiring is still
// legible. Lighter than full, well above DIM_OPACITY — a quiet edge isn't a
// dimmed one. See FloatingEdge.
export const REST_EDGE_OPACITY = 0.4

export type EmphasisSets = {
  lit: Set<string> // node ids that stay at full opacity
  active: string | null // the one node that gets the strong ring
  // Search rings every match so the eye can find them all; focus rings only
  // the clicked node — its neighbors are identified by staying lit.
  ringMatches: boolean
}

// Undirected adjacency over the visible edges, for 1-hop neighborhoods.
export function buildAdjacency(t: Topology): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  const add = (a: string, b: string) => {
    const set = adj.get(a) ?? new Set<string>()
    set.add(b)
    adj.set(a, set)
  }
  for (const e of t.edges) {
    if (e.source === e.target) continue
    add(e.source, e.target)
    add(e.target, e.source)
  }
  return adj
}

// Clicking a node lights its 1-hop neighborhood. On the users lens that reads
// naturally because hosts and identities are wired together directly: clicking
// an identity lights every host it touches (its source and accessed hosts);
// clicking a host lights every identity seen on it. We deliberately do NOT take
// a second hop through identities — lighting every *other* host a shared
// account (root, default, …) ever touched would blast far past "what relates to
// this node" and drown the signal. The relation to the clicked node is the
// users on it, not the whole transitive reach of those users.
export function focusSets(
  nodeId: string,
  adjacency: Map<string, Set<string>>,
): EmphasisSets {
  const lit = new Set<string>([nodeId])
  for (const n of adjacency.get(nodeId) ?? []) lit.add(n)
  return { lit, active: nodeId, ringMatches: false }
}

export function searchSets(
  matchIds: string[],
  activeIndex: number,
): EmphasisSets {
  return {
    lit: new Set(matchIds),
    active: matchIds[activeIndex] ?? null,
    ringMatches: true,
  }
}

// The ring is drawn on React Flow's node wrapper div, so its radius must
// match the shape the node component renders inside it — pills are round.
const ringRadius = (nodeType: string | undefined) =>
  isPillNodeType(nodeType) ? "rounded-full" : "rounded-md"

// Dim/ring styling for one node.
function decorateNode(node: Node, sets: EmphasisSets): Node {
  const isLit = sets.lit.has(node.id)
  const isActive = node.id === sets.active
  const ring = isActive
    ? `${ringRadius(node.type)} ring-2 ring-primary`
    : sets.ringMatches && isLit
      ? `${ringRadius(node.type)} ring-2 ring-primary/40`
      : ""
  return {
    ...node,
    className: [node.className, "transition-opacity duration-150", ring]
      .filter(Boolean)
      .join(" "),
    style: { ...node.style, opacity: isLit ? 1 : DIM_OPACITY },
  }
}

// While emphasis is active, the simulation hands the view a new nodes array
// on every tick (drag updates positions), so decoration re-runs per tick.
// This memo table keeps the decorated object identity stable for every input
// node the tick left untouched — without it each tick would hand React Flow
// fresh identities for ALL nodes and re-render every node component, not
// just the moving ones. Pure and idempotent: keyed by input node identity,
// valid only for the EmphasisSets it was computed against; dead nodes fall
// out with the WeakMap.
const decorated = new WeakMap<Node, { sets: EmphasisSets; out: Node }>()

export function applyNodeEmphasis(
  nodes: Node[],
  sets: EmphasisSets | null,
): Node[] {
  if (!sets) return nodes
  return nodes.map((node) => {
    const hit = decorated.get(node)
    if (hit && hit.sets === sets) return hit.out
    const out = decorateNode(node, sets)
    decorated.set(node, { sets, out })
    return out
  })
}

export function applyEdgeEmphasis(
  edges: Edge[],
  sets: EmphasisSets | null,
): Edge[] {
  if (!sets) return edges
  // An edge stays lit only when both of its endpoints are — in focus mode
  // that's exactly the focused node's spokes (plus edges among neighbors). The
  // `lit` flag is the cue FloatingEdge uses to fire a quiet edge up to its full
  // color; everything else dims.
  return edges.map((edge) => {
    const lit = sets.lit.has(edge.source) && sets.lit.has(edge.target)
    return { ...edge, data: { ...edge.data, dimmed: !lit, lit } }
  })
}
