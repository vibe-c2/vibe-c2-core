import { useEffect, useRef } from "react"
import { EyeOffIcon } from "lucide-react"

// A single, graph-level context menu shared by every identity node — opened by
// React Flow's onNodeContextMenu in topology-view and positioned at the cursor.
// Replaces the previous per-node base-ui ContextMenu (one mounted provider per
// identity pill), which was pure overhead on a dense users lens. Self-dismisses
// on outside pointer-down, Esc, scroll, or window blur.

export interface NodeMenuState {
  x: number
  y: number
  user: string
}

interface NodeContextMenuProps {
  menu: NodeMenuState
  onHide: (user: string) => void
  onClose: () => void
}

export function NodeContextMenu({ menu, onHide, onClose }: NodeContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    // Capture so a scroll/pointer anywhere (including inside React Flow's own
    // panes) dismisses before it does anything else.
    window.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("scroll", onClose, true)
    window.addEventListener("blur", onClose)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("scroll", onClose, true)
      window.removeEventListener("blur", onClose)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-44 overflow-hidden rounded-md border bg-popover p-1 text-sm shadow-md"
      style={{ left: menu.x, top: menu.y }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onHide(menu.user)
          onClose()
        }}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
      >
        <EyeOffIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">
          Hide <span className="font-mono">{menu.user}</span>
        </span>
      </button>
    </div>
  )
}
