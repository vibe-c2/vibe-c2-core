// Render a drawing's scene as a static SVG.
//
// Used by the print route, where a live canvas is the wrong thing: Excalidraw
// draws to a <canvas> sized to the viewport, so printing one captures what
// happens to be on screen rather than the diagram. An SVG of the whole scene
// prints at any scale and stays selectable text where the diagram has labels.
//
// This module imports the library, so it is loaded through React.lazy by
// whoever needs it — same boundary as the canvas itself.

import { useEffect, useRef, useState } from "react"
import { exportToSvg } from "@excalidraw/excalidraw"

import { useHocuspocus } from "@/hooks/use-hocuspocus"
import { readElements, readSharedAppState } from "./drawing-scene"
import { wikiImageFiles } from "./drawing-images"

interface WikiDrawingSvgProps {
  documentId: string
  /** Fires once the scene has been rendered into the DOM — or once it is known
   * that there is nothing to render. Either way the caller can stop waiting. */
  onReady?: () => void
}

export default function WikiDrawingSvg({ documentId, onReady }: WikiDrawingSvgProps) {
  const { ydoc, isReady } = useHocuspocus(documentId)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [empty, setEmpty] = useState(false)

  // onReady is a lifecycle signal, not a subscription: the print route calls
  // window.print() on it, and firing twice would open two dialogs.
  const readyFiredRef = useRef(false)

  useEffect(() => {
    if (!isReady) return
    let cancelled = false

    async function render() {
      const host = hostRef.current
      if (!host) return

      const elements = readElements(ydoc).filter((el) => !el.isDeleted)
      if (elements.length === 0) {
        setEmpty(true)
        return
      }

      const svg = await exportToSvg({
        elements,
        appState: {
          ...readSharedAppState(ydoc),
          exportBackground: false,
          exportWithDarkMode: false,
        },
        files: wikiImageFiles(elements),
        exportPadding: 16,
      })

      if (cancelled) return

      // Drop the intrinsic width/height so the SVG scales to the print
      // column; the viewBox exportToSvg sets is what preserves the aspect
      // ratio. Without this a wide diagram prints cropped at the page edge.
      svg.removeAttribute("width")
      svg.removeAttribute("height")
      svg.style.maxWidth = "100%"
      svg.style.height = "auto"

      host.replaceChildren(svg)
    }

    render()
      .catch((error) => {
        // A failed render must not leave the print route waiting for a signal
        // that will never come — it would sit on its timeout and then print a
        // blank page with no explanation.
        console.error("Failed to render drawing for print:", error)
        setEmpty(true)
      })
      .finally(() => {
        if (cancelled || readyFiredRef.current) return
        readyFiredRef.current = true
        onReady?.()
      })

    return () => {
      cancelled = true
    }
  }, [isReady, ydoc, onReady])

  if (empty) {
    return <p className="text-sm italic text-muted-foreground">This drawing is empty.</p>
  }

  return <div ref={hostRef} className="wiki-drawing-svg" />
}
