import { useEffect, useRef } from "react"
import { CopyIcon, EyeOffIcon, ListIcon, PencilIcon } from "lucide-react"
import type { HostFieldsFragment } from "@/graphql/gql/graphql"
import type { LeafSubnetEntry } from "@/lib/topology/derive"

// A single, graph-level context menu shared by every host card and identity
// node — opened by React Flow's onNodeContextMenu in topology-view and
// positioned at the cursor. Replaces the previous per-node base-ui ContextMenu
// (one mounted provider per identity pill), which was pure overhead on a dense
// users lens. Self-dismisses on outside pointer-down, Esc, scroll, or window
// blur.

// The aggregated list a "View" action hands to the dialog. The lens collapses
// single-member subnets / lone ghost sources / single-host accounts into one
// node each, so this is the only place their members can be read off.
export type AggregateMenuData =
  | { kind: "leaf-subnets"; entries: LeafSubnetEntry[] }
  | { kind: "lone-sources"; labels: string[] }
  | { kind: "local-identities"; users: string[] }

export type NodeMenuState = { x: number; y: number } & (
  | { kind: "identity"; user: string }
  | { kind: "host"; host: HostFieldsFragment }
  // A single ghost node (phantom gateway/subnet/host): one value worth copying.
  // `copyLabel` names it for both the menu item and the toast.
  | { kind: "copy"; copyLabel: string; value: string }
  // An aggregate node: open the read-only view dialog to copy its members.
  | { kind: "aggregate"; title: string; data: AggregateMenuData }
)

interface NodeContextMenuProps {
  menu: NodeMenuState
  onHide: (user: string) => void
  onEdit: (host: HostFieldsFragment) => void
  onCopy: (value: string, label: string) => void
  onView: (menu: Extract<NodeMenuState, { kind: "aggregate" }>) => void
  onClose: () => void
}

export function NodeContextMenu({
  menu,
  onHide,
  onEdit,
  onCopy,
  onView,
  onClose,
}: NodeContextMenuProps) {
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
      {menu.kind === "host" && (
        <MenuItem
          Icon={PencilIcon}
          onClick={() => onEdit(menu.host)}
          onClose={onClose}
        >
          Edit
        </MenuItem>
      )}
      {menu.kind === "identity" && (
        <MenuItem
          Icon={EyeOffIcon}
          onClick={() => onHide(menu.user)}
          onClose={onClose}
        >
          Hide <span className="font-mono">{menu.user}</span>
        </MenuItem>
      )}
      {menu.kind === "copy" && (
        <MenuItem
          Icon={CopyIcon}
          onClick={() => onCopy(menu.value, menu.copyLabel)}
          onClose={onClose}
        >
          Copy {menu.copyLabel}
        </MenuItem>
      )}
      {menu.kind === "aggregate" && (
        <MenuItem Icon={ListIcon} onClick={() => onView(menu)} onClose={onClose}>
          View {menu.title.toLowerCase()}
        </MenuItem>
      )}
    </div>
  )
}

function MenuItem({
  Icon,
  onClick,
  onClose,
  children,
}: {
  Icon: typeof EyeOffIcon
  onClick: () => void
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onClick()
        onClose()
      }}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{children}</span>
    </button>
  )
}
