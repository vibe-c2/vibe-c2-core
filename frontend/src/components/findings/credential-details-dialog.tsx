import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import {
  CheckCircle2Icon,
  CheckIcon,
  CopyIcon,
  KeyIcon,
  LinkIcon,
  PencilIcon,
  TrashIcon,
  XCircleIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { useAuthStore } from "@/stores/auth"
import { useCredentialStore } from "@/stores/credentials"
import { useHashStore } from "@/stores/hashes"
import {
  useCredential,
  useAddCredentialComment,
  useUpdateCredentialComment,
  useDeleteCredentialComment,
  useCredentialSourceHashes,
} from "@/graphql/hooks/credentials"
import { credentialTypeLabel } from "@/components/findings/credential-type-utils"
import { CredentialBacklinkList } from "@/components/findings/credential-backlink-list"
import { buildCredentialShareUrl } from "@/components/findings/credential-share-link"
import type { CredentialCommentFieldsFragment } from "@/graphql/gql/graphql"

export function CredentialDetailsDialog() {
  const { detailsPanelOpen, selected, closeDetailsPanel, openEditDialog } =
    useCredentialStore()
  const { data, isLoading, isError } = useCredential(selected?.id ?? "")
  const credential = data?.credential

  // Prefer the freshly-loaded name; fall back to the row's name (when opened
  // from a row click) and finally to a generic label (when opened via
  // ?credential=<id> deep link before the query resolves).
  const title = credential?.name || selected?.name || "Credential"
  const shareableId = credential?.id ?? selected?.id ?? null

  return (
    <Dialog
      open={detailsPanelOpen}
      onOpenChange={(open) => {
        if (!open) closeDetailsPanel()
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        {shareableId && (
          <CopyShareLinkButton
            credentialId={shareableId}
            className="absolute top-2 right-10"
          />
        )}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-16">
            <KeyIcon className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{title}</span>
          </DialogTitle>
          <DialogDescription>
            Credential details, tags, and comments.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : !credential || isError ? (
          // Conflates "deleted" and "no access" deliberately — leaking
          // existence to non-members is worse than the slight UX cost. The
          // backend gates `credential(id)` on operation membership, so this
          // branch covers both cases.
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center text-sm">
            <p className="font-medium text-foreground">
              Credential not found
            </p>
            <p className="max-w-sm text-muted-foreground">
              This credential may have been deleted, or you don't have access
              to the operation it belongs to. Ask the operation admin to add
              you if you should have access.
            </p>
            <Button variant="outline" size="sm" onClick={closeDetailsPanel}>
              Close
            </Button>
          </div>
        ) : (
          // min-w-0 is load-bearing: DialogContent is a CSS grid, and grid
          // items default to min-width:min-content. Without this, a single
          // unbreakable string in the backlinks list (e.g. a long Cyrillic
          // wiki title) would force the dialog wider than its max-width.
          <div className="flex min-w-0 flex-col gap-6">
            <section className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {credentialTypeLabel(credential.type)}
                </Badge>
                {credential.isValid ? (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2Icon className="size-3" />
                    Valid
                  </Badge>
                ) : (
                  <Badge variant="ghost" className="gap-1">
                    <XCircleIcon className="size-3" />
                    Invalid
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="ms-auto"
                  onClick={() =>
                    openEditDialog({ id: credential.id, name: credential.name })
                  }
                >
                  <PencilIcon className="size-3.5" />
                  Edit
                </Button>
              </div>

              <FieldRow
                label="Username"
                value={credential.username || "—"}
                copyValue={credential.username}
                copyLabel="username"
              />
              <FieldRow
                label="Password"
                value={credential.password || "—"}
                copyValue={credential.password}
                copyLabel="password"
                mono
              />

              {credential.keys.length > 0 && (
                <div>
                  <div className="text-xs uppercase text-muted-foreground">
                    Keys
                  </div>
                  <div className="mt-1 flex flex-col gap-2">
                    {credential.keys.map((k, i) => {
                      const copyLabel = k.name?.trim() || `Key ${i + 1}`
                      return (
                        <div
                          key={i}
                          className="rounded-md border bg-muted/30 p-2"
                        >
                          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                            <span className="min-w-0 flex-1 truncate">
                              {k.name || (
                                <span className="text-muted-foreground italic">
                                  Unnamed key
                                </span>
                              )}
                            </span>
                            <CopyIconButton
                              value={k.content}
                              label={copyLabel}
                            />
                          </div>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-xs">
                            {k.content}
                          </pre>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {credential.properties.length > 0 && (
                <div>
                  <div className="text-xs uppercase text-muted-foreground">
                    Properties
                  </div>
                  <div className="mt-1 flex flex-col gap-1">
                    {credential.properties.map((p) => (
                      <div
                        key={p.name}
                        className="grid grid-cols-[10rem_1fr_auto] items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-sm"
                      >
                        <span className="truncate font-medium" title={p.name}>
                          {p.name}
                        </span>
                        <span className="break-words text-muted-foreground">
                          {p.value || "—"}
                        </span>
                        <div className="justify-self-end">
                          {p.value ? (
                            <CopyIconButton value={p.value} label={p.name} />
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Tags
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {credential.tags.length === 0 ? (
                    <span className="text-sm text-muted-foreground">—</span>
                  ) : (
                    credential.tags.map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Created by {credential.createdBy?.username ?? "Unknown"} on{" "}
                <FormattedDateTimeText date={credential.createdAt} />
              </div>
            </section>

            <CredentialBacklinkList credentialId={credential.id} />

            <CredentialSourceHashesList credentialId={credential.id} />

            <CommentsSection
              credentialId={credential.id}
              comments={credential.comments}
              canModerate={credential.viewerCanModerateComments}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function FieldRow({
  label,
  value,
  copyValue,
  copyLabel,
  mono,
}: {
  label: string
  value: string
  copyValue?: string
  copyLabel?: string
  mono?: boolean
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr_auto] items-center gap-2">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div
        className={
          mono ? "font-mono break-all" : "break-words"
        }
      >
        {value}
      </div>
      <div className="justify-self-end">
        {copyValue ? (
          <CopyIconButton value={copyValue} label={copyLabel ?? label} />
        ) : null}
      </div>
    </div>
  )
}

const COPIED_RESET_MS = 1500

// Copies a shareable deep-link URL to the credential. Pairs with the
// `?credential=<id>` consumer in `pages/findings.tsx`.
function CopyShareLinkButton({
  credentialId,
  className,
}: {
  credentialId: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildCredentialShareUrl(credentialId))
      setCopied(true)
      toast.success("Link copied")
      setTimeout(() => setCopied(false), COPIED_RESET_MS)
    } catch {
      toast.error("Failed to copy link")
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={handleCopy}
      aria-label="Copy link to this credential"
      title="Copy link to this credential"
      className={className}
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <LinkIcon className="size-3.5" />
      )}
    </Button>
  )
}

// Tiny inline copy-to-clipboard button. Shows a check icon on success and
// resets after a short delay; surfaces clipboard errors via sonner.
function CopyIconButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(`Copied ${label}`)
      setTimeout(() => setCopied(false), COPIED_RESET_MS)
    } catch {
      toast.error(`Failed to copy ${label}`)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={handleCopy}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </Button>
  )
}

interface CommentsSectionProps {
  credentialId: string
  comments: readonly CredentialCommentFieldsFragment[]
  canModerate: boolean
}

function CommentsSection({ credentialId, comments, canModerate }: CommentsSectionProps) {
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const addComment = useAddCredentialComment()
  const currentUserId = useAuthStore((s) => s.user?.userId)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!text.trim()) return
    setError(null)
    try {
      await addComment.mutateAsync({ credentialId, text })
      setText("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add comment")
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Comments ({comments.length})</h3>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              credentialId={credentialId}
              comment={c}
              isOwn={c.author?.id === currentUserId}
              canModerate={canModerate}
            />
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        {error && (
          <div className="rounded-md bg-destructive/15 p-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <Textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment..."
        />
        <div className="self-end">
          <Button
            type="submit"
            size="sm"
            disabled={addComment.isPending || !text.trim()}
          >
            {addComment.isPending ? "Posting..." : "Post comment"}
          </Button>
        </div>
      </form>
    </section>
  )
}

interface CommentRowProps {
  credentialId: string
  comment: CredentialCommentFieldsFragment
  isOwn: boolean
  canModerate: boolean
}

function CommentRow({ credentialId, comment, isOwn, canModerate }: CommentRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.text)
  const [error, setError] = useState<string | null>(null)
  const updateComment = useUpdateCredentialComment()
  const deleteComment = useDeleteCredentialComment()

  async function handleSave() {
    setError(null)
    try {
      await updateComment.mutateAsync({
        credentialId,
        commentId: comment.id,
        text: draft,
      })
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update comment")
    }
  }

  async function handleDelete() {
    setError(null)
    try {
      await deleteComment.mutateAsync({ credentialId, commentId: comment.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete comment")
    }
  }

  return (
    <li className="rounded-md border bg-muted/30 p-3 text-sm">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {comment.author?.username ?? "Deleted user"}
        </span>
        <span>·</span>
        <FormattedDateTimeText date={comment.createdAt} />
        {comment.updatedAt !== comment.createdAt && (
          <>
            <span>·</span>
            <span>edited</span>
          </>
        )}
        {!editing && (isOwn || canModerate) && (
          <div className="ms-auto flex gap-1">
            {isOwn && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setDraft(comment.text)
                  setEditing(true)
                }}
                aria-label="Edit comment"
              >
                <PencilIcon className="size-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleDelete}
              disabled={deleteComment.isPending}
              aria-label="Delete comment"
            >
              <TrashIcon className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      {error && (
        <div className="mb-1 rounded-md bg-destructive/15 p-1.5 text-xs text-destructive">
          {error}
        </div>
      )}
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={updateComment.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={
                updateComment.isPending ||
                !draft.trim() ||
                draft === comment.text
              }
            >
              {updateComment.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words">{comment.text}</p>
      )}
    </li>
  )
}

// CredentialSourceHashesList renders chips for every hash that produced this
// credential via markHashCracked. Clicking a chip closes the credential
// dialog and opens the hash details dialog so the operator can pivot
// between the two findings tabs without losing context. Hidden when the
// credential has no source hashes (the common case for hand-entered creds).
function CredentialSourceHashesList({ credentialId }: { credentialId: string }) {
  const { data, isLoading } = useCredentialSourceHashes(credentialId)
  const closeCredentialPanel = useCredentialStore((s) => s.closeDetailsPanel)
  const openHashDetails = useHashStore((s) => s.openDetailsPanel)
  const hashes = data?.credential?.sourceHashes ?? []
  if (isLoading || hashes.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Source hashes
      </h3>
      <div className="flex flex-wrap gap-2">
        {hashes.map((h) => {
          const label = h.username
            ? h.domain
              ? `${h.domain}\\${h.username}`
              : h.username
            : h.hashType
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => {
                closeCredentialPanel()
                openHashDetails({ id: h.id, label })
              }}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs hover:bg-muted"
              title={h.value}
            >
              <span className="font-medium">{label}</span>
              <span className="text-muted-foreground">{h.hashType}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
