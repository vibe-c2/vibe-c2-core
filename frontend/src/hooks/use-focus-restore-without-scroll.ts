import { useCallback, useEffect, useRef } from "react"

/**
 * Stops a lightbox's focus restoration from scrolling the document away.
 *
 * When the lightbox closes it hands focus back to whatever held it before —
 * correct behaviour, and the reason a keyboard user is not stranded. But it
 * calls focus() with no options, and the browser then scrolls the focus target
 * into view of its own accord. For the wiki editor that target is the
 * contenteditable spanning the whole document, and the scroll it produces can
 * land the reader at the very end of a long page.
 *
 * That scroll is invisible to instrumentation: the browser performs it
 * internally, so it never passes through scrollTop, scrollTo or
 * scrollIntoView. Confirmed in a running app by forcing every focus() call to
 * be non-scrolling, which removed the jump.
 *
 * So restoring focus is kept and only its side effect is suppressed, by giving
 * the element an own focus() that defaults to preventScroll for as long as the
 * overlay is up. Nothing has to undo a scroll afterwards, because none happens.
 *
 * Usage: call the returned capture function when opening the overlay, before
 * the overlay mounts. It has to be that early — once mounted the overlay takes
 * focus itself, and by the time effects run the original holder is no longer
 * the active element.
 */
export function useFocusRestoreWithoutScroll(active: boolean): () => void {
  const targetRef = useRef<HTMLElement | null>(null)

  const capture = useCallback(() => {
    const el = document.activeElement
    targetRef.current = el instanceof HTMLElement ? el : null
  }, [])

  useEffect(() => {
    const el = targetRef.current
    if (!active || !el) return
    const release = suppressFocusScroll(el)

    return () => {
      // The overlay restores focus during its own teardown, which runs after a
      // fade-out and after this cleanup. Hold the suppression across a couple
      // of frames so the restoring call is still covered; a focus that does not
      // scroll is harmless if it lands outside that window anyway.
      requestAnimationFrame(() => requestAnimationFrame(release))
    }
  }, [active])

  return capture
}

/**
 * Shadows an element's focus() with one that defaults to preventScroll.
 * Returns the undo. Re-entrant: if the element already carries a shadow (two
 * overlays over the same target), the second call is a no-op so the first
 * one's undo stays authoritative and the prototype method is never lost.
 */
function suppressFocusScroll(el: HTMLElement): () => void {
  if (Object.prototype.hasOwnProperty.call(el, "focus")) return () => {}
  const original = el.focus.bind(el)

  el.focus = function focusWithoutScroll(options?: FocusOptions) {
    original({ ...options, preventScroll: true })
  }

  return () => {
    // Deleting the own property uncovers the prototype method again, so the
    // element is left exactly as it was found.
    Reflect.deleteProperty(el, "focus")
  }
}
