import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Edge, Node } from "@xyflow/react"
import type { Topology } from "@/lib/topology/derive"
import { matchTopology } from "@/lib/topology/search"
import {
  applyEdgeEmphasis,
  applyNodeEmphasis,
  buildAdjacency,
  edgeFocusSets,
  focusSets,
  searchSets,
} from "@/components/findings/topology/emphasis"

// State for the three emphasis sources — click-to-focus on a node, click-to-
// focus on an edge, and search — and the derived dim/ring styling over the
// simulation's nodes/edges.
//
// The sources are mutually exclusive by construction: focusing (either kind)
// clears the query and the other focus, typing clears both foci. Only the raw
// inputs (focused ids, query, active match index) are state; everything visual
// is derived per render, so a data refresh or lens switch can never leave
// stale emphasis behind.

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
  const [focusedEdgeId, setFocusedEdgeId] = useState<string | null>(null)
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
  const edgeById = useMemo(
    () => new Map(topology.edges.map((e) => [e.id, e])),
    [topology],
  )

  const emphasis = useMemo(() => {
    // A focused node can vanish on lens switch or refetch — treat as no focus
    // rather than dimming the whole map around a ghost.
    if (focusedId && nodeIds.has(focusedId)) {
      return focusSets(focusedId, adjacency)
    }
    // Same ghost rule for a focused edge (lens switch strips edge kinds, the
    // collapses replace login edges with group edges).
    const focusedEdge = focusedEdgeId ? edgeById.get(focusedEdgeId) : undefined
    if (focusedEdge) return edgeFocusSets(focusedEdge, topology)
    if (matchIds.length > 0) return searchSets(matchIds, activeIndex)
    return null
  }, [
    focusedId,
    nodeIds,
    adjacency,
    focusedEdgeId,
    edgeById,
    topology,
    matchIds,
    activeIndex,
  ])

  // The bounding-box target for "fit the highlighted scope to the viewport".
  // Only the two *focus* sources drive the camera fit; when one is active the
  // `emphasis` above already IS its focus set (focus wins over search there),
  // so we just reuse its `lit`. Search is deliberately excluded — it keeps its
  // own per-match fly-to so stepping through matches moves the camera one match
  // at a time. `null` = nothing to fit (no focus, or the focus target vanished
  // on a lens switch/refetch, which the same guards below treat as no focus).
  const focusActive =
    (focusedId !== null && nodeIds.has(focusedId)) ||
    (focusedEdgeId !== null && edgeById.has(focusedEdgeId))
  const fitIds = useMemo<string[] | null>(
    () => (focusActive && emphasis ? [...emphasis.lit] : null),
    [focusActive, emphasis],
  )

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
    setFocusedEdgeId(null)
    setFocusedId((prev) => (prev === nodeId ? null : nodeId))
  }, [])

  // Click on an edge: same toggle contract as a node, focusing the relation
  // the edge represents (see edgeFocusSets for what lights up).
  const toggleEdgeFocus = useCallback((edgeId: string) => {
    searchReturnRef.current = null
    setQuery("")
    setFocusedId(null)
    setFocusedEdgeId((prev) => (prev === edgeId ? null : edgeId))
  }, [])

  // Enter on a search match: focus it like a click, but remember where in the
  // search we were so Esc can return there.
  const focusFromSearch = useCallback(
    (nodeId: string) => {
      searchReturnRef.current = { query, activeMatch: activeIndex }
      setQuery("")
      setFocusedEdgeId(null)
      setFocusedId(nodeId)
    },
    [query, activeIndex],
  )

  const onQueryChange = useCallback((q: string) => {
    searchReturnRef.current = null
    setQuery(q)
    setActiveMatch(0)
    setFocusedId(null)
    setFocusedEdgeId(null)
  }, [])

  const clearEmphasis = useCallback(() => {
    searchReturnRef.current = null
    setFocusedId(null)
    setFocusedEdgeId(null)
    setQuery("")
  }, [])

  // The single Esc authority. If the current focus was entered FROM a search,
  // pop back to that search (restore query + active match, bump restoreSignal
  // so the box refocuses); otherwise clear focus/search outright. Returns which
  // branch ran so the caller can decide whether to blur the input.
  //
  // Both the window listener (below, fires when focus is on the canvas) and the
  // search input's own Esc handler call this. Routing both through one function
  // means the outcome no longer depends on *where* the keydown lands — the
  // earlier window-only version silently dropped focus whenever the input kept
  // focus after Enter, because the input's handler cleared instead.
  const handleEscape = useCallback((): "restored" | "cleared" => {
    const saved = searchReturnRef.current
    if (saved && focusedId) {
      searchReturnRef.current = null
      setFocusedId(null)
      setQuery(saved.query)
      setActiveMatch(saved.activeMatch)
      setRestoreSignal((n) => n + 1)
      return "restored"
    }
    clearEmphasis()
    return "cleared"
  }, [focusedId, clearEmphasis])

  // Esc while focus is on the canvas (the search input is blurred after Enter).
  // The input's own Esc handler runs first and preventDefaults, so this never
  // double-fires while typing; dialogs likewise consume Esc before the window.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      handleEscape()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [handleEscape])

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
    toggleEdgeFocus,
    focusFromSearch,
    handleEscape,
    clearEmphasis,
    search,
    fitIds,
  }
}
