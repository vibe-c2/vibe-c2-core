import { useCallback, useRef } from "react"

interface ResizeHandleProps {
  currentWidth: number
  onResize: (width: number) => void
  minWidth?: number
  maxWidth?: number
}

export function ResizeHandle({
  currentWidth,
  onResize,
  minWidth = 200,
  maxWidth = 480,
}: ResizeHandleProps) {
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      startXRef.current = e.clientX
      startWidthRef.current = currentWidth

      function onMouseMove(ev: MouseEvent) {
        const delta = ev.clientX - startXRef.current
        const next = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta))
        onResize(next)
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove)
        document.removeEventListener("mouseup", onMouseUp)
        document.body.classList.remove("select-none", "cursor-col-resize")
      }

      document.addEventListener("mousemove", onMouseMove)
      document.addEventListener("mouseup", onMouseUp)
      document.body.classList.add("select-none", "cursor-col-resize")
    },
    [currentWidth, onResize, minWidth, maxWidth],
  )

  return (
    <div
      className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/30 active:bg-primary/50"
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
    />
  )
}
