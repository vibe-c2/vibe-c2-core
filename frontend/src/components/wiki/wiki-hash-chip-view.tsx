import { forwardRef, useState } from "react"

import "./wiki-chips.css"
import { HashIcon, LockIcon, LockOpenIcon, ReplaceIcon } from "lucide-react"
import { HashRowContextMenu } from "@/components/findings/hash-row-context-menu"
import { ContextMenuItem } from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useHash } from "@/graphql/hooks/hashes"
import { useHashStore } from "@/stores/hashes"
import { useInViewport } from "@/hooks/use-in-viewport"
import { GraphQLRequestError } from "@/lib/graphql-client"
import {
  hashStatusLabel,
  truncateHashValue,
} from "@/components/findings/hash-status-utils"
import { cn } from "@/lib/utils"
import type { HashFieldsWithCredentialFragment } from "@/graphql/gql/graphql"

interface WikiHashChipViewProps {
  id: string
  // The full HashFieldsWithCredential — withContextMenu needs the rich shape
  // (status, tags, credentialId) for the row menu, and useHash returns exactly
  // this, so the chip stays strongly typed without a projection.
  hash?: HashFieldsWithCredentialFragment | null
  isLoading?: boolean
  error?: unknown
  selected?: boolean
  /** Wrap in the standard hash row context menu (right-click). */
  withContextMenu?: boolean
  /**
   * When provided AND the hash is cracked with a linked credential, the
   * context menu gains a "Replace with credential reference" action. Performs
   * the in-place node swap in the editor; passed down from the NodeView, which
   * owns the document position. Behind a warning — the swap is irreversible
   * (the hash reference is gone from this document afterwards).
   */
  onReplaceWithCredential?: (credentialId: string) => void
}

/**
 * Presentation-only hash chip. Same visual language as the credential chip
 * (see wiki-chips.css) but with an amber "hash material" accent that flips to
 * emerald once the hash is cracked, and a lock/unlock status glyph in place of
 * the credential's valid/invalid check. Always click-to-open (the details
 * modal) — unlike the credential chip there's no picker-chip / remove-button
 * variant to account for.
 */
export const WikiHashChipView = forwardRef<HTMLElement, WikiHashChipViewProps>(
  function WikiHashChipView(
    {
      id,
      hash,
      isLoading,
      error,
      selected,
      withContextMenu = false,
      onReplaceWithCredential,
    },
    ref,
  ) {
    const openDetails = useHashStore((s) => s.openDetailsPanel)
    const [swapOpen, setSwapOpen] = useState(false)

    if (!id) {
      return (
        <BrokenSpan
          ref={ref}
          selected={selected}
          title="This hash reference is missing an id"
          label="Broken reference"
        />
      )
    }

    if (isLoading && !hash) {
      return (
        <span
          ref={ref as React.Ref<HTMLSpanElement>}
          className={cn(
            "wiki-hash-chip wiki-hash-chip--loading",
            selected && "is-selected",
          )}
        >
          <HashIcon className="size-3.5" />
          <span className="wiki-hash-chip__skel" aria-hidden />
        </span>
      )
    }

    if (error || !hash) {
      const forbidden = isForbiddenError(error)
      return (
        <BrokenSpan
          ref={ref}
          selected={selected}
          title={
            forbidden
              ? "You don't have access to this hash in its operation"
              : "Hash not found — it may have been deleted"
          }
          label={forbidden ? "No access" : "Hash deleted"}
        />
      )
    }

    const cracked = hash.status === "CRACKED"
    const label = truncateHashValue(hash.value)
    const title = `${hash.value}\n${hashStatusLabel(hash.status)}`

    const chipNode = (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={(e) => {
          e.preventDefault()
          openDetails({ id: hash.id, label })
        }}
        className={cn(
          "wiki-hash-chip",
          cracked && "wiki-hash-chip--cracked",
          selected && "is-selected",
        )}
        title={title}
      >
        <HashIcon className="size-3.5 wiki-hash-chip__icon" />
        <span className="wiki-hash-chip__name">{label}</span>
        {cracked ? (
          <LockOpenIcon className="wiki-hash-chip__status wiki-hash-chip__status--cracked size-3" />
        ) : (
          <LockIcon className="wiki-hash-chip__status wiki-hash-chip__status--uncracked size-3" />
        )}
      </button>
    )

    if (!withContextMenu) return chipNode

    // The swap is only meaningful once a hash is cracked AND carries a linked
    // credential — that's the credential the new chip will point at.
    const canSwap =
      Boolean(onReplaceWithCredential) && cracked && Boolean(hash.credentialId)

    return (
      <>
        <HashRowContextMenu
          hash={hash}
          triggerRender={<span />}
          extraItems={
            canSwap ? (
              <ContextMenuItem onClick={() => setSwapOpen(true)}>
                <ReplaceIcon className="size-4" />
                Replace with credential reference
              </ContextMenuItem>
            ) : null
          }
        >
          {chipNode}
        </HashRowContextMenu>
        {canSwap && (
          <SwapToCredentialDialog
            open={swapOpen}
            onOpenChange={setSwapOpen}
            hashLabel={label}
            onConfirm={() => {
              onReplaceWithCredential?.(hash.credentialId as string)
              setSwapOpen(false)
            }}
          />
        )}
      </>
    )
  },
)

// Warns before swapping a cracked hash chip for its linked credential chip.
// The swap rewrites the document node in place: after confirming, the hash
// reference is gone from this page and a credential reference takes its spot.
// We surface that as irreversible — the hash record itself is untouched in
// Findings, but this document no longer points at it.
function SwapToCredentialDialog({
  open,
  onOpenChange,
  hashLabel,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  hashLabel: string
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Replace with credential reference</DialogTitle>
          <DialogDescription>
            This replaces the hash reference{" "}
            <strong className="font-mono">{hashLabel}</strong> with a reference
            to the credential it was cracked into.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
          This can&apos;t be undone — the hash reference will be removed from
          this document. The hash itself stays in Findings.
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Replace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const BrokenSpan = forwardRef<
  HTMLElement,
  { selected?: boolean; title: string; label: string }
>(function BrokenSpan({ selected, title, label }, ref) {
  return (
    <span
      ref={ref as React.Ref<HTMLSpanElement>}
      className={cn(
        "wiki-hash-chip wiki-hash-chip--missing",
        selected && "is-selected",
      )}
      title={title}
    >
      <HashIcon className="size-3.5" />
      <span className="wiki-hash-chip__name">{label}</span>
    </span>
  )
})

interface WikiHashChipByIdProps {
  id: string
  gateOnViewport?: boolean
  selected?: boolean
  withContextMenu?: boolean
  onReplaceWithCredential?: (credentialId: string) => void
}

/**
 * Id-driven wrapper that fetches the hash via useHash and renders the view.
 * Used by the editor NodeView with `gateOnViewport` so a long document with
 * many inline chips doesn't fan out one request per chip on mount. Mirrors
 * WikiCredentialChipById.
 */
export function WikiHashChipById({
  id,
  gateOnViewport = false,
  selected,
  withContextMenu = false,
  onReplaceWithCredential,
}: WikiHashChipByIdProps) {
  const { ref, isVisible } = useInViewport<HTMLElement>()
  const effectivelyVisible = gateOnViewport ? isVisible : true
  const { data, isLoading, error } = useHash(id, {
    enabled: effectivelyVisible,
  })
  const hash = data?.hash
  const showLoading =
    (isLoading && !hash) || (gateOnViewport && !isVisible && !hash)

  return (
    <WikiHashChipView
      ref={ref}
      id={id}
      hash={hash}
      isLoading={showLoading}
      error={error}
      selected={selected}
      withContextMenu={withContextMenu}
      onReplaceWithCredential={onReplaceWithCredential}
    />
  )
}

function isForbiddenError(error: unknown): boolean {
  return (
    error instanceof GraphQLRequestError &&
    error.errors.some((e) => e.extensions?.code === "FORBIDDEN")
  )
}
