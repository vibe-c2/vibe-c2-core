import { useEffect, type RefObject } from "react"

import { findScrollParent } from "@/lib/scroll-parent"

/**
 * Holds the document's scroll position across a full-screen overlay.
 *
 * A lightbox covers the page, so the reader cannot scroll what is underneath
 * while it is open: wherever they were when they opened it is where they
 * expect to be when they close it. Anything that moved the scroller in the
 * meantime moved it without the reader asking, and on a long document that
 * means losing your place entirely.
 *
 * This is a guard, not a cure. The overlay's own teardown (focus restoration,
 * the scroll-lock class the library puts on <body>, and the relayout both
 * cause) is asynchronous and interacts with the browser's scroll anchoring,
 * which is active here because nothing sets overflow-anchor. Rather than chase
 * each of those, we record the position while the overlay is up and put it
 * back once it is gone.
 *
 * @param active   Whether the overlay is currently open.
 * @param anchorRef Any element inside the scrolling document — used only to
 *                  locate the scroll container.
 */
export function usePreservedScroll(
  active: boolean,
  anchorRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return
    const scroller = findScrollParent(anchorRef.current)
    if (!scroller) return
    const top = scroller.scrollTop

    return () => {
      // Two frames out: the first lets React commit the unmount, the second
      // lets the overlay's own restoration work (focus, <body> class removal)
      // and the relayout it triggers settle. Restoring earlier would be
      // overwritten by them.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (scroller.isConnected && scroller.scrollTop !== top) {
            scroller.scrollTop = top
          }
        })
      })
    }
  }, [active, anchorRef])
}
