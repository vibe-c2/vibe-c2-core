import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  // Bumped when Esc pops a search-initiated focus back to search, so the
  // search box knows to grab the keyboard again (the hook has no DOM access).
  restoreSignal: number
}

export function useTopologyEmphasis(
  topology: Topology,
  nodes: Node[],
  edges: Edge[],
) {
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [activeMatch, setActiveMatch] = useState(0)
  // When focus was entered FROM search (Enter on a match), Esc should step
  // back to the search — query, position in the matches, keyboard — not drop
  // everything. The snapshot lives in a ref (it's history, not render input)
  // and is voided by any interaction that breaks the search → focus chain:
  // clicking a node, typing a new query, clicking the pane.
  const searchReturnRef = useRef<{ query: string; activeMatch: number } | null>(
    null,
  )
  const [restoreSignal, setRestoreSignal] = useState(0)

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

  // Click = focus, re-click = unfocus. A deliberate click supersedes any
  // pending "back to search" — the user has left the search flow.
  const toggleFocus = useCallback((nodeId: string) => {
    searchReturnRef.current = null
    setQuery("")
    setFocusedId((prev) => (prev === nodeId ? null : nodeId))
  }, [])

  // Enter on a search match: focus it like a click, but remember where in the
  // search we were so Esc can return there.
  const focusFromSearch = useCallback(
    (nodeId: string) => {
      searchReturnRef.current = { query, activeMatch: activeIndex }
      setQuery("")
      setFocusedId(nodeId)
    },
    [query, activeIndex],
  )

  const onQueryChange = useCallback((q: string) => {
    searchReturnRef.current = null
    setQuery(q)
    setActiveMatch(0)
    setFocusedId(null)
  }, [])

  const clearEmphasis = useCallback(() => {
    searchReturnRef.current = null
    setFocusedId(null)
    setQuery("")
  }, [])

  // Esc anywhere on the page: if the current focus came from a search, pop
  // back to that search (restore the query + active match, hand the keyboard
  // to the input via restoreSignal); otherwise clear focus/search outright.
  // The search input's own Esc handler runs first and preventDefaults, so
  // this never double-fires while typing; dialogs likewise consume Esc before
  // it reaches the window.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      const saved = searchReturnRef.current
      if (saved && focusedId) {
        searchReturnRef.current = null
        setFocusedId(null)
        setQuery(saved.query)
        setActiveMatch(saved.activeMatch)
        setRestoreSignal((n) => n + 1)
        return
      }
      clearEmphasis()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [focusedId, clearEmphasis])

  const search: TopologySearchState = {
    query,
    onQueryChange,
    matchIds,
    activeIndex,
    onActiveIndexChange: setActiveMatch,
    restoreSignal,
  }

  return {
    displayNodes,
    displayEdges,
    toggleFocus,
    focusFromSearch,
    clearEmphasis,
    search,
    focusedId,
  }
}
