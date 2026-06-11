import { useCallback, useEffect, useMemo, useRef } from "react"
import { useNodesState, type Node, type OnNodeDrag } from "@xyflow/react"
import type { Topology } from "@/lib/topology/derive"
import {
  layoutTopology,
  type SimNode,
} from "@/components/findings/topology/layout"
import { buildAdjacency } from "@/components/findings/topology/emphasis"

// Obsidian-style live physics on top of the pre-settled layout. The first
// paint is the finished static map (layoutTopology runs the simulation
// synchronously), and the simulation stays paused until the user grabs a
// node. Dragging pins the node to the pointer (fx/fy) and re-heats the
// simulation, so neighbors are pulled along; releasing un-pins and lets the
// graph cool back to rest. This is the canonical d3-force drag pattern
// (alphaTarget reheat), with one performance constraint layered on top:
//
// A global reheat moves EVERY node every tick, and each floating edge whose
// endpoints moved recomputes its bezier path and repaints — so on the dense
// users lens (hundreds of login edges) a plain reheat repaints the whole edge
// layer at 60fps and pins the CPU. To bound that, the reheat is LOCALIZED:
// only nodes within a few hops of the grabbed node are left free to follow;
// everything beyond is pinned in place for the drag, so the moving (and
// therefore repainting) region — and the per-tick work — stays small.

// How "hot" the simulation runs while a node is held. d3's canonical drag
// value is 0.3; kept a touch cooler here since the reheat is also localized,
// so the freed neighborhood reshuffles gently instead of snapping.
const DRAG_ALPHA_TARGET = 0.2

// While a node is held, only nodes within this many hops of any grabbed node
// are left free to follow the drag; everything farther is parked. On a
// hub-and-spoke graph two hops reaches the grabbed node's immediate cluster
// (e.g. an identity → its hosts → the other identities on those hosts) without
// freeing the whole component.
const DRAG_NEIGHBORHOOD_HOPS = 2

// Extra friction applied only while dragging, so the freed neighborhood settles
// in fewer, smaller steps instead of sloshing. Restored to d3's default (0.4)
// on release, so the global cool-down behaves normally.
const DRAG_VELOCITY_DECAY = 0.5
const REST_VELOCITY_DECAY = 0.4

// Node ids within `hops` of any seed over the (undirected) adjacency, seeds
// included. A bounded BFS — the dragged node's local cluster.
function neighborhood(
  adjacency: Map<string, Set<string>>,
  seeds: string[],
  hops: number,
): Set<string> {
  const visited = new Set(seeds)
  let frontier = seeds
  for (let h = 0; h < hops; h++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const nb of adjacency.get(id) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb)
          next.push(nb)
        }
      }
    }
    frontier = next
  }
  return visited
}

// Multi-select drags report every grabbed node, so pin/release take the whole
// batch — otherwise the simulation would yank unpinned selection members away
// from the pointer. React Flow positions are top-left corners; the simulation
// works in centers.
function pinNodes(simNodeById: Map<string, SimNode>, dragged: Node[]) {
  for (const node of dragged) {
    const sim = simNodeById.get(node.id)
    if (sim) {
      sim.fx = node.position.x + sim.width / 2
      sim.fy = node.position.y + sim.height / 2
    }
  }
}

// Obsidian behavior: released nodes rejoin the physics instead of staying
// where they were dropped.
function releaseNodes(simNodeById: Map<string, SimNode>, dragged: Node[]) {
  for (const node of dragged) {
    const sim = simNodeById.get(node.id)
    if (sim) {
      sim.fx = null
      sim.fy = null
    }
  }
}

// Pin every node OUTSIDE `keep` at its current center, so the localized reheat
// can't move it (and its edges never recompute). Records what was parked into
// `parked` so the matching release un-pins exactly these — not the dragged
// nodes, which releaseNodes owns. The grabbed nodes are always in `keep`, so
// their pointer pin (set by pinNodes) is left untouched here.
function parkOutside(
  simNodeById: Map<string, SimNode>,
  keep: Set<string>,
  parked: Set<string>,
) {
  for (const sim of simNodeById.values()) {
    if (keep.has(sim.id)) continue
    sim.fx = sim.x ?? null
    sim.fy = sim.y ?? null
    parked.add(sim.id)
  }
}

function unparkAll(simNodeById: Map<string, SimNode>, parked: Set<string>) {
  for (const id of parked) {
    const sim = simNodeById.get(id)
    if (sim) {
      sim.fx = null
      sim.fy = null
    }
  }
  parked.clear()
}

export function useTopologySimulation(topology: Topology) {
  // Building the layout creates the (stopped) simulation as a side effect of
  // the memo — harmless if StrictMode double-invokes: the extra instance has
  // no running timer and is simply dropped.
  const layout = useMemo(() => layoutTopology(topology), [topology])
  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes)

  // Adjacency for the localized-reheat BFS. Built from the same topology the
  // layout was, so its ids line up with simNodeById. Memoized alongside layout.
  const adjacency = useMemo(() => buildAdjacency(topology), [topology])

  // Drag handlers go through a ref so they always see the CURRENT simulation.
  // With a plain `[layout]` dependency, a data refresh landing mid-drag would
  // leave the handlers pinning nodes of the already-stopped old simulation
  // for one render. Bonus: the handlers are referentially stable. The refs are
  // refreshed by the effect below, which re-runs on every layout change.
  const layoutRef = useRef(layout)
  const adjacencyRef = useRef(adjacency)
  // Ids parked by parkOutside for the in-flight drag, so the release un-pins
  // exactly them. A ref (not state) — mutated during the drag, never rendered.
  const parkedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const { simulation, simNodeById } = layout
    layoutRef.current = layout
    adjacencyRef.current = adjacency
    setNodes(layout.nodes)

    // Every tick, push simulation centers into React Flow positions. Floating
    // edges read node positions directly, so they animate along for free.
    // Nodes that didn't move keep their identity so React Flow skips them.
    //
    // While a node is dragged, React Flow also writes its pointer-tracked
    // position via onNodesChange — for the pinned node both writers agree
    // (fx/fy IS the pointer position), so this is a benign double-write, kept
    // because suppressing React Flow's position changes would couple us to
    // its drag internals.
    simulation.on("tick", () => {
      setNodes((prev) =>
        prev.map((node) => {
          const sim = simNodeById.get(node.id)
          if (!sim || sim.x === undefined || sim.y === undefined) return node
          const x = sim.x - sim.width / 2
          const y = sim.y - sim.height / 2
          if (node.position.x === x && node.position.y === y) return node
          return { ...node, position: { x, y } }
        }),
      )
    })

    return () => {
      simulation.on("tick", null)
      simulation.stop()
    }
  }, [layout, adjacency, setNodes])

  const onNodeDragStart: OnNodeDrag = useCallback((_event, _node, dragged) => {
    const { simNodeById, simulation } = layoutRef.current
    // Release the far side parked by the PREVIOUS drag, lazily, here — the
    // instant before we re-park for this one. Releasing it on the prior drag's
    // stop instead would let those nodes drift as the simulation cooled (the
    // whole-graph nudge on drop). At rest, parked vs free looks identical, so
    // holding the pins until now is invisible. unparkAll also clears the set.
    unparkAll(simNodeById, parkedRef.current)
    pinNodes(simNodeById, dragged)
    // Localize the reheat: free only the grabbed nodes' local cluster, park the
    // rest at their current positions so the reheat can't move them.
    const keep = neighborhood(
      adjacencyRef.current,
      dragged.map((d) => d.id),
      DRAG_NEIGHBORHOOD_HOPS,
    )
    parkOutside(simNodeById, keep, parkedRef.current)
    simulation.velocityDecay(DRAG_VELOCITY_DECAY)
    simulation.alphaTarget(DRAG_ALPHA_TARGET).restart()
  }, [])

  const onNodeDrag: OnNodeDrag = useCallback((_event, _node, dragged) => {
    pinNodes(layoutRef.current.simNodeById, dragged)
  }, [])

  const onNodeDragStop: OnNodeDrag = useCallback((_event, _node, dragged) => {
    const { simNodeById, simulation } = layoutRef.current
    releaseNodes(simNodeById, dragged)
    // Leave the far side parked through the cool-down so it stays put on drop —
    // only the grabbed node's freed neighborhood settles now. The far pins are
    // released at the next drag start (see above). Restore normal friction.
    simulation.velocityDecay(REST_VELOCITY_DECAY)
    simulation.alphaTarget(0)
  }, [])

  return {
    nodes,
    edges: layout.edges,
    // Pre-settled sim positions (centers), keyed by node id. New map identity
    // on every rebuild — the view keys "graph was rebuilt" effects off it.
    simNodeById: layout.simNodeById,
    onNodesChange,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  }
}
