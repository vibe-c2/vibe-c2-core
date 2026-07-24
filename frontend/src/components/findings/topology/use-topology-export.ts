import { useCallback, useState } from "react"
import {
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  useStore,
  type Rect,
} from "@xyflow/react"
import { toPng, toSvg } from "html-to-image"
import { toast } from "sonner"
import { buildExportFilename, triggerDownload } from "@/lib/file-export"
import type { TopologyRelation } from "@/stores/hosts"

export type TopologyImageFormat = "png" | "svg"

// Real pixel breathing room around the graph on every side of the exported
// frame. Added to the canvas (not carved out of it), so the graph itself
// renders at native scale whenever it fits.
const MARGIN_PX = 64
// Cap the exported canvas below the browser's max-canvas-dimension (~16k in
// Chrome/Firefox). A graph larger than this is scaled down to fit rather than
// silently clipped. The inner cap leaves room for the two margins.
const MAX_DIMENSION = 12000
const MAX_INNER = MAX_DIMENSION - MARGIN_PX * 2

interface UseTopologyExportArgs {
  relation: TopologyRelation
  // Toggles React Flow's `onlyRenderVisibleElements`. Virtualization MUST be
  // off during capture: with it on, off-screen nodes are unmounted and would be
  // absent from the DOM clone html-to-image snapshots. The caller restores it.
  setVirtualize: (on: boolean) => void
}

// Client-side "export the current topology to an image". Works off the single
// live React Flow instance: it frames the whole graph (not just the on-screen
// viewport) by computing a synthetic transform from the bounds of every node,
// then rasterizes the `.react-flow__viewport` DOM — the only reliable capture
// for React Flow's HTML-nodes + SVG-edges split.
export function useTopologyExport({
  relation,
  setVirtualize,
}: UseTopologyExportArgs) {
  const { getNodes } = useReactFlow()
  // This flow's root element, scoped to the instance (not a document-global
  // query that would grab the first flow/minimap on the page).
  const domNode = useStore((s) => s.domNode)
  const [isExporting, setIsExporting] = useState(false)

  const exportImage = useCallback(
    async (format: TopologyImageFormat) => {
      if (isExporting) return
      setIsExporting(true)
      // Mount every node so the clone covers the whole graph.
      setVirtualize(false)
      try {
        // Two frames: one for React to commit the un-virtualized node set,
        // one for the browser to paint it before we snapshot the DOM.
        await nextFrame()
        await nextFrame()

        const viewportEl =
          domNode?.querySelector<HTMLElement>(".react-flow__viewport")
        if (!viewportEl) throw new Error("topology viewport not found")

        const nodes = getNodes()
        if (nodes.length === 0) throw new Error("nothing to export")

        const bounds = getNodesBounds(nodes)
        const { width, height, transform } = frameFor(bounds)
        // Solid, theme-matched background (the Hosts map sits on `bg-card`).
        const backgroundColor = resolveCssColor("--color-card", "#ffffff")

        // toSvg ignores pixelRatio, so one options object serves both formats.
        const capture = format === "png" ? toPng : toSvg
        const dataUrl = await capture(viewportEl, {
          backgroundColor,
          width,
          height,
          // Nudge sharpness while keeping the final bitmap under the cap.
          pixelRatio: Math.min(2, MAX_DIMENSION / Math.max(width, height)),
          // Override the live pan/zoom on the clone so the frame holds the
          // whole graph regardless of where the operator left the camera.
          style: {
            width: `${width}px`,
            height: `${height}px`,
            transform,
          },
        })

        // "identities" is the internal relation key; "users" is the
        // operator-facing name (see the RelationPicker), so the file is named
        // the way the UI reads.
        const slug = relation === "identities" ? "users" : relation
        triggerDownload(dataUrl, buildExportFilename("topology", slug, format))
        toast.success(`Exported topology as ${format.toUpperCase()}`)
      } catch {
        toast.error("Couldn’t export the topology")
      } finally {
        setVirtualize(true)
        setIsExporting(false)
      }
    },
    [domNode, getNodes, isExporting, relation, setVirtualize],
  )

  return { exportImage, isExporting }
}

// Size a canvas that holds the whole graph plus a fixed pixel margin, and the
// transform that centers the graph in it. When the graph exceeds MAX_INNER it
// is scaled down (`fit` < 1) to stay under the browser canvas cap; otherwise it
// renders 1:1. maxZoom is pinned to `fit` so the padding-0 fit can never zoom
// past native scale and crop.
function frameFor(bounds: Rect): {
  width: number
  height: number
  transform: string
} {
  const fit = Math.min(
    1,
    MAX_INNER / Math.max(bounds.width, 1),
    MAX_INNER / Math.max(bounds.height, 1),
  )
  const width = Math.max(1, Math.ceil(bounds.width * fit) + MARGIN_PX * 2)
  const height = Math.max(1, Math.ceil(bounds.height * fit) + MARGIN_PX * 2)
  const viewport = getViewportForBounds(bounds, width, height, 0.001, fit, 0)
  const transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`
  return { width, height, transform }
}

// CSS custom properties resolve to `var(--…)` via getPropertyValue, which
// html-to-image can't use as a color. Resolve to a concrete rgb()/oklch() by
// letting the browser compute it on a throwaway probe.
function resolveCssColor(varName: string, fallback: string): string {
  const probe = document.createElement("div")
  probe.style.color = `var(${varName})`
  probe.style.display = "none"
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  return resolved || fallback
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}
