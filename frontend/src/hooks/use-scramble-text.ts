import { useEffect, useState } from "react"
import { scrambleAt } from "@/lib/text-scramble"

const DEFAULT_DURATION_MS = 900
const FRAME_MS = 40 // ~25fps is enough for glyph flicker and cheaper than rAF

// Returns `text` after a short scramble-to-resolve animation on mount.
// Users who prefer reduced motion get the final text immediately.
export function useScrambleText(text: string, durationMs = DEFAULT_DURATION_MS): string {
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? text : scrambleAt(text, 0)))

  useEffect(() => {
    // Initial state already holds the final text in this case.
    if (prefersReducedMotion()) return
    const start = performance.now()
    const timer = window.setInterval(() => {
      const progress = (performance.now() - start) / durationMs
      setDisplay(scrambleAt(text, progress))
      if (progress >= 1) window.clearInterval(timer)
    }, FRAME_MS)
    return () => window.clearInterval(timer)
  }, [text, durationMs])

  return display
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}
