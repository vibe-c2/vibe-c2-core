import { forwardRef, type ReactNode } from "react"

import "./wiki-chips.css"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// Minimal user shape the chip needs. Both the operation-member query
// (`UserFields` projection) and the resolved task assignees fragment
// satisfy this — callers don't have to re-project before rendering.
export interface WikiUserChipUser {
  id: string
  username: string
  /** Optional inactivity flag — surfaces a struck-through, muted variant. */
  active?: boolean | null
}

interface WikiUserChipViewProps {
  user: WikiUserChipUser
  selected?: boolean
  /**
   * When `interactive` is true and an `onClick` is provided, the chip renders
   * as a button. Without `onClick`, or when `interactive` is false, it renders
   * as a static span — appropriate for static lists where the click would
   * have no useful target.
   */
  interactive?: boolean
  onClick?: () => void
  /**
   * When set, a trailing close button is rendered inside the chip. Providing
   * this prop forces the chip into a non-interactive span container so the
   * remove button isn't nested inside another button.
   */
  onRemove?: () => void
  removeAriaLabel?: string
}

/**
 * People token shared across operator-display surfaces (assignee pickers
 * today; future task cards, details dialogs, member lists). Mirrors the
 * structure and class naming of `WikiDocumentChipView` / `WikiCredentialChipView`
 * with an amber accent so the three chip flavors sit visually adjacent.
 *
 * Note: there is no `WikiUserChipById` wrapper — the GraphQL `user(id)` query
 * requires `user:read` (admin-only), so non-admin operators can't hydrate a
 * user from an id. Callers pass the user object directly; in practice every
 * surface that renders an assignee already has it (operation members, task
 * assignees, etc.).
 */
export const WikiUserChipView = forwardRef<
  HTMLElement,
  WikiUserChipViewProps
>(function WikiUserChipView(
  { user, selected, interactive = false, onClick, onRemove, removeAriaLabel },
  ref,
) {
  const isActive = user.active !== false
  // `onRemove` embeds a nested button → outer chip must be a span.
  const effectiveInteractive = onRemove ? false : interactive && !!onClick

  const body: ReactNode = (
    <span className="wiki-user-chip__name">{user.username}</span>
  )

  const className = cn(
    "wiki-user-chip",
    !isActive && "wiki-user-chip--inactive",
    selected && "is-selected",
  )

  const removeNode = onRemove ? (
    <ChipRemoveButton
      onClick={onRemove}
      ariaLabel={removeAriaLabel ?? `Remove ${user.username}`}
    />
  ) : null

  if (effectiveInteractive) {
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={onClick}
        className={className}
        title={user.username}
      >
        {body}
      </button>
    )
  }

  return (
    <span
      ref={ref as React.Ref<HTMLSpanElement>}
      className={className}
      title={user.username}
    >
      {body}
      {removeNode}
    </span>
  )
})

// Trailing remove control. Identical to the helpers in the document and
// credential chip views — kept local rather than centralized to avoid a
// shared-utility module just for one ~15-line button.
function ChipRemoveButton({
  onClick,
  ariaLabel,
}: {
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      className="wiki-chip-remove"
      aria-label={ariaLabel}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <XIcon />
    </button>
  )
}
