import { forwardRef, type MouseEvent, type ReactNode } from "react"

import "./wiki-chips.css"
import { Link, useNavigate } from "react-router"
import { FileTextIcon, LinkIcon, XIcon } from "lucide-react"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { useWikiDocumentLite } from "@/graphql/hooks/wiki"
import { useInViewport } from "@/hooks/use-in-viewport"
import { GraphQLRequestError } from "@/lib/graphql-client"
import { cn } from "@/lib/utils"

// Doc shape the view needs. Mirrors `WikiDocumentLiteFields` so the same
// projection feeds both the editor NodeView and any non-editor surface that
// fetched the doc by some other means.
export interface WikiDocumentChipDoc {
  id: string
  title: string
  emoji?: string | null
  icon?: string | null
  color?: string | null
  isTemplate?: boolean | null
  deletedAt?: string | null
}

interface WikiDocumentChipViewProps {
  /** Document id; only used to decide the "missing id" placeholder branch. */
  id: string
  /** Loaded doc, or undefined while loading / on error. */
  doc?: WikiDocumentChipDoc | null
  isLoading?: boolean
  error?: unknown
  /** Marks the chip selected (driven by ProseMirror in the editor, optional elsewhere). */
  selected?: boolean
  /**
   * When `interactive` is true, the loaded chip renders as a `<Link>` to
   * `/wiki/:id` (or a button when `onClick` is supplied). When false, it
   * renders as a static span — used inside other interactive surfaces
   * (e.g. a task picker chip with its own remove button) so we don't nest
   * an anchor inside a button.
   */
  interactive?: boolean
  /** Override the default Link navigation with a button click handler. */
  onClick?: () => void
  /**
   * When set, a trailing close button is rendered inside the chip. Providing
   * this prop forces `interactive: false` because a button can't be nested
   * inside the chip's own Link/button — the chip becomes a passive container
   * holding the content plus the remove control.
   */
  onRemove?: () => void
  /** Accessible label for the remove button. Falls back to "Remove". */
  removeAriaLabel?: string
}

/**
 * Presentation-only Wiki document chip. Same visual + class names as the
 * TipTap NodeView (see wiki-document-chip.tsx) so the chip looks identical
 * in prose, in pickers, and in lists.
 *
 * The four failure branches (missing id, loading, fetch error, deleted)
 * mirror the editor chip exactly — keep them in sync if the chip's visual
 * language evolves.
 */
export const WikiDocumentChipView = forwardRef<
  HTMLElement,
  WikiDocumentChipViewProps
>(function WikiDocumentChipView(
  {
    id,
    doc,
    isLoading,
    error,
    selected,
    interactive = true,
    onClick,
    onRemove,
    removeAriaLabel,
  },
  ref,
) {
  // Three render modes, same shape as the credential chip:
  //   - renderAsLink: plain interactive chip (no remove button) → real <Link>
  //     to /wiki/:id, preserving ctrl/cmd/middle-click "open in new tab".
  //   - renderAsClickableSpan: interactive + onRemove → <span role="button">
  //     that navigates programmatically, with modifier-aware new-tab fallback.
  //     Used by task-card / credential-card reference chips that want both
  //     click-to-navigate and an inline X remove.
  //   - non-interactive span: opt-out path for static lists / pickers that
  //     deliberately suppress click-to-open.
  const navigate = useNavigate()
  const renderAsLink = interactive && !onRemove
  const renderAsClickableSpan = interactive && Boolean(onRemove)
  const removeNode = onRemove ? (
    <ChipRemoveButton
      onClick={onRemove}
      ariaLabel={removeAriaLabel ?? "Remove"}
    />
  ) : null
  if (!id) {
    return (
      <BrokenSpan
        ref={ref}
        selected={selected}
        title="This document reference is missing an id"
        label="Broken reference"
        icon={<LinkIcon className="size-3.5" />}
        trailing={removeNode}
      />
    )
  }

  if (isLoading && !doc) {
    return (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        className={cn(
          "wiki-document-chip wiki-document-chip--loading",
          selected && "is-selected",
        )}
      >
        <FileTextIcon className="size-3.5" />
        <span className="wiki-document-chip__skel" aria-hidden />
        {removeNode}
      </span>
    )
  }

  if (error || !doc) {
    const forbidden = isForbiddenError(error)
    return (
      <BrokenSpan
        ref={ref}
        selected={selected}
        title={
          forbidden
            ? "You don't have access to this document"
            : "Document not found — it may have been deleted"
        }
        label={forbidden ? "No access" : "Document deleted"}
        icon={<FileTextIcon className="size-3.5" />}
        trailing={removeNode}
      />
    )
  }

  const isDeleted = !!doc.deletedAt
  const displayTitle = doc.title || "Untitled"
  const body: ReactNode = (
    <>
      <span className="wiki-document-chip__icon">
        <DocumentIcon
          emoji={doc.emoji}
          icon={doc.icon}
          color={doc.color}
          isTemplate={!!doc.isTemplate}
        />
      </span>
      <span className="wiki-document-chip__name">{displayTitle}</span>
    </>
  )

  if (isDeleted) {
    return (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        className={cn(
          "wiki-document-chip wiki-document-chip--missing",
          selected && "is-selected",
        )}
        aria-disabled="true"
        title="This document is in the trash"
      >
        {body}
        {removeNode}
      </span>
    )
  }

  if (onClick && !onRemove) {
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={onClick}
        className={cn("wiki-document-chip", selected && "is-selected")}
        title={displayTitle}
      >
        {body}
      </button>
    )
  }

  if (renderAsLink) {
    return (
      <Link
        ref={ref as React.Ref<HTMLAnchorElement>}
        to={`/wiki/${doc.id}`}
        className={cn("wiki-document-chip", selected && "is-selected")}
        title={displayTitle}
      >
        {body}
      </Link>
    )
  }

  if (renderAsClickableSpan) {
    // Navigates programmatically. `useNavigate` doesn't honour modifier keys
    // the way <Link> does, so we forward plain-click → SPA navigation but
    // ctrl/cmd/middle-click → window.open with rel=noopener, preserving the
    // operator's "open in new tab" muscle memory while we stay inside a span
    // (a <Link> can't contain the remove <button>).
    const handleOpen = (e: MouseEvent<HTMLSpanElement>) => {
      e.preventDefault()
      if (onClick) {
        onClick()
        return
      }
      const href = `/wiki/${doc.id}`
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
        window.open(href, "_blank", "noopener,noreferrer")
        return
      }
      navigate(href)
    }
    return (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        role="button"
        tabIndex={0}
        className={cn("wiki-document-chip cursor-pointer", selected && "is-selected")}
        title={displayTitle}
        onClick={handleOpen}
        onAuxClick={(e) => {
          // Middle-click on most browsers is button=1 and fires auxclick.
          if (e.button === 1) handleOpen(e)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            if (onClick) onClick()
            else navigate(`/wiki/${doc.id}`)
          }
        }}
      >
        {body}
        {removeNode}
      </span>
    )
  }

  return (
    <span
      ref={ref as React.Ref<HTMLSpanElement>}
      className={cn("wiki-document-chip", selected && "is-selected")}
      title={displayTitle}
    >
      {body}
      {removeNode}
    </span>
  )
})

const BrokenSpan = forwardRef<
  HTMLElement,
  {
    selected?: boolean
    title: string
    label: string
    icon: ReactNode
    trailing?: ReactNode
  }
>(function BrokenSpan({ selected, title, label, icon, trailing }, ref) {
  return (
    <span
      ref={ref as React.Ref<HTMLSpanElement>}
      className={cn(
        "wiki-document-chip wiki-document-chip--missing",
        selected && "is-selected",
      )}
      title={title}
    >
      {icon}
      <span className="wiki-document-chip__name">{label}</span>
      {trailing}
    </span>
  )
})

// Trailing remove control shared across chip branches. Mousedown.preventDefault
// keeps focus on the surrounding form input (e.g. the picker's search field)
// when the operator clicks the X — otherwise the dropdown collapses on blur
// before the removal lands.
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

interface WikiDocumentChipByIdProps {
  id: string
  /**
   * When true, defer the GraphQL fetch until the chip scrolls into view.
   * Editor NodeViews enable this to avoid fanning out a round-trip per
   * inline chip on mount; picker-style usages disable it because the host
   * already controls the working set.
   */
  gateOnViewport?: boolean
  selected?: boolean
  interactive?: boolean
  onClick?: () => void
  onRemove?: () => void
  removeAriaLabel?: string
}

/**
 * Id-driven wrapper that fetches the wiki document and renders the view.
 * Used by both the editor NodeView (with `gateOnViewport`) and any list /
 * picker surface that has a doc id but no loaded entity.
 */
export function WikiDocumentChipById({
  id,
  gateOnViewport = false,
  selected,
  interactive = true,
  onClick,
  onRemove,
  removeAriaLabel,
}: WikiDocumentChipByIdProps) {
  const { ref, isVisible } = useInViewport<HTMLElement>()
  const effectivelyVisible = gateOnViewport ? isVisible : true
  const { data, isLoading, error } = useWikiDocumentLite(id, {
    enabled: effectivelyVisible,
  })
  const doc = data?.wikiDocument

  // While gated and offscreen render the loading skel placeholder so the
  // chip footprint matches what the loaded version will eventually take.
  const showLoading =
    (isLoading && !doc) || (gateOnViewport && !isVisible && !doc)

  return (
    <WikiDocumentChipView
      ref={ref}
      id={id}
      doc={doc}
      isLoading={showLoading}
      error={error}
      selected={selected}
      interactive={interactive}
      onClick={onClick}
      onRemove={onRemove}
      removeAriaLabel={removeAriaLabel}
    />
  )
}

function isForbiddenError(error: unknown): boolean {
  return (
    error instanceof GraphQLRequestError &&
    error.errors.some((e) => e.extensions?.code === "FORBIDDEN")
  )
}
