import { useCallback, useRef, type RefObject } from "react"

interface ResizeHandleProps {
  currentWidth: number
  onResize: (width: number) => void
  // Sidebar element whose `--wiki-sidebar-width` we mutate directly during
  // the drag. Bypassing React keeps the resize off the render path entirely
  // — the store + localStorage write only happens once, on mouseup.
  sidebarRef: RefObject<HTMLDivElement | null>
  minWidth?: number
  maxWidth?: number
}

export function ResizeHandle({
  currentWidth,
  onResize,
  sidebarRef,
  minWidth = 200,
  maxWidth = 480,
}: ResizeHandleProps) {
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const finalWidthRef = useRef(0)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      startXRef.current = e.clientX
      startWidthRef.current = currentWidth
      finalWidthRef.current = currentWidth

      function onMouseMove(ev: MouseEvent) {
        const delta = ev.clientX - startXRef.current
        const next = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta))
        finalWidthRef.current = next
        // Direct DOM mutation — no React render, no store update, no
        // localStorage write per pixel. The browser repaints from the new
        // variable value on the next frame.
        sidebarRef.current?.style.setProperty(
          "--wiki-sidebar-width",
          `${next}px`,
        )
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove)
        document.removeEventListener("mouseup", onMouseUp)
        document.body.classList.remove("select-none", "cursor-col-resize")
        // Commit once: store + localStorage. React then re-renders the
        // sidebar with the same width via inline style; the variable's
        // value matches, so there is no visible change.
        if (finalWidthRef.current !== startWidthRef.current) {
          onResize(finalWidthRef.current)
        }
      }

      document.addEventListener("mousemove", onMouseMove)
      document.addEventListener("mouseup", onMouseUp)
      document.body.classList.add("select-none", "cursor-col-resize")
    },
    [currentWidth, onResize, sidebarRef, minWidth, maxWidth],
  )

  return (
    <div
      className="relative z-10 w-px shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/30 active:bg-primary/50 before:absolute before:inset-y-0 before:-left-1.5 before:w-3 before:content-['']"
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
    />
  )
}
