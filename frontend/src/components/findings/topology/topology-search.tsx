import { useCallback, useEffect, useRef } from "react"
import { Panel, useReactFlow } from "@xyflow/react"
import { SearchIcon, XIcon } from "lucide-react"
import type { TopologySearchState } from "@/components/findings/topology/use-emphasis"

// Find-and-fly over the topology canvas. The view owns the state (query,
// match ids, active index) so search composes with the other emphasis
// sources; this component owns the input UX and the viewport flying.
//
// Keyboard: "/" focuses the input from anywhere on the page, ↑ / ↓ cycle
// matches (up = next, down = back — directional, matching the canvas), Enter
// *selects* the active match (focuses it like a click and leaves search), Esc
// clears and returns to the canvas — unless the current focus came from
// Enter, in which case Esc steps back into the search where it left off (see
// use-emphasis). ←/→ are left alone for editing the query.
// Rendered as a React Flow <Panel> so typing and text-selection drags never
// pan/zoom the canvas underneath.

const FLY_DURATION_MS = 400
// Never fly DOWN to a match: zooming out is the user's orientation choice.
// But if they're parked deep in one corner, a bare setCenter would land on a
// sub-pixel node — lift to at least a readable zoom.
const FLY_MIN_ZOOM = 0.9

interface TopologySearchProps extends TopologySearchState {
  // Commit the active match: focus it (same as clicking the node) and leave
  // search, remembering the search so Esc can return to it. The view owns
  // focus, so it passes the hook's focusFromSearch down.
  onSelect: (nodeId: string) => void
}

export function TopologySearch({
  query,
  onQueryChange,
  matchIds,
  activeIndex,
  onActiveIndexChange,
  restoreSignal,
  onSelect,
}: TopologySearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { getNode, setCenter, getZoom } = useReactFlow()

  const flyTo = useCallback(
    (id: string) => {
      const node = getNode(id)
      if (!node) return
      // measured can lag the first paint; the layout-driven style dimensions
      // (subnet pills, leaf lists) are the next best center estimate.
      const width =
        node.measured?.width ??
        (typeof node.style?.width === "number" ? node.style.width : 0)
      const height =
        node.measured?.height ??
        (typeof node.style?.height === "number" ? node.style.height : 0)
      setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: Math.max(getZoom(), FLY_MIN_ZOOM),
        duration: FLY_DURATION_MS,
      })
    },
    [getNode, setCenter, getZoom],
  )

  // Jump as you type: when the match set changes, fly to the active match —
  // but only if it's a different node, so refining a query that keeps the
  // same best match doesn't re-trigger the animation on every keystroke.
  const lastFlownRef = useRef<string | null>(null)
  const activeId = matchIds[activeIndex] ?? null
  useEffect(() => {
    if (!activeId) {
      lastFlownRef.current = null
      return
    }
    if (lastFlownRef.current === activeId) return
    lastFlownRef.current = activeId
    flyTo(activeId)
  }, [activeId, flyTo])

  // "/" focuses the search from anywhere that isn't already a text field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable=true]"))
        return
      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // Esc popped a search-initiated focus back to search. The hook already
  // restored the query and active match; take the keyboard back so ↑ / ↓
  // continue cycling from where the user left off. No select() — the query
  // is being resumed, not replaced.
  useEffect(() => {
    if (restoreSignal > 0) inputRef.current?.focus()
  }, [restoreSignal])

  const cycle = (direction: 1 | -1) => {
    if (matchIds.length === 0) return
    onActiveIndexChange(
      (activeIndex + direction + matchIds.length) % matchIds.length,
    )
  }

  const clear = () => {
    onQueryChange("")
    inputRef.current?.blur()
  }

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      // Commit: focus the active match and step out of search. onSelect clears
      // the query (focus and search are mutually exclusive), so blur to hand
      // the keyboard back to the canvas.
      const id = matchIds[activeIndex]
      if (id) {
        onSelect(id)
        inputRef.current?.blur()
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      cycle(1) // up = next match
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      cycle(-1) // down = previous match
    } else if (event.key === "Escape") {
      event.preventDefault()
      clear()
    }
    // ←/→ fall through to the input for caret movement / query editing.
  }

  const hasQuery = query.trim().length > 0

  return (
    <Panel
      position="top-center"
      className="flex w-72 items-center gap-2 rounded-md border bg-card/90 px-2.5 shadow-sm backdrop-blur"
    >
      <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onInputKeyDown}
        placeholder="Search hosts, IPs, subnets…"
        aria-label="Search topology"
        className="h-8 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
      {hasQuery && (
        <>
          <span
            className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
            title="↑↓ to cycle matches · Enter to select"
          >
            {matchIds.length === 0
              ? "0/0"
              : `${activeIndex + 1}/${matchIds.length}`}
          </span>
          <button
            type="button"
            onClick={clear}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <XIcon className="size-3.5" />
          </button>
        </>
      )}
      {!hasQuery && (
        <kbd className="shrink-0 rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
          /
        </kbd>
      )}
    </Panel>
  )
}
