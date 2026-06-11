import { useCallback, useEffect, useMemo, useState } from "react"
import type { Edge, Node } from "@xyflow/react"
import type { Topology } from "@/lib/topology/derive"
import { matchTopology } from "@/lib/topology/search"
import {
  applyEdgeEmphasis,
  applyNodeEmphasis,
  buildAdjacency,
  focusSets,
  searchSets,
} from "@/components/findings/topology/emphasis"

// State for the two emphasis sources — click-to-focus and search — and the
// derived dim/ring styling over the simulation's nodes/edges.
//
// The sources are mutually exclusive by construction: focusing clears the
// query, typing clears the focus. Only the raw inputs (focused id, query,
// active match index) are state; everything visual is derived per render, so
// a data refresh or lens switch can never leave stale emphasis behind.

export type TopologySearchState = {
  query: string
  onQueryChange: (query: string) => void
  matchIds: string[]
  activeIndex: number
  onActiveIndexChange: (index: number) => void
}

export function useTopologyEmphasis(
  topology: Topology,
  nodes: Node[],
  edges: Edge[],
) {
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [activeMatch, setActiveMatch] = useState(0)

  const matchIds = useMemo(
    () => matchTopology(topology, query),
    [topology, query],
  )
  // The match list shrinks under a stale index when data refreshes mid-cycle.
  const activeIndex = activeMatch < matchIds.length ? activeMatch : 0

  const adjacency = useMemo(() => buildAdjacency(topology), [topology])
  const nodeIds = useMemo(
    () => new Set(topology.nodes.map((n) => n.id)),
    [topology],
  )

  const emphasis = useMemo(() => {
    // A focused node can vanish on lens switch or refetch — treat as no focus
    // rather than dimming the whole map around a ghost.
    if (focusedId && nodeIds.has(focusedId)) {
      return focusSets(focusedId, adjacency)
    }
    if (matchIds.length > 0) return searchSets(matchIds, activeIndex)
    return null
  }, [focusedId, nodeIds, adjacency, matchIds, activeIndex])

  // `nodes` gets a new array identity on every simulation tick during drag,
  // so the node pass re-runs per tick while emphasis is active — see the
  // memo table in emphasis.ts for why that stays cheap. Edges come from the
  // layout (stable across ticks), so their pass only re-runs on emphasis
  // changes.
  const displayNodes = useMemo(
    () => applyNodeEmphasis(nodes, emphasis),
    [nodes, emphasis],
  )
  const displayEdges = useMemo(
    () => applyEdgeEmphasis(edges, emphasis),
    [edges, emphasis],
  )

  // Click = focus, re-click = unfocus.
  const toggleFocus = useCallback((nodeId: string) => {
    setQuery("")
    setFocusedId((prev) => (prev === nodeId ? null : nodeId))
  }, [])

  const onQueryChange = useCallback((q: string) => {
    setQuery(q)
    setActiveMatch(0)
    setFocusedId(null)
  }, [])

  const clearEmphasis = useCallback(() => {
    setFocusedId(null)
    setQuery("")
  }, [])

  // Esc anywhere on the page clears focus/search. The search input's own Esc
  // handler runs first and preventDefaults, so this never double-fires while
  // typing; dialogs likewise consume Esc before it reaches the window.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) clearEmphasis()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [clearEmphasis])

  const search: TopologySearchState = {
    query,
    onQueryChange,
    matchIds,
    activeIndex,
    onActiveIndexChange: setActiveMatch,
  }

  return {
    displayNodes,
    displayEdges,
    toggleFocus,
    clearEmphasis,
    search,
    focusedId,
  }
}
