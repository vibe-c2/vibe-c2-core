import {
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type RefObject,
} from "react"

/** Smallest the preview panel can be dragged before it stops shrinking — enough
 *  to keep the frame usable rather than collapsing it to a sliver. */
const MIN_PREVIEW_HEIGHT = 160
/** CSS custom property the frame reads for its height. The committed value is
 *  written from a layout effect; the live drag mutates it directly (no React
 *  render per pixel). The stylesheet default applies whenever it's unset. */
const PREVIEW_HEIGHT_VAR = "--wiki-preview-height"
/** How close (px) the pointer must get to the scroll container's top/bottom edge
 *  before the drag starts auto-scrolling so the frame can keep growing. */
const PREVIEW_AUTOSCROLL_EDGE = 64
/** Fastest the auto-scroll advances per animation frame, at the very edge. The
 *  preview grows by the same amount each frame so the grip tracks the pointer. */
const PREVIEW_AUTOSCROLL_MAX_STEP = 22

interface PreviewResizeHandleProps {
  /** Panel element whose height variable the handle owns. */
  containerRef: RefObject<HTMLDivElement | null>
  /** The active iframe — measured to seed the drag height. */
  frameRef: RefObject<HTMLIFrameElement | null>
  /** Committed height in px, or null for the stylesheet default. */
  height: number | null
  /** Commits the final height once the drag ends. */
  onCommit: (height: number) => void
}

// Drag handle pinned to the bottom edge of the preview panel. Mirrors the
// sidebar ResizeHandle approach: during the drag we mutate the panel's height
// variable directly — no React render, no state write per pixel — and commit to
// the card's state once on mouseup. The body gets `wiki-preview-resizing` for
// the duration so the cursor stays consistent and the iframe drops
// pointer-events (otherwise the frame swallows mousemove and the drag stalls
// the instant the pointer crosses into it).
//
// Auto-scroll: holding the pointer near the scroll container's bottom edge
// keeps growing the frame — each animation frame the container scrolls down a
// step and the frame grows by the same step, so the grip stays under the
// pointer and you can drag well past the visible viewport. Holding near the top
// edge does the reverse, shrinking while scrolling back up.
export function PreviewResizeHandle({
  containerRef,
  frameRef,
  height,
  onCommit,
}: PreviewResizeHandleProps): ReactElement {
  // All drag state lives in refs so the rAF loop and the mousemove handler
  // share it without re-rendering. heightRef is the single source of truth for
  // the live frame height; prevYRef tracks the last pointer Y for incremental
  // (non-edge) dragging; pointerYRef is the latest viewport Y the auto-scroll
  // loop reads each frame.
  const heightRef = useRef(0)
  const startHeightRef = useRef(0)
  const prevYRef = useRef(0)
  const pointerYRef = useRef(0)
  const rafRef = useRef(0)

  // Apply the committed height — including on mount, so a height carried over
  // from a previous expand is restored. A layout effect writes it before paint,
  // avoiding a one-frame flash at the stylesheet default. The drag mutates the
  // same variable directly and commits via onCommit, which re-runs this with the
  // matching value, so there's no jump.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (height == null) container.style.removeProperty(PREVIEW_HEIGHT_VAR)
    else container.style.setProperty(PREVIEW_HEIGHT_VAR, `${height}px`)
  }, [height, containerRef])

  // Stop a runaway loop if the panel is unmounted mid-drag (e.g. the card is
  // collapsed from elsewhere). mouseup already cancels it on the normal path.
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  function handleMouseDown(e: ReactMouseEvent): void {
    e.preventDefault()
    e.stopPropagation()
    const frame = frameRef.current
    const container = containerRef.current
    if (!frame || !container) return

    const scroller = findScrollParent(container)
    heightRef.current = frame.getBoundingClientRect().height
    startHeightRef.current = heightRef.current
    prevYRef.current = e.clientY
    pointerYRef.current = e.clientY

    const applyHeight = (): void => {
      container.style.setProperty(PREVIEW_HEIGHT_VAR, `${heightRef.current}px`)
    }

    // One auto-scroll tick. When the pointer sits inside the bottom edge band we
    // grow the frame and scroll down by the same step (growing first extends the
    // scrollable area so the scroll has room). The top band mirrors it, bounded
    // by both the minimum height and how far we can still scroll up.
    const tick = (): void => {
      const { bottom, top } = edgeDepths(scroller, pointerYRef.current)

      if (bottom > 0) {
        const step = edgeStep(bottom)
        heightRef.current += step
        applyHeight()
        scroller.scrollTop += step
      } else if (top > 0 && scroller.scrollTop > 0) {
        const room = Math.min(heightRef.current - MIN_PREVIEW_HEIGHT, scroller.scrollTop)
        const step = Math.min(edgeStep(top), room)
        if (step > 0) {
          heightRef.current -= step
          applyHeight()
          scroller.scrollTop -= step
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    function onMouseMove(ev: MouseEvent): void {
      pointerYRef.current = ev.clientY
      // While the pointer is in an edge band the rAF loop owns the height, so
      // skip the manual delta to avoid double-counting. Elsewhere, apply the
      // incremental pointer movement directly for a 1:1 feel.
      const { bottom, top } = edgeDepths(scroller, ev.clientY)
      if (bottom <= 0 && top <= 0) {
        heightRef.current = Math.max(
          MIN_PREVIEW_HEIGHT,
          heightRef.current + (ev.clientY - prevYRef.current),
        )
        applyHeight()
      }
      prevYRef.current = ev.clientY
    }

    function onMouseUp(): void {
      cancelAnimationFrame(rafRef.current)
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
      document.body.classList.remove("wiki-preview-resizing")
      // Commit once. React re-renders the panel with the same variable value,
      // so there is no visible jump.
      const final = Math.round(heightRef.current)
      if (final !== Math.round(startHeightRef.current)) {
        onCommit(final)
      }
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
    document.body.classList.add("wiki-preview-resizing")
    rafRef.current = requestAnimationFrame(tick)
  }

  return (
    <div
      className="wiki-file-preview-resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize preview"
      onMouseDown={handleMouseDown}
      onClick={swallowClick}
    >
      <span className="wiki-file-preview-resize-grip" aria-hidden="true" />
    </div>
  )
}

// How far the pointer has pushed past each edge band's inner border, in px.
// Positive means inside the band (auto-scroll territory); zero or negative means
// clear of it. Both branches read the same numbers so they can't drift.
function edgeDepths(
  scroller: HTMLElement,
  y: number,
): { bottom: number; top: number } {
  const bounds = scrollerBounds(scroller)
  return {
    bottom: y - (bounds.bottom - PREVIEW_AUTOSCROLL_EDGE),
    top: bounds.top + PREVIEW_AUTOSCROLL_EDGE - y,
  }
}

// Per-frame auto-scroll distance: scales from 0 at the edge band's inner border
// up to PREVIEW_AUTOSCROLL_MAX_STEP right at the container edge, so the closer
// the pointer is to the edge the faster it scrolls.
function edgeStep(depth: number): number {
  const factor = Math.min(1, depth / PREVIEW_AUTOSCROLL_EDGE)
  return factor * PREVIEW_AUTOSCROLL_MAX_STEP
}

// Nearest scrollable ancestor — the element the drag auto-scrolls. Walks up from
// the panel looking for a vertical overflow that actually has room to scroll;
// falls back to the document scroller (window-level scrolling) when the editor
// content isn't inside its own scroll box.
function findScrollParent(el: HTMLElement): HTMLElement {
  let node = el.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node
    }
    node = node.parentElement
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

// The scroller's visible top/bottom in viewport coordinates. The document
// scroller spans the whole window; a nested scroll box is bounded by its rect.
function scrollerBounds(scroller: HTMLElement): { top: number; bottom: number } {
  if (
    scroller === document.scrollingElement ||
    scroller === document.documentElement ||
    scroller === document.body
  ) {
    return { top: 0, bottom: window.innerHeight }
  }
  const rect = scroller.getBoundingClientRect()
  return { top: rect.top, bottom: rect.bottom }
}

// The handle's own click must not reach ProseMirror — a stray click inside the
// node view would move the selection. mousedown is already prevented; this
// covers the click that follows.
function swallowClick(e: ReactMouseEvent): void {
  e.preventDefault()
  e.stopPropagation()
}
