import { useCallback, useEffect, useMemo, useRef } from "react"
import { useNodesState, type Node, type OnNodeDrag } from "@xyflow/react"
import type { Topology } from "@/lib/topology/derive"
import {
  layoutTopology,
  type SimNode,
} from "@/components/findings/topology/layout"

// Obsidian-style live physics on top of the pre-settled layout. The first
// paint is the finished static map (layoutTopology runs the simulation
// synchronously), and the simulation stays paused until the user grabs a
// node. Dragging pins the node to the pointer (fx/fy) and re-heats the
// simulation, so neighbors are pulled along and the rest of the graph flows
// around the drag; releasing un-pins and lets the graph cool back to rest.
// This is the canonical d3-force drag pattern (alphaTarget reheat).

// How "hot" the simulation runs while a node is held. d3's canonical drag
// value: high enough that neighbors visibly follow, low enough that the far
// side of the graph doesn't churn.
const DRAG_ALPHA_TARGET = 0.3

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

export function useTopologySimulation(topology: Topology) {
  // Building the layout creates the (stopped) simulation as a side effect of
  // the memo — harmless if StrictMode double-invokes: the extra instance has
  // no running timer and is simply dropped.
  const layout = useMemo(() => layoutTopology(topology), [topology])
  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes)

  // Drag handlers go through a ref so they always see the CURRENT simulation.
  // With a plain `[layout]` dependency, a data refresh landing mid-drag would
  // leave the handlers pinning nodes of the already-stopped old simulation
  // for one render. Bonus: the handlers are referentially stable. The ref is
  // refreshed by the effect below, which re-runs on every layout change.
  const layoutRef = useRef(layout)

  useEffect(() => {
    const { simulation, simNodeById } = layout
    layoutRef.current = layout
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
  }, [layout, setNodes])

  const onNodeDragStart: OnNodeDrag = useCallback((_event, _node, dragged) => {
    const { simNodeById, simulation } = layoutRef.current
    pinNodes(simNodeById, dragged)
    simulation.alphaTarget(DRAG_ALPHA_TARGET).restart()
  }, [])

  const onNodeDrag: OnNodeDrag = useCallback((_event, _node, dragged) => {
    pinNodes(layoutRef.current.simNodeById, dragged)
  }, [])

  const onNodeDragStop: OnNodeDrag = useCallback((_event, _node, dragged) => {
    const { simNodeById, simulation } = layoutRef.current
    releaseNodes(simNodeById, dragged)
    simulation.alphaTarget(0)
  }, [])

  return {
    nodes,
    edges: layout.edges,
    onNodesChange,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  }
}
