import { forwardRef, useMemo, type ReactNode } from "react"

import "./wiki-chips.css"
import { CheckCircle2Icon, KeyIcon, XCircleIcon, XIcon } from "lucide-react"
import { CredentialRowContextMenu } from "@/components/findings/credential-row-context-menu"
import { useCredential } from "@/graphql/hooks/credentials"
import { useCredentialStore } from "@/stores/credentials"
import { useInViewport } from "@/hooks/use-in-viewport"
import { GraphQLRequestError } from "@/lib/graphql-client"
import { useSha1Hashes } from "@/lib/sha1"
import { cn } from "@/lib/utils"
import type { CredentialFieldsFragment } from "@/graphql/gql/graphql"

// Short prefix length used to render a key's SHA-1 in the chip body. Mirrors
// the editor chip — see wiki-credential-chip-view.css notes for why 12.
const KEY_HASH_DISPLAY_LEN = 12

// The view accepts the full CredentialFieldsFragment because withContextMenu
// surfaces require the rich shape (tags, comments count, etc.) for the
// row-level menu. Pickers that don't use the context menu can still pass
// the same fragment — useCredential returns this exact shape, so both
// call sites stay strongly typed without an intermediate projection.
export type WikiCredentialChipCredential = CredentialFieldsFragment

interface WikiCredentialChipViewProps {
  id: string
  cred?: CredentialFieldsFragment | null
  isLoading?: boolean
  error?: unknown
  selected?: boolean
  /**
   * When true, the loaded chip is a button that triggers the click handler
   * (defaults to opening the credential details modal). When false, the chip
   * renders as a static span — used when nested inside other interactive
   * surfaces (e.g. a picker chip with its own remove button).
   */
  interactive?: boolean
  /** Wrap in the standard credential row context menu (right-click). */
  withContextMenu?: boolean
  /** Override the default details-modal open. */
  onClick?: () => void
  /**
   * When set, a trailing close button is rendered inside the chip. Forces
   * `interactive: false` because a button can't be nested inside the chip's
   * own button. Pass an `ariaLabel` describing what's being removed.
   */
  onRemove?: () => void
  removeAriaLabel?: string
}

/**
 * Presentation-only credential chip. Same visual + class names as the
 * TipTap NodeView in wiki-credential-chip.tsx so the chip looks identical
 * inside prose, in pickers, and in lists.
 */
export const WikiCredentialChipView = forwardRef<
  HTMLElement,
  WikiCredentialChipViewProps
>(function WikiCredentialChipView(
  {
    id,
    cred,
    isLoading,
    error,
    selected,
    interactive = true,
    withContextMenu = false,
    onClick,
    onRemove,
    removeAriaLabel,
  },
  ref,
) {
  const openDetails = useCredentialStore((s) => s.openDetailsPanel)
  // `onRemove` embeds a nested button → outer chip can't be a <button>.
  // When both `interactive` and `onRemove` are set we render a `<span
  // role="button">` further down so the chip still left-clicks open the
  // credential details while hosting the inline remove control. The plain
  // non-interactive span path remains for static lists and pickers that
  // opt out of click-to-open.
  const renderAsButton = interactive && !onRemove
  const renderAsClickableSpan = interactive && Boolean(onRemove)
  const removeNode = onRemove ? (
    <ChipRemoveButton
      onClick={onRemove}
      ariaLabel={removeAriaLabel ?? "Remove"}
    />
  ) : null

  // Stable inputs array so the hash effect doesn't churn on unrelated renders.
  const keyContents = useMemo(
    () => cred?.keys.map((k) => k.content) ?? [],
    [cred?.keys],
  )
  const keyHashes = useSha1Hashes(keyContents)

  if (!id) {
    return (
      <BrokenSpan
        ref={ref}
        selected={selected}
        title="This credential reference is missing an id"
        label="Broken reference"
        trailing={removeNode}
      />
    )
  }

  if (isLoading && !cred) {
    return (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        className={cn(
          "wiki-credential-chip wiki-credential-chip--loading",
          selected && "is-selected",
        )}
      >
        <KeyIcon className="size-3.5" />
        <span className="wiki-credential-chip__skel" aria-hidden />
        {removeNode}
      </span>
    )
  }

  if (error || !cred) {
    const forbidden = isForbiddenError(error)
    return (
      <BrokenSpan
        ref={ref}
        selected={selected}
        title={
          forbidden
            ? "You don't have access to this credential in its operation"
            : "Credential not found — it may have been deleted"
        }
        label={forbidden ? "No access" : "Credential deleted"}
        trailing={removeNode}
      />
    )
  }

  const credsSegment = formatCredsSegment(cred.username, cred.password)
  const title = buildTooltip({
    name: cred.name,
    username: cred.username,
    password: cred.password,
    keys: cred.keys,
    hashes: keyHashes,
  })

  const body: ReactNode = (
    <>
      <KeyIcon className="size-3.5 wiki-credential-chip__icon" />
      <span className="wiki-credential-chip__name">{cred.name}</span>
      {credsSegment && (
        <span className="wiki-credential-chip__segment">({credsSegment})</span>
      )}
      {cred.keys.map((k, i) => {
        const hash = keyHashes[i]
        const shortHash = hash ? hash.slice(0, KEY_HASH_DISPLAY_LEN) : null
        return (
          <span
            key={`${k.name}-${i}`}
            className="wiki-credential-chip__segment wiki-credential-chip__segment--key"
            title={hash ? `${k.name}: ${hash}` : `${k.name}: hashing…`}
          >
            ({k.name}:{shortHash ?? "…"})
          </span>
        )
      })}
      {cred.isValid ? (
        <CheckCircle2Icon className="wiki-credential-chip__validity wiki-credential-chip__validity--valid size-3" />
      ) : (
        <XCircleIcon className="wiki-credential-chip__validity wiki-credential-chip__validity--invalid size-3" />
      )}
    </>
  )

  const className = cn(
    "wiki-credential-chip",
    !cred.isValid && "wiki-credential-chip--invalid",
    selected && "is-selected",
  )

  function triggerOpen() {
    if (onClick) onClick()
    else openDetails({ id: cred.id, name: cred.name })
  }

  let chipNode: ReactNode
  if (renderAsButton) {
    chipNode = (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={(e) => {
          e.preventDefault()
          triggerOpen()
        }}
        className={className}
        title={title}
      >
        {body}
      </button>
    )
  } else if (renderAsClickableSpan) {
    chipNode = (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        role="button"
        tabIndex={0}
        className={cn(className, "cursor-pointer")}
        title={title}
        onClick={(e) => {
          e.preventDefault()
          triggerOpen()
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            triggerOpen()
          }
        }}
      >
        {body}
        {removeNode}
      </span>
    )
  } else {
    chipNode = (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        className={className}
        title={title}
      >
        {body}
        {removeNode}
      </span>
    )
  }

  if (withContextMenu) {
    return (
      <CredentialRowContextMenu credential={cred} triggerRender={<span />}>
        {chipNode}
      </CredentialRowContextMenu>
    )
  }

  return chipNode
})

const BrokenSpan = forwardRef<
  HTMLElement,
  {
    selected?: boolean
    title: string
    label: string
    trailing?: ReactNode
  }
>(function BrokenSpan({ selected, title, label, trailing }, ref) {
  return (
    <span
      ref={ref as React.Ref<HTMLSpanElement>}
      className={cn(
        "wiki-credential-chip wiki-credential-chip--missing",
        selected && "is-selected",
      )}
      title={title}
    >
      <KeyIcon className="size-3.5" />
      <span className="wiki-credential-chip__name">{label}</span>
      {trailing}
    </span>
  )
})

// Same trailing remove control as on the wiki document chip. Kept locally
// rather than imported to avoid coupling the two chip view modules.
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

interface WikiCredentialChipByIdProps {
  id: string
  gateOnViewport?: boolean
  selected?: boolean
  interactive?: boolean
  withContextMenu?: boolean
  onClick?: () => void
  onRemove?: () => void
  removeAriaLabel?: string
}

/**
 * Id-driven wrapper that fetches the credential via useCredential and renders
 * the view. Used by both the editor NodeView (with `gateOnViewport`) and the
 * task picker (no gating — the working set is bounded by the picker UI).
 */
export function WikiCredentialChipById({
  id,
  gateOnViewport = false,
  selected,
  interactive = true,
  withContextMenu = false,
  onClick,
  onRemove,
  removeAriaLabel,
}: WikiCredentialChipByIdProps) {
  const { ref, isVisible } = useInViewport<HTMLElement>()
  const effectivelyVisible = gateOnViewport ? isVisible : true
  const { data, isLoading, error } = useCredential(id, {
    enabled: effectivelyVisible,
  })
  const cred = data?.credential
  const showLoading =
    (isLoading && !cred) || (gateOnViewport && !isVisible && !cred)

  return (
    <WikiCredentialChipView
      ref={ref}
      id={id}
      cred={cred}
      isLoading={showLoading}
      error={error}
      selected={selected}
      interactive={interactive}
      withContextMenu={withContextMenu}
      onClick={onClick}
      onRemove={onRemove}
      removeAriaLabel={removeAriaLabel}
    />
  )
}

function formatCredsSegment(username: string, password: string): string | null {
  const hasUser = username.length > 0
  const hasPass = password.length > 0
  if (hasUser && hasPass) return `${username}:${password}`
  if (hasUser) return username
  if (hasPass) return password
  return null
}

interface TooltipArgs {
  name: string
  username: string
  password: string
  keys: readonly { name: string }[]
  hashes: readonly (string | null)[]
}

function buildTooltip({
  name,
  username,
  password,
  keys,
  hashes,
}: TooltipArgs): string {
  const lines = [name]
  const creds = formatCredsSegment(username, password)
  if (creds) lines.push(creds)
  keys.forEach((k, i) => {
    const h = hashes[i] ?? "hashing…"
    lines.push(`${k.name}: ${h}`)
  })
  return lines.join("\n")
}

function isForbiddenError(error: unknown): boolean {
  return (
    error instanceof GraphQLRequestError &&
    error.errors.some((e) => e.extensions?.code === "FORBIDDEN")
  )
}
