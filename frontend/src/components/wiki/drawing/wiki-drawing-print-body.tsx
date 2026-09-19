// A drawing's body on the print route.
//
// The prose route mounts the real editor read-only so the PDF matches what is
// on screen exactly. A canvas cannot do that: Excalidraw renders to a <canvas>
// sized to the viewport, and printing one gives you the visible viewport
// rather than the drawing. So the page is printed from a static SVG of the
// whole scene, laid out to the page width — which is also what makes the
// result scale-independent, as a PDF of a diagram should be.

import { Suspense, lazy } from "react"
import { Skeleton } from "@/components/ui/skeleton"

const DrawingSvg = lazy(() => import("./wiki-drawing-svg"))

interface WikiDrawingPrintBodyProps {
  documentId: string
  /** Fires once the scene has been rendered, so the route knows it is safe to
   * open the print dialog. */
  onReady: () => void
}

export function WikiDrawingPrintBody({
  documentId,
  onReady,
}: WikiDrawingPrintBodyProps) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <DrawingSvg documentId={documentId} onReady={onReady} />
    </Suspense>
  )
}
