import { forwardRef } from "react"

import "./wiki-chips.css"
import { ServerIcon } from "lucide-react"
import { HostIcon } from "@/components/findings/host-icon"
import { useHost } from "@/graphql/hooks/hosts"
import { useHostStore } from "@/stores/hosts"
import { useInViewport } from "@/hooks/use-in-viewport"
import { GraphQLRequestError } from "@/lib/graphql-client"
import { cn } from "@/lib/utils"
import type { HostFieldsFragment } from "@/graphql/gql/graphql"

interface WikiHostChipViewProps {
  id: string
  host?: HostFieldsFragment | null
  isLoading?: boolean
  error?: unknown
  selected?: boolean
}

/**
 * Presentation-only host chip. Same visual language as the credential / hash
 * chips (see wiki-chips.css) but with a slate "infrastructure" accent and the
 * host's own glyph (emoji / lucide icon / OS-derived Tux/Windows/Server) in
 * place of the credential's key. Always click-to-open: clicking opens the host
 * dialog (the app's host detail + edit surface), seeded from the live node so
 * interfaces / routes / logins are already present.
 *
 * The host record is fetched live via `useHost` — the node persists only
 * `hostId`, so renames and topology edits flow through without rewriting the
 * document. Sibling of WikiHashChipView.
 */
export const WikiHostChipView = forwardRef<HTMLElement, WikiHostChipViewProps>(
  function WikiHostChipView({ id, host, isLoading, error, selected }, ref) {
    const openHost = useHostStore((s) => s.openEditDialog)

    if (!id) {
      return (
        <BrokenSpan
          ref={ref}
          selected={selected}
          title="This host reference is missing an id"
          label="Broken reference"
        />
      )
    }

    if (isLoading && !host) {
      return (
        <span
          ref={ref as React.Ref<HTMLSpanElement>}
          className={cn(
            "wiki-host-chip wiki-host-chip--loading",
            selected && "is-selected",
          )}
        >
          <ServerIcon className="size-3.5" />
          <span className="wiki-host-chip__skel" aria-hidden />
        </span>
      )
    }

    if (error || !host) {
      const forbidden = isForbiddenError(error)
      return (
        <BrokenSpan
          ref={ref}
          selected={selected}
          title={
            forbidden
              ? "You don't have access to this host in its operation"
              : "Host not found — it may have been deleted"
          }
          label={forbidden ? "No access" : "Host deleted"}
        />
      )
    }

    const label = host.hostname || "Unnamed host"
    const title = host.os ? `${label}\n${host.os}` : label

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={(e) => {
          e.preventDefault()
          openHost(host)
        }}
        className={cn("wiki-host-chip", selected && "is-selected")}
        title={title}
      >
        <HostIcon
          emoji={host.emoji}
          icon={host.icon}
          color={host.color}
          os={host.os}
          size={14}
          className="wiki-host-chip__icon"
        />
        <span className="wiki-host-chip__name">{label}</span>
      </button>
    )
  },
)

const BrokenSpan = forwardRef<
  HTMLElement,
  { selected?: boolean; title: string; label: string }
>(function BrokenSpan({ selected, title, label }, ref) {
  return (
    <span
      ref={ref as React.Ref<HTMLSpanElement>}
      className={cn(
        "wiki-host-chip wiki-host-chip--missing",
        selected && "is-selected",
      )}
      title={title}
    >
      <ServerIcon className="size-3.5" />
      <span className="wiki-host-chip__name">{label}</span>
    </span>
  )
})

interface WikiHostChipByIdProps {
  id: string
  gateOnViewport?: boolean
  selected?: boolean
}

/**
 * Id-driven wrapper that fetches the host via useHost and renders the view.
 * Used by the editor NodeView with `gateOnViewport` so a long document with
 * many inline chips doesn't fan out one request per chip on mount. Mirrors
 * WikiHashChipById.
 */
export function WikiHostChipById({
  id,
  gateOnViewport = false,
  selected,
}: WikiHostChipByIdProps) {
  const { ref, isVisible } = useInViewport<HTMLElement>()
  const effectivelyVisible = gateOnViewport ? isVisible : true
  const { data, isLoading, error } = useHost(id, {
    enabled: effectivelyVisible,
  })
  const host = data?.host
  const showLoading =
    (isLoading && !host) || (gateOnViewport && !isVisible && !host)

  return (
    <WikiHostChipView
      ref={ref}
      id={id}
      host={host}
      isLoading={showLoading}
      error={error}
      selected={selected}
    />
  )
}

function isForbiddenError(error: unknown): boolean {
  return (
    error instanceof GraphQLRequestError &&
    error.errors.some((e) => e.extensions?.code === "FORBIDDEN")
  )
}
