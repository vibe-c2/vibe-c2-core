import { useMemo, type RefObject } from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { CheckCircle2Icon, KeyIcon, XCircleIcon } from "lucide-react"
import { CredentialRowContextMenu } from "@/components/findings/credential-row-context-menu"
import { useCredential } from "@/graphql/hooks/credentials"
import { useCredentialStore } from "@/stores/credentials"
import { useInViewport } from "@/hooks/use-in-viewport"
import { GraphQLRequestError } from "@/lib/graphql-client"
import { useSha1Hashes } from "@/lib/sha1"
import { cn } from "@/lib/utils"

// Short prefix length used to render a key's SHA-1 in the chip body. The full
// digest is 40 hex chars — far too wide to sit inline between prose tokens
// without truncation, and truncation hides the closing `)`. 12 chars (48 bits)
// is enough to eyeball-distinguish keys at a glance; the full digest stays
// available in the chip's title tooltip and the right-click context menu.
const KEY_HASH_DISPLAY_LEN = 12

/**
 * NodeView for `WikiCredentialReferenceExtension`. Hydrates the chip from the
 * live credential via `useCredential`; click opens the same details modal as
 * a Findings table row, right-click surfaces the same per-row context menu.
 *
 * The chip is meant to sit inline between prose tokens — see the surrounding
 * CSS in `wiki-editor.css`. Beyond the credential name we surface
 * `(username:password)` and one `(key_name:sha1)` segment per attached key so
 * the chip carries enough context to read in flow without leaking the secret
 * itself (the password value is still rendered though — the operator is in
 * their own operation's wiki, and password column visibility already mirrors
 * the Findings table that owns the credential).
 *
 * Three failure modes render as inert placeholders (chip-shaped, but no
 * click/context-menu wiring), so the prose flow stays intact when the
 * referenced credential is missing, deleted, or inaccessible.
 */
export function WikiCredentialChip({ node, selected }: NodeViewProps) {
  const id = (node.attrs.credentialId as string | null) ?? ""
  // Defer the GraphQL fetch until this chip is actually about to scroll
  // into view. A long doc with many inline credential references used to
  // fire one round trip per chip on mount and pulse every skeleton chip
  // until each settled; gating on intersection turns that into a steady
  // stream as the user scrolls. The 200px rootMargin (set inside the hook)
  // pre-fetches one near-viewport chip ahead so the user rarely watches
  // a skeleton swap to loaded.
  // Use HTMLElement as the type parameter so the same ref can attach to a
  // <span> (broken/loading/missing branches) or a <button> (loaded branch).
  const { ref, isVisible } = useInViewport<HTMLElement>()
  const { data, isLoading, error } = useCredential(id, { enabled: isVisible })
  const openDetails = useCredentialStore((s) => s.openDetailsPanel)
  const cred = data?.credential

  // Hash key material asynchronously — keep the inputs array reference stable
  // across renders so the hash effect doesn't churn on unrelated re-renders.
  const keyContents = useMemo(
    () => cred?.keys.map((k) => k.content) ?? [],
    [cred?.keys],
  )
  const keyHashes = useSha1Hashes(keyContents)

  if (!id) {
    return (
      <NodeViewWrapper as="span" className="wiki-credential-chip-wrapper">
        <span
          ref={ref}
          className={cn(
            "wiki-credential-chip wiki-credential-chip--missing",
            selected && "is-selected",
          )}
          title="This credential reference is missing an id"
        >
          <KeyIcon className="size-3.5" />
          <span className="wiki-credential-chip__name">Broken reference</span>
        </span>
      </NodeViewWrapper>
    )
  }

  // While offscreen (`!isVisible`) the query is gated off, so `cred` is
  // undefined and `isLoading` is false. Render the same skeleton we show
  // while the query is pending so the inline column-flow stays stable.
  if ((isLoading && !cred) || (!isVisible && !cred)) {
    return (
      <NodeViewWrapper as="span" className="wiki-credential-chip-wrapper">
        <span
          ref={ref}
          className={cn(
            "wiki-credential-chip wiki-credential-chip--loading",
            selected && "is-selected",
          )}
        >
          <KeyIcon className="size-3.5" />
          <span className="wiki-credential-chip__skel" aria-hidden />
        </span>
      </NodeViewWrapper>
    )
  }

  if (error || !cred) {
    const forbidden = isForbiddenError(error)
    return (
      <NodeViewWrapper as="span" className="wiki-credential-chip-wrapper">
        <span
          ref={ref}
          className={cn(
            "wiki-credential-chip wiki-credential-chip--missing",
            selected && "is-selected",
          )}
          title={
            forbidden
              ? "You don't have access to this credential in its operation"
              : "Credential not found — it may have been deleted"
          }
        >
          <KeyIcon className="size-3.5" />
          <span className="wiki-credential-chip__name">
            {forbidden ? "No access" : "Credential deleted"}
          </span>
        </span>
      </NodeViewWrapper>
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

  return (
    <NodeViewWrapper as="span" className="wiki-credential-chip-wrapper">
      <CredentialRowContextMenu credential={cred} triggerRender={<span />}>
        <button
          ref={ref as RefObject<HTMLButtonElement | null>}
          type="button"
          onClick={(e) => {
            e.preventDefault()
            openDetails({ id: cred.id, name: cred.name })
          }}
          className={cn(
            "wiki-credential-chip",
            !cred.isValid && "wiki-credential-chip--invalid",
            selected && "is-selected",
          )}
          title={title}
        >
          <KeyIcon className="size-3.5 wiki-credential-chip__icon" />
          <span className="wiki-credential-chip__name">{cred.name}</span>
          {credsSegment && (
            <span className="wiki-credential-chip__segment">
              ({credsSegment})
            </span>
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
        </button>
      </CredentialRowContextMenu>
    </NodeViewWrapper>
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
