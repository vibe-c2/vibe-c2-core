import { useEffect, useRef } from "react"
import type { Virtualizer } from "@tanstack/react-virtual"
import { useWikiStore } from "@/stores/wiki"
import type { FlatRow } from "@/components/wiki/use-flattened-wiki-tree"

/**
 * Center the selected document's row in the virtualized tree.
 *
 * This is timing-sensitive on a hard reload: the tree fills in layer by layer
 * (the page-level reveal-path effect expands ancestors, then each branch's
 * children stream in), so the target's index keeps shifting AND the scroll
 * container may not be laid out yet on the first attempt — a single
 * scrollToIndex would no-op and leave the user pinned at the top.
 *
 * Strategy:
 * - Target not in the list yet → wait for the next flatRows update.
 * - Skeleton rows still ABOVE the target → the layout above is unsettled and
 *   the index will shift; nudge toward it but don't finalize.
 * - Nothing loading above → the index is final; finalize once per id and retry
 *   across a few animation frames until the row is actually in the rendered
 *   window (covers the not-yet-measured-container case).
 *
 * `align: "center"` parks the row mid-viewport (`"auto"` would pin it to the
 * bottom edge).
 */
export function useRevealSelectedRow(
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  flatRows: FlatRow[],
): void {
  const selectedDocumentId = useWikiStore((s) => s.selectedDocumentId)
  const revealedIdRef = useRef<string | null>(null)
  const revealRafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!selectedDocumentId) {
      revealedIdRef.current = null
      if (revealRafRef.current != null) {
        cancelAnimationFrame(revealRafRef.current)
        revealRafRef.current = null
      }
      return
    }

    const index = flatRows.findIndex(
      (r) => r.kind === "node" && r.node.id === selectedDocumentId,
    )
    if (index < 0) return // ancestors still expanding — wait for next flatRows

    // Path above the target still loading → index will shift; chase but don't
    // lock so the final center uses the settled layout.
    const skeletonsAbove = flatRows
      .slice(0, index)
      .some((r) => r.kind === "skeleton")
    if (skeletonsAbove) {
      virtualizer.scrollToIndex(index, { align: "center" })
      return
    }

    if (revealedIdRef.current === selectedDocumentId) return
    revealedIdRef.current = selectedDocumentId

    let frames = 0
    const tick = () => {
      virtualizer.scrollToIndex(index, { align: "center" })
      frames += 1
      const landed = virtualizer
        .getVirtualItems()
        .some((vi) => vi.index === index)
      revealRafRef.current =
        landed || frames >= 10 ? null : requestAnimationFrame(tick)
    }
    revealRafRef.current = requestAnimationFrame(tick)
  }, [selectedDocumentId, flatRows, virtualizer])

  // Cancel any in-flight reveal retry on unmount.
  useEffect(
    () => () => {
      if (revealRafRef.current != null) cancelAnimationFrame(revealRafRef.current)
    },
    [],
  )
}
