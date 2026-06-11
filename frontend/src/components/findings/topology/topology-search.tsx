import { useCallback, useEffect, useRef } from "react"
import { Panel, useReactFlow } from "@xyflow/react"
import { SearchIcon, XIcon } from "lucide-react"
import type { TopologySearchState } from "@/components/findings/topology/use-emphasis"

// Find-and-fly over the topology canvas. The view owns the state (query,
// match ids, active index) so search composes with the other emphasis
// sources; this component owns the input UX and the viewport flying.
//
// Keyboard: "/" focuses the input from anywhere on the page, Enter / ↓ and
// Shift+Enter / ↑ cycle matches, Esc clears and returns to the canvas.
// Rendered as a React Flow <Panel> so typing and text-selection drags never
// pan/zoom the canvas underneath.

const FLY_DURATION_MS = 400
// Never fly DOWN to a match: zooming out is the user's orientation choice.
// But if they're parked deep in one corner, a bare setCenter would land on a
// sub-pixel node — lift to at least a readable zoom.
const FLY_MIN_ZOOM = 0.9

export function TopologySearch({
  query,
  onQueryChange,
  matchIds,
  activeIndex,
  onActiveIndexChange,
}: TopologySearchState) {
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
      cycle(event.shiftKey ? -1 : 1)
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      cycle(1)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      cycle(-1)
    } else if (event.key === "Escape") {
      event.preventDefault()
      clear()
    }
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
            title="Enter / ↑↓ to cycle matches"
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
