import { useEffect, useRef, useState, type RefObject } from "react"

interface Options {
  /**
   * Distance outside the viewport to start treating the element as visible.
   * Lets you pre-fetch / pre-render slightly before the element scrolls
   * into view so the user doesn't watch a placeholder swap in.
   * Defaults to "200px" — roughly one viewport-eighth on a desktop screen.
   */
  rootMargin?: string
}

interface Result<T extends Element> {
  ref: RefObject<T | null>
  isVisible: boolean
}

/**
 * Sticky viewport sensor. `isVisible` flips false → true the first time the
 * referenced element intersects the viewport (expanded by `rootMargin`),
 * then stays true forever. The IntersectionObserver disconnects after the
 * first hit so we don't keep paying for observation once the element has
 * already done what it needed to do (e.g. fire a one-shot GraphQL query).
 *
 * Use this to defer expensive per-element work — query fan-out, animation,
 * heavy decoration — until the element is actually about to appear. Pairs
 * naturally with TanStack Query's `enabled` flag.
 */
export function useInViewport<T extends Element>(
  options?: Options,
): Result<T> {
  const ref = useRef<T | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const rootMargin = options?.rootMargin ?? "200px"

  useEffect(() => {
    if (isVisible) return
    const el = ref.current
    if (!el) return

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setIsVisible(true)
          obs.disconnect()
        }
      },
      { rootMargin },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [isVisible, rootMargin])

  return { ref, isVisible }
}
