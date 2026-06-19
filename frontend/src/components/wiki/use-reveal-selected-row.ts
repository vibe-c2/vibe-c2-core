import { useEffect, useRef } from "react"
import type { Virtualizer } from "@tanstack/react-virtual"
import { useWikiStore } from "@/stores/wiki"
import type { FlatRow } from "@/components/wiki/use-flattened-wiki-tree"

/**
 * Center the selected document's row in the virtualized tree — once per id.
 *
 * Centering happens exactly once each time the selection changes, never again
 * for that id. The effect re-runs on every flatRows change (expand/collapse
 * anywhere regenerates the list), so re-centering on each run would yank the
 * settled selection around whenever the user touches an unrelated subtree.
 *
 * The "once" is timing-sensitive on a hard reload: the tree fills in layer by
 * layer (the page-level reveal-path effect expands ancestors, then each
 * branch's children stream in), so the target's index keeps shifting AND the
 * scroll container may not be laid out yet on the first attempt — a single
 * scrollToIndex would no-op and leave the user pinned at the top.
 *
 * Strategy, in order:
 * - Target not in the list yet → wait for the next flatRows update.
 * - Already revealed this id → done; ignore all later flatRows churn.
 * - Skeleton rows still ABOVE the target → the layout above is unsettled and
 *   the index will shift; nudge toward it but don't finalize (don't lock the
 *   id), so the final center uses the settled layout.
 * - Nothing loading above → lock the id and retry across a few animation
 *   frames until the row is actually in the rendered window (covers the
 *   not-yet-measured-container case).
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

    // Already centered this id → leave it; only a selection change re-arms the
    // reveal. Without this, expanding a subtree above the row streams skeletons
    // above it and the chase below would re-center the settled selection.
    if (revealedIdRef.current === selectedDocumentId) return

    // Path above the target still loading → index will shift; chase but don't
    // lock so the final center uses the settled layout.
    const skeletonsAbove = flatRows
      .slice(0, index)
      .some((r) => r.kind === "skeleton")
    if (skeletonsAbove) {
      virtualizer.scrollToIndex(index, { align: "center" })
      return
    }

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
